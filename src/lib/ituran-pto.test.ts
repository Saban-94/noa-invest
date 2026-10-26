import { afterEach, describe, expect, it, vi } from "vitest";
import { extractPtoQuery, fetchIturanPto, filterPtoEvents, formatPtoAnswer } from "./ituran-pto";

describe("ituran-pto", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("extracts truck from full plate, driver name and known prefix", () => {
    expect(extractPtoQuery("מתי נפתח מנוף 615-41-002?")).toEqual({ truck: "615-41-002" });
    expect(extractPtoQuery("מתי חכמת פתחה מנוף?")).toEqual({
      truck: "615-41-002",
      driverName: "חכמת",
    });
    expect(extractPtoQuery("באיזו כתובת נפתח מנוף 615?")).toEqual({ truck: "615-41-002" });
    expect(extractPtoQuery("מנוף 651?")).toEqual({ platePrefix: "651" });
    expect(extractPtoQuery("מתי נפתח מנוף?")).toEqual({});
  });

  it("filters events by truck locally", () => {
    const events = [
      { plate: "615-41-002", driver: "חכמת", open: "22/10/2026 09:19" },
      { plate: "651-51-701", driver: "עלי", open: "22/10/2026 10:00" },
    ];
    expect(filterPtoEvents(events, { truck: "615-41-002" })).toHaveLength(1);
    expect(filterPtoEvents(events, { platePrefix: "651" })[0]?.driver).toBe("עלי");
  });

  it("formats events deterministically, newest first, with evidence label", () => {
    const ans = formatPtoAnswer({
      ok: true,
      query: { truck: "615-41-002", driverName: "חכמת" },
      fetchedAt: "2026-10-26T10:13:51.420Z",
      events: [
        {
          plate: "615-41-002",
          driver: "חכמת",
          open: "22/10/2026 09:19",
          address: "דרך הסולטן, רמות השבים",
        },
        {
          plate: "615-41-002",
          driver: "חכמת",
          open: "22/10/2026 10:10",
          close: "22/10/2026 10:30",
          min: 20,
          address: "משה שרת 65, הוד השרון",
        },
      ],
    });
    expect(ans.evidenceLabelHe).toBe("נמצא במאגר");
    expect(ans.text.indexOf("משה שרת 65")).toBeLessThan(ans.text.indexOf("דרך הסולטן"));
    expect(ans.text).toContain("(20 דק׳)");
    expect(ans.text).toContain("לא מיקום GPS חי");
    expect(ans.text).toContain("איתוראן_PTO");
  });

  it("does not invent data when empty or unavailable", () => {
    const empty = formatPtoAnswer({ ok: true, query: {}, fetchedAt: "x", events: [] });
    expect(empty.evidenceLabelHe).toBe("לא זמין / נדרש אימות");
    expect(empty.text).toContain("לא נמצאו");

    const missing = formatPtoAnswer({ ok: false, reason: "missing_server_config", query: {} });
    expect(missing.evidenceLabelHe).toBe("לא זמין / נדרש אימות");
    expect(missing.text).toContain("ITURAN_GAS_URL");
  });

  it("returns missing_server_config without env vars", async () => {
    vi.stubEnv("ITURAN_GAS_URL", "");
    vi.stubEnv("GAS_URL", "");
    vi.stubEnv("ITURAN_TOKEN", "");
    vi.stubEnv("API_TOKEN", "");
    const r = await fetchIturanPto({ truck: "615-41-002" });
    expect(r.ok).toBe(false);
  });

  it("calls GAS getIturanPto with truck and token", async () => {
    vi.stubEnv("ITURAN_GAS_URL", "https://script.google.com/macros/s/X/exec");
    vi.stubEnv("ITURAN_TOKEN", "tok");
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            at: "2026-10-26T10:00:00Z",
            pto: [{ plate: "615-41-002", open: "22/10/2026 09:19" }],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchIturanPto({ truck: "615-41-002" });
    expect(r.ok && r.events.length).toBe(1);
    const called = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(called.searchParams.get("action")).toBe("getIturanPto");
    expect(called.searchParams.get("truck")).toBe("615-41-002");
    expect(called.searchParams.get("token")).toBe("tok");
  });
});
