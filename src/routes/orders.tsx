import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppShell";
import { ORDERS, type Order } from "@/lib/data";
import { fetchLiveOrdersFromSheet, updateOrderStatus, hasLiveOrdersEndpoint } from "@/lib/google-orders";
import {
  Truck,
  Search,
  RefreshCw,
  Phone,
  Navigation,
  ChevronDown,
  ChevronUp,
  MapPin,
  Package,
  User,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "לוח הזמנות וסידור עבודה — Saban Flow" },
      {
        name: "description",
        content: "לוח הזמנות חיות, ניהול מניפסטים וסטטוסים בזמן אמת.",
      },
    ],
  }),
  component: LiveOrdersPage,
});

const STATUS_OPTIONS = ["פתוחה", "בהעמסה", "בדרך", "סופק", "הועבר לתעודת משלוח"];

function LiveOrdersPage() {
  const [q, setQ] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("הכל");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const {
    data: orders = (hasLiveOrdersEndpoint ? [] : ORDERS),
    isFetching,
    refetch,
  } = useQuery<Order[]>({
    queryKey: ["live-orders"],
    queryFn: fetchLiveOrdersFromSheet,
    initialData: hasLiveOrdersEndpoint ? undefined : ORDERS,
    staleTime: 30000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: string }) => updateOrderStatus(orderId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["live-orders"] });
      toast.success("סטטוס ההזמנה עודכן");
    },
    onError: () => toast.error("שגיאה בעדכון הסטטוס"),
  });

  const handleRefresh = async () => {
    try {
      await refetch();
      toast.success("נתונים מעודכנים");
    } catch {
      toast.error("שגיאת סנכרון");
    }
  };

  const filtered = orders.filter((o) => {
    const query = q.trim().toLowerCase();
    const matchQuery =
      !query ||
      o.customer.toLowerCase().includes(query) ||
      o.id.includes(query) ||
      o.address.toLowerCase().includes(query); // Address contains city

    const matchStatus = filterStatus === "הכל" || o.status === filterStatus;
    return matchQuery && matchStatus;
  });

  return (
    <>
      <PageHeader
        title="לוח הזמנות וסידור עבודה"
        subtitle="ניהול הזמנות בזמן אמת עם סנכרון Google Sheets"
        action={
          <Button onClick={handleRefresh} disabled={isFetching} variant="outline" className="gap-2 rounded-xl h-9">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "מסנכרן..." : "סנכרון"}
          </Button>
        }
      />

      <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">
        {/* Global Search Bar */}
        <div className="relative group">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            placeholder="חיפוש הזמנות (שם לקוח, מספר הזמנה, עיר)..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-2xl bg-card border border-border shadow-sm py-4 pr-12 pl-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground"
          />
        </div>

        {/* Status Filters */}
        <div className="flex flex-wrap gap-2">
          {["הכל", "פתוחה", "בהעמסה", "בדרך", "סופק"].map((st) => (
            <Button
              key={st}
              variant={filterStatus === st ? "default" : "outline"}
              onClick={() => setFilterStatus(st)}
              className="rounded-full px-5 h-9 text-xs font-bold"
            >
              {st}
            </Button>
          ))}
        </div>

        {/* Orders List */}
        <div className="space-y-4">
          {filtered.map((o) => (
            <Card key={o.id} className="border-border/60 hover:shadow-md transition-shadow">
              <button
                onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}
                className="w-full p-5 flex items-center justify-between text-right"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">{o.id}</Badge>
                    <Badge className={
                      o.status === "בהעמסה" ? "bg-amber-500/20 text-amber-800" :
                      o.status === "בדרך" ? "bg-blue-500/20 text-blue-800" :
                      o.status === "סופק" ? "bg-emerald-500/20 text-emerald-800" :
                      "bg-muted text-muted-foreground"
                    }>{o.status}</Badge>
                  </div>
                  <div className="text-lg font-bold font-display">{o.customer}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" /> {o.address}
                  </div>
                </div>
                {expandedId === o.id ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
              </button>

              {expandedId === o.id && (
                <CardContent className="border-t border-border/60 bg-muted/20 p-5 space-y-4 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-card border border-border shadow-sm">
                    <div className="text-xs font-bold text-muted-foreground">סטטוס הזמנה:</div>
                    <Select value={o.status} onValueChange={(val) => updateMutation.mutate({ orderId: o.id, status: val })}>
                      <SelectTrigger className="w-52 h-9 rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map(st => <SelectItem key={st} value={st}>{st}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-muted-foreground mb-2 flex items-center gap-2"><Package className="h-3.5 w-3.5"/> מניפסט:</div>
                      {o.items.map((it, i) => (
                          <div key={i} className="flex justify-between items-center bg-card p-3 rounded-xl text-xs border border-border">
                              <span className="font-bold">{it.name}</span>
                              <span className="text-muted-foreground">{it.qty} {it.unit}</span>
                          </div>
                      ))}
                    </div>
                    
                    <div className="flex flex-col gap-2">
                        <Link to={`/customers/$id`} params={{ id: o.customerNo || "0" }} className="flex items-center gap-2 p-3 rounded-xl bg-primary/10 text-primary font-bold text-xs hover:bg-primary/20 transition">
                            <User className="h-4 w-4" /> תיק לקוח
                        </Link>
                        <Button variant="outline" className="justify-start gap-2 h-10 rounded-xl" onClick={() => window.open(`tel:${o.phone}`)}>
                            <Phone className="h-4 w-4" /> {o.phone || "חיוג ללקוח"}
                        </Button>
                        <Button variant="outline" className="justify-start gap-2 h-10 rounded-xl text-blue-600 border-blue-500/30" onClick={() => window.open(`https://waze.com/ul?q=${encodeURIComponent(o.address)}`)}>
                            <Navigation className="h-4 w-4" /> ניווט Waze
                        </Button>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
