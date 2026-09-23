import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ChefHat,
  Clock,
  Euro,
  Flame,
  Pizza as PizzaIcon,
  ReceiptText,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  fetchOrders,
  fetchTimeSlots,
  updateOrderStatus,
  type Order,
  type OrderStatus,
  type TimeSlot,
} from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatPrice, formatTime } from "@/lib/format";

const AUTO_REFRESH_MS = 30_000;
const SOON_WINDOW_MS = 60 * 60 * 1000;
const TO_PREPARE: OrderStatus[] = ["PENDING", "CONFIRMED", "PREPARING"];

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; variant: BadgeVariant; next?: { status: OrderStatus; label: string } }
> = {
  PENDING: { label: "En attente", variant: "outline", next: { status: "CONFIRMED", label: "Confirmer" } },
  CONFIRMED: {
    label: "Confirmée",
    variant: "secondary",
    next: { status: "PREPARING", label: "Lancer la préparation" },
  },
  PREPARING: {
    label: "En préparation",
    variant: "default",
    next: { status: "READY", label: "Marquer prête" },
  },
  READY: {
    label: "Prête",
    variant: "default",
    next: { status: "PICKED_UP", label: "Marquer récupérée" },
  },
  PICKED_UP: { label: "Récupérée", variant: "secondary" },
  CANCELLED: { label: "Annulée", variant: "destructive" },
};

function StatTile({
  icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail?: ReactNode;
  tone?: "default" | "alert";
}) {
  return (
    <Card className={`gap-1 p-4 ${tone === "alert" ? "border-accent" : ""}`}>
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="text-3xl font-bold tabular-nums">{value}</p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </Card>
  );
}

type PrepSlot = { startsAt: string; lines: { name: string; quantity: number }[] };

function KitchenPanel({ prep }: { prep: PrepSlot[] }) {
  const max = Math.max(1, ...prep.flatMap((s) => s.lines.map((l) => l.quantity)));

  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Flame className="size-5 text-accent" aria-hidden /> Pâtons à préparer
      </h2>
      {prep.length === 0 ? (
        <p className="text-sm text-muted-foreground">Rien à préparer pour l'instant.</p>
      ) : (
        <div className="space-y-5">
          {prep.map((slot) => (
            <div key={slot.startsAt}>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                <Clock className="size-3.5" aria-hidden /> {formatTime(slot.startsAt)}
              </p>
              <ul className="space-y-1.5">
                {slot.lines.map((line) => (
                  <li
                    key={line.name}
                    className="grid grid-cols-[7.5rem_minmax(0,1fr)_2rem] items-center gap-3 text-sm"
                    title={`${line.quantity} × ${line.name} pour ${formatTime(slot.startsAt)}`}
                  >
                    <span className="truncate">{line.name}</span>
                    <span className="h-2 rounded-full bg-muted" aria-hidden>
                      <motion.span
                        className="block h-full rounded-full bg-primary"
                        initial={{ width: 0 }}
                        animate={{ width: `${(line.quantity / max) * 100}%` }}
                        transition={{ duration: 0.4 }}
                      />
                    </span>
                    <span className="text-right font-semibold tabular-nums">{line.quantity}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function OrderRow({
  order,
  onAdvance,
}: {
  order: Order;
  onAdvance: (order: Order, status: OrderStatus) => void;
}) {
  const config = STATUS_CONFIG[order.status];
  const done = order.status === "PICKED_UP" || order.status === "CANCELLED";

  return (
    <motion.li layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <Card
        className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ${done ? "opacity-60" : ""}`}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{order.client.name}</span>
            <Badge variant={config.variant}>{config.label}</Badge>
          </div>
          <p className="text-sm">{order.items.map((i) => `${i.quantity}× ${i.pizza.name}`).join(", ")}</p>
          <p className="text-xs text-muted-foreground">
            {formatPrice(order.totalCents)} · Réf {order.id.slice(0, 8)}
          </p>
        </div>
        {config.next && (
          <Button size="sm" className="shrink-0" onClick={() => onAdvance(order, config.next!.status)}>
            {config.next.label}
          </Button>
        )}
      </Card>
    </motion.li>
  );
}

export default function PizzaioloDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [upcomingSlots, setUpcomingSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [offline, setOffline] = useState(false);
  // Bumped by every load and every status change: a load whose response
  // arrives after a newer load or a status change started is stale and
  // must not overwrite the fresher state.
  const generation = useRef(0);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const myGeneration = ++generation.current;
    try {
      const [o, s] = await Promise.all([fetchOrders(), fetchTimeSlots()]);
      if (myGeneration !== generation.current) return;
      setOrders(o);
      setUpcomingSlots(s);
      setUpdatedAt(new Date());
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => {
      if (!document.hidden) load();
    }, AUTO_REFRESH_MS);
    const onVisible = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  async function handleAdvance(order: Order, status: OrderStatus) {
    try {
      const updated = await updateOrderStatus(order.id, status);
      generation.current++;
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      toast.success(`${order.client.name} · ${STATUS_CONFIG[status].label}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur inconnue.");
    }
  }

  const stats = useMemo(() => {
    const now = Date.now();
    const active = orders.filter((o) => o.status !== "CANCELLED");
    const toPrepare = orders.filter((o) => TO_PREPARE.includes(o.status));
    const pizzaCount = (list: Order[]) =>
      list.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0);
    const revenueCents = active.reduce((sum, o) => sum + o.totalCents, 0);

    return {
      orderCount: active.length,
      inProgress: active.filter((o) => o.status !== "PICKED_UP").length,
      pizzasToPrep: pizzaCount(toPrepare),
      pizzasSoon: pizzaCount(
        toPrepare.filter((o) => new Date(o.timeSlot.startsAt).getTime() <= now + SOON_WINDOW_MS)
      ),
      revenueCents,
      averageCents: active.length ? Math.round(revenueCents / active.length) : 0,
    };
  }, [orders]);

  const nextSlot = upcomingSlots[0];
  const nextSlotFull = nextSlot ? nextSlot.reserved >= nextSlot.capacity : false;

  const prep = useMemo<PrepSlot[]>(() => {
    const bySlot = new Map<string, Map<string, number>>();
    for (const order of orders) {
      if (!TO_PREPARE.includes(order.status)) continue;
      const lines = bySlot.get(order.timeSlot.startsAt) ?? new Map<string, number>();
      for (const item of order.items) {
        lines.set(item.pizza.name, (lines.get(item.pizza.name) ?? 0) + item.quantity);
      }
      bySlot.set(order.timeSlot.startsAt, lines);
    }
    return [...bySlot.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([startsAt, lines]) => ({
        startsAt,
        lines: [...lines.entries()]
          .map(([name, quantity]) => ({ name, quantity }))
          .sort((a, b) => b.quantity - a.quantity),
      }));
  }, [orders]);

  const ordersBySlot = useMemo(() => {
    const bySlot = new Map<string, Order[]>();
    for (const order of orders) {
      const key = order.timeSlot.startsAt;
      bySlot.set(key, [...(bySlot.get(key) ?? []), order]);
    }
    return [...bySlot.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [orders]);

  const todayLabel = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="theme-staff min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10">
              <ChefHat className="size-6 text-primary" aria-hidden />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Espace pizzaiolo</h1>
              <p className="text-sm text-muted-foreground first-letter:uppercase">{todayLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {updatedAt && (
              <span className="hidden text-xs text-muted-foreground sm:inline">Mis à jour à {formatTime(updatedAt)}</span>
            )}
            <Button variant="outline" size="icon" onClick={load} aria-label="Rafraîchir">
              <RefreshCw className="size-4" />
            </Button>
            <Link to="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
              Vue client
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {offline && (
          <div
            role="status"
            className="mb-6 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <WifiOff className="size-4 shrink-0" aria-hidden />
            Connexion au serveur perdue. Nouvel essai automatique toutes les 30 secondes
            {updatedAt && ` · données du ${formatTime(updatedAt)}`}.
          </div>
        )}

        <section aria-label="Indicateurs du jour" className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile
            icon={<ReceiptText className="size-4" aria-hidden />}
            label="Commandes du jour"
            value={String(stats.orderCount)}
            detail={`${stats.inProgress} en cours`}
          />
          <StatTile
            icon={<PizzaIcon className="size-4" aria-hidden />}
            label="Pizzas à préparer"
            value={String(stats.pizzasToPrep)}
            detail={`dont ${stats.pizzasSoon} dans l'heure`}
          />
          <StatTile
            icon={<Euro className="size-4" aria-hidden />}
            label="Chiffre du jour"
            value={formatPrice(stats.revenueCents)}
            detail={stats.orderCount ? `panier moyen ${formatPrice(stats.averageCents)}` : undefined}
          />
          <StatTile
            icon={<Clock className="size-4" aria-hidden />}
            label="Prochain créneau"
            value={nextSlot ? formatTime(nextSlot.startsAt) : "—"}
            tone={nextSlotFull ? "alert" : "default"}
            detail={
              nextSlot &&
              (nextSlotFull ? (
                <span className="flex items-center gap-1 font-semibold text-accent">
                  <AlertTriangle className="size-3.5" aria-hidden /> Complet ({nextSlot.reserved}/{nextSlot.capacity})
                </span>
              ) : (
                `${nextSlot.reserved}/${nextSlot.capacity} commandes`
              ))
            }
          />
        </section>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <section className="min-w-0">
            <h2 className="mb-4 text-lg font-semibold">Commandes par créneau</h2>
            {loading ? (
              <p className="text-sm text-muted-foreground">Chargement…</p>
            ) : ordersBySlot.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune commande aujourd'hui.</p>
            ) : (
              <div className="space-y-8">
                {ordersBySlot.map(([startsAt, slotOrders]) => (
                  <div key={startsAt}>
                    <h3 className="mb-3 flex items-baseline gap-2 text-sm font-semibold text-muted-foreground">
                      <span className="text-base text-foreground">{formatTime(startsAt)}</span>
                      {slotOrders.length} commande{slotOrders.length > 1 ? "s" : ""}
                    </h3>
                    <ul className="space-y-2">
                      {slotOrders.map((order) => (
                        <OrderRow key={order.id} order={order} onAdvance={handleAdvance} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="lg:sticky lg:top-6 lg:self-start">
            <KitchenPanel prep={prep} />
          </div>
        </div>
      </main>
    </div>
  );
}
