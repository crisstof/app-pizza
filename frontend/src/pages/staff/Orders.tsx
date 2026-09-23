import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { fetchOrders, type Order, type OrderStatus } from "@/api";
import { OrderDetailDialog } from "@/components/staff/OrderDetailDialog";
import { OrderRow } from "@/components/staff/OrderRow";
import { useOrderActions } from "@/components/staff/useOrderActions";
import { TO_PREPARE } from "@/components/staff/orderStatus";
import { PageHeader } from "@/components/staff/PageHeader";
import { useStaffError } from "@/components/staff/useStaffError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDayLong, formatPrice, formatTime, fromDateKey, toDateKey } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { searchOrders } from "@/staffApi";

const FILTERS: { key: string; label: string; match: (s: OrderStatus) => boolean }[] = [
  { key: "all", label: "Toutes", match: () => true },
  { key: "kitchen", label: "En cuisine", match: (s) => TO_PREPARE.includes(s) },
  { key: "ready", label: "Prêtes", match: (s) => s === "READY" },
  { key: "done", label: "Récupérées", match: (s) => s === "PICKED_UP" },
  { key: "cancelled", label: "Annulées", match: (s) => s === "CANCELLED" },
];

const SEARCH_DELAY_MS = 300;

function shiftDay(key: string, days: number) {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export default function Orders() {
  const [day, setDay] = useState(() => toDateKey(new Date()));
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const fail = useStaffError();
  const now = useNow(15_000);
  const searching = query.trim().length >= 2;

  const load = useCallback(
    async (signal: { cancelled: boolean }) => {
      setLoading(true);
      try {
        const data = searching ? await searchOrders(query.trim()) : await fetchOrders(day);
        if (!signal.cancelled) setOrders(data);
      } catch (err) {
        if (!signal.cancelled) fail(err);
      } finally {
        if (!signal.cancelled) setLoading(false);
      }
    },
    [day, query, searching, fail]
  );

  // Debounced while typing a search; immediate when changing day.
  useEffect(() => {
    const signal = { cancelled: false };
    const timer = setTimeout(() => load(signal), searching ? SEARCH_DELAY_MS : 0);
    return () => {
      signal.cancelled = true;
      clearTimeout(timer);
    };
  }, [load, searching]);

  const actions = useOrderActions((updated) =>
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
  );

  const visible = useMemo(() => {
    const match = FILTERS.find((f) => f.key === filter)!.match;
    return orders.filter((o) => match(o.status));
  }, [orders, filter]);

  const summary = useMemo(() => {
    const active = orders.filter((o) => o.status !== "CANCELLED");
    return {
      count: active.length,
      revenue: active.reduce((sum, o) => sum + o.totalCents, 0),
      pizzas: active.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0),
    };
  }, [orders]);

  const isToday = day === toDateKey(new Date());

  return (
    <>
      <PageHeader
        title="Commandes"
        description={
          searching
            ? `Résultats pour « ${query.trim()} » sur toutes les dates`
            : `${formatDayLong(fromDateKey(day))} · ${summary.count} commande${summary.count > 1 ? "s" : ""}, ${summary.pizzas} pizza${summary.pizzas > 1 ? "s" : ""}, ${formatPrice(summary.revenue)}`
        }
      />

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2" role="group" aria-label="Jour affiché">
          <Button variant="outline" size="icon" onClick={() => setDay(shiftDay(day, -1))} aria-label="Jour précédent" disabled={searching}>
            <ChevronLeft className="size-4" />
          </Button>
          <Input
            type="date"
            value={day}
            onChange={(e) => e.target.value && setDay(e.target.value)}
            className="w-auto"
            aria-label="Choisir un jour"
            disabled={searching}
          />
          <Button variant="outline" size="icon" onClick={() => setDay(shiftDay(day, 1))} aria-label="Jour suivant" disabled={searching}>
            <ChevronRight className="size-4" />
          </Button>
          {!isToday && !searching && (
            <Button variant="ghost" size="sm" onClick={() => setDay(toDateKey(new Date()))}>
              Aujourd'hui
            </Button>
          )}
        </div>

        <div className="relative md:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            placeholder="Nom, email, téléphone ou réf…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            aria-label="Rechercher une commande sur toutes les dates"
          />
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filtrer par statut">
        {FILTERS.map((f) => {
          const count = orders.filter((o) => f.match(o.status)).length;
          const active = f.key === filter;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(f.key)}
              className={`min-h-9 rounded-full border px-3.5 text-sm transition-colors ${
                active ? "border-primary bg-primary font-semibold text-primary-foreground" : "bg-card hover:border-primary/60"
              }`}
            >
              {f.label} <span className="tabular-nums opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {loading && orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : visible.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {searching ? "Aucune commande ne correspond." : "Aucune commande pour ce filtre ce jour-là."}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              now={now}
              actions={actions}
              onOpen={(o) => setOpenId(o.id)}
              context={
                searching
                  ? `${formatDayLong(order.timeSlot.startsAt)} à ${formatTime(order.timeSlot.startsAt)}`
                  : `Retrait ${formatTime(order.timeSlot.startsAt)}`
              }
            />
          ))}
        </ul>
      )}

      <OrderDetailDialog
        order={orders.find((o) => o.id === openId) ?? null}
        actions={actions}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}
