import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppShell";
import { ORDERS, DRIVERS, type Order } from "@/lib/data";
import { fetchLiveOrdersFromSheet, updateOrderStatus, hasLiveOrdersEndpoint } from "@/lib/google-orders";
import {
  Truck,
  Search,
  RefreshCw,
  Phone,
  Navigation,
  ChevronDown,
  ChevronUp,
  Clock,
  MapPin,
  Package,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "לוח הזמנות וסידור עבודה — Saban Flow" },
      {
        name: "description",
        content: "לוח הזמנות חיות מגיליון נועה, מניפסט פריטים נפתח, שיוך נהגים וניווט Waze ישיר.",
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
      toast.success("סטטוס ההזמנה עודכן בהצלחה");
    },
    onError: () => toast.error("שגיאה בעדכון הסטטוס"),
  });

  const handleRefresh = async () => {
    try {
      await refetch();
      toast.success("הנתונים נטענו מחדש");
    } catch {
      toast.error("שגיאה בסנכרון הגיליון");
    }
  };

  const filtered = orders.filter((o) => {
    const query = q.trim().toLowerCase();
    const matchQuery =
      !query ||
      o.customer.toLowerCase().includes(query) ||
      o.id.includes(query) ||
      o.address.toLowerCase().includes(query) ||
      o.yard.toLowerCase().includes(query);

    const matchStatus = filterStatus === "הכל" || o.status === filterStatus;
    return matchQuery && matchStatus;
  });

  return (
    <>
      <PageHeader
        title="לוח הזמנות וסידור עבודה"
        subtitle="סנכרון מלא מול טאב הזמנות בגיליון, ניהול מניפסט פריטים וסטטוסים"
        action={
          <Button onClick={handleRefresh} disabled={isFetching} variant="outline" className="gap-2 rounded-xl">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "מסנכרן..." : "סנכרון גיליון"}
          </Button>
        }
      />

      <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <div className={`rounded-xl border p-4 text-xs font-semibold ${hasLiveOrdersEndpoint ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800" : "border-amber-500/30 bg-amber-500/10 text-amber-900"}`}>
          {hasLiveOrdersEndpoint ? "חיבור חי ל-Google Sheets" : "מצב הדגמה: נתוני גיליון אינם זמינים"}
        </div>
        
        <div className="rounded-3xl bg-card p-4 shadow-sm border border-border/60 flex flex-wrap gap-4">
          <input
            type="text"
            placeholder="חיפוש הזמנות..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1 rounded-2xl bg-muted/40 py-2.5 px-4 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/40 border border-transparent"
          />
          <div className="flex gap-2">
            {["הכל", "פתוחה", "בהעמסה", "בדרך", "סופק"].map((st) => (
              <Button
                key={st}
                variant={filterStatus === st ? "default" : "secondary"}
                onClick={() => setFilterStatus(st)}
                className="rounded-xl px-4 text-xs font-bold"
              >
                {st}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {filtered.map((o) => (
            <Card key={o.id} className="overflow-hidden border-border/60 transition shadow-sm hover:shadow-md">
              <CardHeader className="p-0">
                <button
                  onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}
                  className="flex w-full items-center justify-between p-5 text-right hover:bg-muted/30"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono">{o.id}</Badge>
                      <Badge className={
                        o.status === "בהעמסה" ? "bg-amber-500/20 text-amber-700" :
                        o.status === "בדרך" ? "bg-blue-500/20 text-blue-700" :
                        o.status === "סופק" ? "bg-emerald-500/20 text-emerald-700" :
                        "bg-muted"
                      }>{o.status}</Badge>
                    </div>
                    <div className="font-display text-lg font-bold">{o.customer}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" /> {o.address}
                    </div>
                  </div>
                  {expandedId === o.id ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                </button>
              </CardHeader>
              
              {expandedId === o.id && (
                <CardContent className="border-t border-border/60 bg-muted/20 p-5 space-y-4 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-card border border-border">
                    <div className="text-xs font-bold">עדכון סטטוס:</div>
                    <Select value={o.status} onValueChange={(val) => updateMutation.mutate({ orderId: o.id, status: val })}>
                      <SelectTrigger className="w-48 h-9 rounded-lg">
                        <SelectValue placeholder="עדכון סטטוס" />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map(st => <SelectItem key={st} value={st}>{st}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        {o.items.map((it, i) => (
                            <div key={i} className="flex justify-between items-center bg-card p-3 rounded-xl text-xs border border-border">
                                <span className="font-bold">{it.name}</span>
                                <span>{it.qty} {it.unit}</span>
                            </div>
                        ))}
                    </div>
                    <div className="flex flex-col gap-2">
                        <Link to={`/customers/$id`} params={{ id: o.customerNo || "0" }} className="flex items-center gap-2 p-3 rounded-xl bg-primary/10 text-primary font-bold text-xs hover:bg-primary/20">
                            <User className="h-4 w-4" /> תיק לקוח
                        </Link>
                        <Button variant="outline" className="justify-start gap-2 h-10 rounded-xl" onClick={() => window.open(`tel:${o.phone}`)}>
                            <Phone className="h-4 w-4" /> חיוג ללקוח
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
