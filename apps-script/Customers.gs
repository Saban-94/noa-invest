/**
 * Customers.gs — customer index for Noa AI.
 * Read-only aggregation from delivery-note archive + orders tab.
 * Stable key: customerNo (Comax customer number).
 *
 * Web actions (require the existing API_TOKEN auth in doGet):
 *   action=getCustomers
 *   action=getCustomer&customerNo=...
 *   action=searchCustomers&q=...
 *
 * No spreadsheet writes are performed by this module.
 */

function customers_first_(row, keys) {
  for (var i = 0; i < keys.length; i++) {
    var value = row[keys[i]];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function customers_number_(value) {
  var raw = String(value == null ? "" : value).replace(",", ".").replace(/[^\d.-]/g, "");
  var n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function customers_dateValue_(value) {
  var s = String(value || "").trim();
  if (!s) return 0;
  var iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])).getTime();
  var local = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (local) {
    var year = Number(local[3]);
    if (year < 100) year += 2000;
    return new Date(year, Number(local[2]) - 1, Number(local[1])).getTime();
  }
  var parsed = Date.parse(s);
  return Number.isFinite(parsed) ? parsed : 0;
}

function customers_phone_(value) {
  var s = String(value || "").trim();
  if (!s) return "";
  var match = s.match(/(?:\+?972[\s()-]*|0)[\d\s()-]{7,}/);
  return match ? match[0].trim() : s;
}

function customers_uniquePush_(list, value) {
  var s = String(value || "").trim();
  if (s && list.indexOf(s) < 0) list.push(s);
}

function customers_readJson_(output, label) {
  var data = output && typeof output.getContent === "function"
    ? JSON.parse(output.getContent())
    : output;
  if (!data || data.success !== true) {
    throw new Error(label + ": " + String((data && data.error) || "קריאה נכשלה"));
  }
  return data;
}

function customers_buildIndex_(sheetId) {
  var map = Object.create(null);

  // Delivery notes are the primary customer-history source.
  var notesResult = customers_readJson_(
    handleGetNotes({ sheetId: sheetId }),
    "קריאת ארכיון תעודות"
  );
  var notes = Array.isArray(notesResult.notes) ? notesResult.notes : [];

  notes.forEach(function(note) {
    var no = String(note.customerNo || "").trim();
    if (!/^\d{4,}$/.test(no)) return;

    var name = String(note.customer || "").trim();
    var address = String(note.address || note.siteAddress || "").trim();
    var driver = String(note.driver || "").trim();

    if (!map[no]) {
      map[no] = {
        id: no,
        customerNo: no,
        name: name || ("לקוח " + no),
        nameCounts: Object.create(null),
        address: "",
        addresses: [],
        phone: "",
        preferredDriver: "",
        notesCount: 0,
        ordersCount: 0,
        lastNoteId: "",
        lastNoteDate: "",
        lastNoteTime: 0,
        lastActivity: "",
        lastActivityTime: 0,
        lastDeliveryDate: "",
        lastDeliveryTime: 0,
        totalWeightTons: 0,
        balesDepositQty: 0,
        palletsDepositQty: 0,
        recentOrders: [],
        driveUrls: []
      };
    }

    var customer = map[no];
    customer.notesCount++;
    if (name) customer.nameCounts[name] = (customer.nameCounts[name] || 0) + 1;
    if (address) {
      customers_uniquePush_(customer.addresses, address);
      customer.address = address;
    }
    if (driver) customer.preferredDriver = driver;
    var noteDate = String(note.date || "").trim();
    var noteTime = customers_dateValue_(noteDate);
    if (noteTime >= customer.lastNoteTime) {
      customer.lastNoteTime = noteTime;
      customer.lastNoteDate = noteDate;
      customer.lastNoteId = String(note.id || note.docNumber || "");
    }
    if (noteTime >= customer.lastActivityTime) {
      customer.lastActivityTime = noteTime;
      customer.lastActivity = noteDate;
    }
    if (note.driveUrl) customers_uniquePush_(customer.driveUrls, note.driveUrl);
  });

  // Orders enrich phone, delivery details and operational totals.
  // Orders are optional so an archive-only customer index can still be returned.
  var ordersResult = null;
  try {
    ordersResult = customers_readJson_(
      handleGetOrders_({ sheetId: sheetId }),
      "קריאת הזמנות"
    );
  } catch (ordersError) {
    Logger.log("Customers index: orders enrichment unavailable: " + ordersError);
  }

  var orders = ordersResult && Array.isArray(ordersResult.orders) ? ordersResult.orders : [];
  orders.forEach(function(order) {
    var no = String(order.customerNo || "").trim();
    var name = String(order.customer || order.customerName || "").trim();

    if (!/^\d{4,}$/.test(no)) {
      if (!name) return;
      var matchedNo = "";
      Object.keys(map).some(function(key) {
        if (String(map[key].name || "").trim() === name) {
          matchedNo = key;
          return true;
        }
        return false;
      });
      no = matchedNo;
    }
    if (!no) return;

    if (!map[no]) {
      map[no] = {
        id: no,
        customerNo: no,
        name: name || ("לקוח " + no),
        nameCounts: Object.create(null),
        address: "",
        addresses: [],
        phone: "",
        preferredDriver: "",
        notesCount: 0,
        ordersCount: 0,
        lastNoteId: "",
        lastNoteDate: "",
        lastNoteTime: 0,
        lastActivity: "",
        lastActivityTime: 0,
        lastDeliveryDate: "",
        lastDeliveryTime: 0,
        totalWeightTons: 0,
        balesDepositQty: 0,
        palletsDepositQty: 0,
        recentOrders: [],
        driveUrls: []
      };
    }

    var customer = map[no];
    customer.ordersCount++;
    if (name) customer.nameCounts[name] = (customer.nameCounts[name] || 0) + 1;

    var phone = customers_phone_(order.phone || order["איש קשר וטלפון"]);
    if (phone && !customer.phone) customer.phone = phone;

    var address = String(order.address || order["כתובת אספקה"] || "").trim();
    if (address) {
      customers_uniquePush_(customer.addresses, address);
      customer.address = address;
    }
    var driver = String(order.driver || order["נהג / משאית"] || "").trim();
    if (driver) customer.preferredDriver = driver;

    var deliveryDate = String(order.deliveryDate || order.date || order["תאריך אספקה"] || "").trim();
    var deliveryTime = customers_dateValue_(deliveryDate);
    if (deliveryTime >= customer.lastDeliveryTime) {
      customer.lastDeliveryTime = deliveryTime;
      customer.lastDeliveryDate = deliveryDate;
    }
    if (deliveryTime >= customer.lastActivityTime) {
      customer.lastActivityTime = deliveryTime;
      customer.lastActivity = deliveryDate;
    }

    customer.totalWeightTons += customers_number_(order.weightTons || order["משקל (טון)"]);
    customer.balesDepositQty += customers_number_(order.bales60002 || order["פקדון בלות (60002)"]);
    customer.palletsDepositQty += customers_number_(order.pallets60060 || order["פקדון משטחים (60060/60006)"]);

    customer.recentOrders.push({
      id: String(order.id || ""),
      date: deliveryDate,
      time: String(order.deliveryTime || order.window || order["שעה"] || ""),
      address: address,
      driver: driver,
      status: String(order.status || order["סטטוס סידור"] || ""),
      weightTons: customers_number_(order.weightTons || order["משקל (טון)"]),
      itemsText: String(order.itemsText || order["פירוט מוצרים"] || ""),
      noteId: String(order.noteId || order["מס' תעודת משלוח"] || "")
    });
  });

  var customers = Object.keys(map).map(function(key) {
    var c = map[key];
    var bestName = c.name;
    var bestCount = 0;
    Object.keys(c.nameCounts).forEach(function(candidate) {
      if (c.nameCounts[candidate] > bestCount) {
        bestCount = c.nameCounts[candidate];
        bestName = candidate;
      }
    });
    c.recentOrders.sort(function(a, b) {
      return customers_dateValue_(b.date) - customers_dateValue_(a.date);
    });
    return {
      id: c.id,
      customerNo: c.customerNo,
      name: bestName,
      address: c.address || "",
      addresses: c.addresses,
      phone: c.phone || "",
      preferredDriver: c.preferredDriver || "",
      notesCount: c.notesCount,
      ordersCount: c.ordersCount,
      lastNoteId: c.lastNoteId || "",
      lastNoteDate: c.lastNoteDate || "",
      lastActivity: c.lastActivity || "",
      lastDeliveryDate: c.lastDeliveryDate || "",
      totalWeightTons: Math.round(c.totalWeightTons * 100) / 100,
      balesDepositQty: c.balesDepositQty,
      palletsDepositQty: c.palletsDepositQty,
      recentOrders: c.recentOrders.slice(0, 5),
      sampleDriveUrl: c.driveUrls.length ? c.driveUrls[0] : ""
    };
  });

  customers.sort(function(a, b) {
    return String(a.name).localeCompare(String(b.name), "he");
  });
  return customers;
}

function handleGetCustomers_(params) {
  params = params || {};
  var sheetId = String(params.sheetId || (typeof MASTER_SHEET_ID !== "undefined" ? MASTER_SHEET_ID : ""));
  if (!sheetId) return jsonResponse({ success: false, error: "חסר sheetId / MASTER_SHEET_ID" });

  var cacheKey = "customers:v2:" + sheetId;
  var customers = null;
  if (typeof workroomCacheRead_ === "function") {
    var cached = workroomCacheRead_(cacheKey);
    if (cached && Array.isArray(cached.customers)) customers = cached.customers;
  }
  if (!customers) {
    try {
      customers = customers_buildIndex_(sheetId);
      if (typeof workroomCacheWrite_ === "function") {
        workroomCacheWrite_(cacheKey, { customers: customers });
      }
    } catch (error) {
      return jsonResponse({
        success: false,
        error: "getCustomers failed: " + String(error && error.message ? error.message : error)
      });
    }
  }

  var query = String(params.q || "").trim().toLocaleLowerCase();
  var customerNo = String(params.customerNo || "").trim();
  var filtered = customers.filter(function(customer) {
    if (customerNo && customer.customerNo !== customerNo) return false;
    if (!query) return true;
    var haystack = [
      customer.customerNo, customer.name, customer.phone, customer.address,
      (customer.addresses || []).join(" ")
    ].join(" ").toLocaleLowerCase();
    return haystack.indexOf(query) >= 0;
  });

  return jsonResponse({
    success: true,
    customers: filtered,
    source: "notes+orders",
    count: filtered.length,
    fetchedAt: new Date().toISOString()
  });
}

function handleGetCustomer_(params) {
  params = params || {};
  var customerNo = String(params.customerNo || params.id || "").trim();
  if (!customerNo) return jsonResponse({ success: false, error: "חסר customerNo" });
  var all = customers_readJson_(handleGetCustomers_({ sheetId: params.sheetId }), "getCustomer");
  var customer = (all.customers || []).filter(function(c) {
    return String(c.customerNo) === customerNo;
  })[0] || null;
  return jsonResponse({
    success: true,
    customer: customer,
    found: Boolean(customer),
    fetchedAt: all.fetchedAt
  });
}

function handleSearchCustomers_(params) {
  params = params || {};
  return handleGetCustomers_({ sheetId: params.sheetId, q: params.q || "" });
}

/** Manual read-only test for the Apps Script editor. */
function testGetCustomers() {
  var result = customers_readJson_(handleGetCustomers_({}), "testGetCustomers");
  var report = {
    success: result.success,
    count: result.count,
    source: result.source,
    fetchedAt: result.fetchedAt,
    sample: result.customers && result.customers[0] ? result.customers[0] : null
  };
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

// Read-only customer history API. The customer number is the stable join key;
// delivery addresses then connect the Ituran history to the site summary tabs.
function handleGetCustomerHistory_(params) {
  params = params || {};
  var customerNo = String(params.customerNo || "").trim();
  if (!/^\d{4,}$/.test(customerNo)) {
    return { success: false, available: false, error: "מספר לקוח לא תקין" };
  }
  var ss = SpreadsheetApp.openById(params.sheetId || MASTER_SHEET_ID);
  var sourcesAvailable = Boolean(
    ss.getSheetByName("ביקורים_איתוראן") ||
    ss.getSheetByName("היסטוריית_ביקורים") ||
    ss.getSheetByName("אתרי_לקוחות")
  );
  var norm = function(value) {
    return String(value || "").toLowerCase().replace(/["'״׳.,]/g, "").replace(/\s+/g, " ").trim();
  };
  var headerIndex = function(headers, aliases) {
    var normalized = headers.map(norm);
    for (var i = 0; i < aliases.length; i++) {
      var index = normalized.indexOf(norm(aliases[i]));
      if (index >= 0) return index;
    }
    return -1;
  };
  var readRows = function(tabName) {
    var sheet = ss.getSheetByName(tabName);
    if (!sheet || sheet.getLastRow() < 2) return [];
    var values = sheet.getDataRange().getDisplayValues();
    var headers = values.shift().map(function(v) { return String(v || "").trim(); });
    return values.filter(function(row) {
      return row.some(function(cell) { return String(cell || "").trim(); });
    }).map(function(row) { return { headers: headers, row: row }; });
  };
  var visits = [];
  var addressSet = Object.create(null);
  readRows("ביקורים_איתוראן").forEach(function(item) {
    var h = item.headers, r = item.row;
    var noCol = headerIndex(h, ["מס׳ לקוח", "מס' לקוח", "מספר לקוח", "customerNo"]);
    if (noCol < 0 || String(r[noCol] || "").trim() !== customerNo) return;
    var get = function(names) { var i = headerIndex(h, names); return i < 0 ? "" : String(r[i] || "").trim(); };
    var address = get(["כתובת", "כתובת אספקה", "address"]);
    if (address) addressSet[norm(address)] = address;
    visits.push({
      id: get(["key", "מפתח ביקור", "מפתח"]),
      noteId: get(["מס׳ תעודה", "מס' תעודה", "תעודה"]),
      date: get(["תאריך", "date"]),
      customer: get(["לקוח", "שם לקוח", "customer"]),
      customerNo: customerNo,
      address: address,
      driver: get(["נהג", "driver"]),
      truck: get(["משאית", "truck"]),
      arrival: get(["הגעה איתוראן", "איתוראן: הגעה", "הגעה"]),
      departure: get(["עזיבה איתוראן", "יציאה איתוראן", "איתוראן: יציאה", "עזיבה"]),
      stayMinutes: get(["שהייה דק׳", "שהייה דק'", "משך עצירה (דק׳)", "משך עצירה (דק')"]),
      ptoMinutes: get(["PTO דק׳", "PTO משך (דק׳)", "PTO משך (דק')"])
    });
  });
  var history = [];
  readRows("היסטוריית_ביקורים").forEach(function(item) {
    var h = item.headers, r = item.row;
    var get = function(names) { var i = headerIndex(h, names); return i < 0 ? "" : String(r[i] || "").trim(); };
    var address = get(["כתובת", "כתובת אתר", "address"]);
    if (!address || !addressSet[norm(address)]) return;
    history.push({
      id: get(["מפתח ביקור", "key", "מפתח"]),
      date: get(["תאריך", "date"]),
      address: address,
      city: get(["עיר", "city"]),
      customers: get(["לקוחות", "לקוח", "שם לקוח", "customer"]),
      deliveryNotes: get(["תעודות", "מס׳ תעודה", "מס' תעודה"]),
      unloadMinutes: get(["פריקה בכתב יד (דק׳)", "פריקה בכתב יד (דק')", "זמן פריקה (דק׳)", "זמן פריקה (דק')"]),
      waitMinutes: get(["המתנה בכתב יד (דק׳)", "המתנה בכתב יד (דק')"]),
      stayMinutes: get(["איתוראן: משך עצירה (דק׳)", "איתוראן: משך עצירה (דק')", "שהייה דק׳"]),
      arrival: get(["איתוראן: הגעה", "הגעה איתוראן"]),
      departure: get(["איתוראן: יציאה", "עזיבה איתוראן"])
    });
  });
  var sites = [];
  readRows("אתרי_לקוחות").forEach(function(item) {
    var h = item.headers, r = item.row;
    var get = function(names) { var i = headerIndex(h, names); return i < 0 ? "" : String(r[i] || "").trim(); };
    var address = get(["כתובת", "address"]);
    if (!address || !addressSet[norm(address)]) return;
    sites.push({
      address: address,
      city: get(["עיר", "city"]),
      visits: get(["ביקורים", "מספר ביקורים"]),
      lastVisit: get(["ביקור אחרון"]),
      measurements: get(["מדידות"]),
      medianStayMinutes: get(["באתר חציון (דק׳)", "באתר חציון (דק')"]),
      p80StayMinutes: get(["באתר P80 (דק׳)", "באתר P80 (דק')"]),
      maxStayMinutes: get(["באתר מקס׳ (דק׳)", "באתר מקס' (דק')"]),
      medianTravelMinutes: get(["נסיעה חציון (דק׳)", "נסיעה חציון (דק')"]),
      confidence: get(["ביטחון"])
    });
  });
  return {
    success: true,
    available: sourcesAvailable,
    customerNo: customerNo,
    visits: visits,
    history: history,
    sites: sites,
    fetchedAt: new Date().toISOString()
  };
}
