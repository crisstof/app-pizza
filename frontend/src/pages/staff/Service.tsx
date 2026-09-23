import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Bell,
  BellOff,
  ChevronRight,
  Clock,
  Euro,
  Flame,
  Pizza as PizzaIcon,
  ReceiptText,
  RefreshCw,
  Wheat,
  WifiOff,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ApiError, fetchOrders, fetchTimeSlots, type Order, type TimeSlot } from "@/api";
import { OrderDetailDialog } from "@/components/staff/OrderDetailDialog";
import { OrderRow } from "@/components/staff/OrderRow";
import { useLiveOrders, type LiveOrderEvent } from "@/components/staff/useLiveOrders";
import { useOrderActions } from "@/components/staff/useOrderActions";
import { TO_PREPARE } from "@/components/staff/orderStatus";
import { PageHeader } from "@/components/staff/PageHeader";
import { ServiceControls } from "@/components/staff/ServiceControls";
import { useStaffError } from "@/components/staff/useStaffError";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDayLong, formatPrice, formatTime, toDateKey } from "@/lib/format";
import { playChime, unlockChime } from "@/lib/chime";
import { useNow } from "@/lib/useNow";
import {
  fetchAdminPizzas,
  fetchDaySlots,
  fetchDoughForecast,
  updatePizza,
  updateSlot,
  type AdminPizza,
  type DayForecast,
} from "@/staffApi";

const AUTO_REFRESH_MS = 30_000;
type LoadScope = "all" | "orders";
const SOUND_KEY = "staff-sound";
const BASE_TITLE = "App Pizza";

function readSoundPref() {
  try {
    return localStorage.getItem(SOUND_KEY) === "on";
  } catch {
    return false;
  }
}

function writeSoundPref(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // Private mode: the toggle still works for this visit.
  }
}
const SOON_WINDOW_MS = 60 * 60 * 1000;

function StatTile({
  icon,
  label,
  value,
  detail,
  tone = "default",
  to,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail?: ReactNode;
  tone?: "default" | "alert";
  /** A route ("/pizzaiolo/…") or an in-page anchor ("#pilotage"). */
  to: string;
}) {
  const className = `group block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`;
  const card = (
    <Card
      className={`h-full gap-1 p-4 transition-colors group-hover:border-primary/60 ${tone === "alert" ? "border-accent" : ""}`}
    >
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {icon}
        {label}
        <ChevronRight className="ml-auto size-4 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
      </p>
      <p className="text-3xl font-bold tabular-nums">{value}</p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </Card>
  );
  return to.startsWith("#") ? (
    <a href={to} className={className}>
      {card}
    </a>
  ) : (
    <Link to={to} className={className}>
      {card}
    </Link>
  );
}

type PrepSlot = { startsAt: string; lines: { name: string; quantity: number }[] };

/** Tomorrow's dough forecast, linking to the Pâtons page. */
function DoughBanner({ tomorrow }: { tomorrow: DayForecast | undefined }) {
  if (!tomorrow) return null;
  return (
    <Link
      to="/pizzaiolo/pates"
      className="group mb-8 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border bg-card px-4 py-3 text-sm transition-colors hover:border-primary/60"
    >
      <Wheat className="size-5 shrink-0 text-accent" aria-hidden />
      {tomorrow.closed ? (
        <span className="font-semibold">Demain : fermé, pas de pâte à préparer</span>
      ) : (
        <span>
          <span className="font-semibold">Demain : {tomorrow.total} pâtons à préparer</span>
          <span className="text-muted-foreground">
            {" "}
            · {tomorrow.services.map((s) => `${s.service === "LUNCH" ? "midi" : "soir"} ${s.recommended}`).join(" · ")}
          </span>
        </span>
      )}
      <span className="ml-auto flex items-center gap-1 text-muted-foreground group-hover:text-foreground">
        Noter les pâtons d'aujourd'hui <ChevronRight className="size-4" aria-hidden />
      </span>
    </Link>
  );
}

function KitchenPanel({ prep }: { prep: PrepSlot[] }) {
  const max = Math.max(1, ...prep.flatMap((s) => s.lines.map((l) => l.quantity)));

  return (
    <Card id="cuisine" className="scroll-mt-6 p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Flame className="size-5 text-accent" aria-hidden /> À enfourner
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

export default function Service() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [upcomingSlots, setUpcomingSlots] = useState<TimeSlot[]>([]);
  const [todaySlots, setTodaySlots] = useState<TimeSlot[]>([]);
  const [pizzas, setPizzas] = useState<AdminPizza[]>([]);
  const [doughForecast, setDoughForecast] = useState<DayForecast[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [offline, setOffline] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const fail = useStaffError();
  // Bumped by every load and every status change: a load whose response
  // arrives after a newer load or a status change started is stale and
  // must not overwrite the fresher state.
  const generation = useRef(0);
  const inFlight = useRef(false);
  // A reload asked for while one is running (e.g. a live event) runs right
  // after it, instead of being dropped; "all" wins over "orders".
  const reloadPending = useRef<LoadScope | null>(null);
  const loadRef = useRef<(scope?: LoadScope) => void>(() => {});

  // "all": everything on the page (arrival, polling, manual refresh).
  // "orders": just what an order event can change — the orders and today's
  // slot fill — so live events don't refetch the menu and upcoming slots.
  const load = useCallback(async (scope: LoadScope = "all") => {
    if (inFlight.current) {
      reloadPending.current = reloadPending.current === "all" || scope === "all" ? "all" : "orders";
      return;
    }
    inFlight.current = true;
    const myGeneration = ++generation.current;
    try {
      const today = toDateKey(new Date());
      if (scope === "orders") {
        const [o, t] = await Promise.all([fetchOrders(), fetchDaySlots(today)]);
        if (myGeneration !== generation.current) return;
        setOrders(o);
        setTodaySlots(t);
      } else {
        const [o, s, t, p] = await Promise.all([fetchOrders(), fetchTimeSlots(), fetchDaySlots(today), fetchAdminPizzas()]);
        if (myGeneration !== generation.current) return;
        setOrders(o);
        setUpcomingSlots(s);
        setTodaySlots(t);
        setPizzas(p);
      }
      setUpdatedAt(new Date());
      setOffline(false);
    } catch (err) {
      // Expired session → login; anything else (server down, 500…) → the
      // offline banner rather than a toast every 30 seconds.
      if (err instanceof ApiError && err.status === 401) fail(err);
      else setOffline(true);
    } finally {
      inFlight.current = false;
      setLoading(false);
      const pending = reloadPending.current;
      if (pending) {
        reloadPending.current = null;
        loadRef.current(pending);
      }
    }
  }, [fail]);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

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

  // Dough forecast: heavier query, and it only moves with new bookings, so
  // once on arrival rather than with every 30-second refresh.
  useEffect(() => {
    fetchDoughForecast()
      .then(setDoughForecast)
      .catch(() => {}); // Banner only: the service page works without it.
  }, []);

  // Live updates: a new or changed order reloads the day at once; a new one
  // also rings (if the sound is on) and shows up in the tab title when the
  // tab is in the background.
  const [soundOn, setSoundOn] = useState(readSoundPref);
  const [unseen, setUnseen] = useState(0);
  const soundOnRef = useRef(soundOn);
  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  const live = useLiveOrders((event: LiveOrderEvent) => {
    load("orders");
    if (event.type !== "created") return;
    if (soundOnRef.current) playChime();
    toast.info("Nouvelle commande !");
    if (document.hidden) setUnseen((n) => n + 1);
  });

  useEffect(() => {
    document.title = unseen ? `(${unseen}) Nouvelle commande · ${BASE_TITLE}` : BASE_TITLE;
  }, [unseen]);
  useEffect(() => {
    const onVisible = () => !document.hidden && setUnseen(0);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      document.title = BASE_TITLE;
    };
  }, []);

  // Browsers only allow sound after a click: if it was left on last time,
  // unlock it on the first click anywhere on the page.
  useEffect(() => {
    if (!soundOn) return;
    const unlock = () => void unlockChime().catch(() => {});
    document.addEventListener("pointerdown", unlock, { once: true });
    return () => document.removeEventListener("pointerdown", unlock);
  }, [soundOn]);

  async function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    writeSoundPref(next);
    if (next) {
      await unlockChime().catch(() => {});
      playChime(); // So you hear what it will sound like.
    }
  }

  const actions = useOrderActions((updated) => {
    generation.current++;
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
  });

  const now = useNow(15_000);

  // Slot and stock changes invalidate any load in flight (same reason as
  // order actions above), then refresh so the KPI "next slot" follows.
  function applySlot(updated: TimeSlot) {
    generation.current++;
    setTodaySlots((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  async function patchSlot(slot: TimeSlot, patch: { capacity?: number; closed?: boolean }) {
    try {
      applySlot(await updateSlot(slot.id, patch));
      load();
    } catch (err) {
      fail(err);
    }
  }

  async function patchSlots(slots: TimeSlot[], patch: { capacity?: number; closed?: boolean }) {
    const results = await Promise.allSettled(slots.map((slot) => updateSlot(slot.id, patch)));
    for (const r of results) if (r.status === "fulfilled") applySlot(r.value);
    const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failed) fail(failed.reason);
    else toast.success(patch.closed ? "Commandes stoppées pour aujourd'hui" : "Créneaux rouverts");
    load();
  }

  async function toggleAvailable(pizza: AdminPizza, available: boolean) {
    generation.current++;
    setPizzas((prev) => prev.map((p) => (p.id === pizza.id ? { ...p, available } : p)));
    try {
      await updatePizza(pizza.id, { available });
      toast.success(available ? `${pizza.name} de retour à la carte` : `${pizza.name} marquée épuisée`);
    } catch (err) {
      setPizzas((prev) => prev.map((p) => (p.id === pizza.id ? { ...p, available: !available } : p)));
      fail(err);
    }
  }

  const stats = useMemo(() => {
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
  }, [orders, now]);

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

  return (
    <>
      <PageHeader
        title="Service du jour"
        description={formatDayLong(new Date())}
        actions={
          <>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
              <span className={`size-2 rounded-full ${live ? "bg-green-500" : "bg-muted-foreground/40"}`} aria-hidden />
              {live ? "En direct" : updatedAt ? `Mis à jour à ${formatTime(updatedAt)}` : "Connexion…"}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleSound}
              aria-pressed={soundOn}
              title={soundOn ? "Couper le son des nouvelles commandes" : "Activer un son à chaque nouvelle commande"}
            >
              {soundOn ? <Bell className="size-4" aria-hidden /> : <BellOff className="size-4" aria-hidden />}
              Son {soundOn ? "activé" : "coupé"}
            </Button>
            <Button variant="outline" size="icon" onClick={() => load()} aria-label="Rafraîchir">
              <RefreshCw className="size-4" />
            </Button>
          </>
        }
      />

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

      <section aria-label="Indicateurs du jour" className="mb-8 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatTile
          icon={<ReceiptText className="size-4" aria-hidden />}
          label="Commandes du jour"
          to="/pizzaiolo/commandes"
          value={String(stats.orderCount)}
          detail={`${stats.inProgress} en cours`}
        />
        <StatTile
          icon={<PizzaIcon className="size-4" aria-hidden />}
          label="Pizzas à préparer"
          to="#cuisine"
          value={String(stats.pizzasToPrep)}
          detail={`dont ${stats.pizzasSoon} dans l'heure`}
        />
        <StatTile
          icon={<Euro className="size-4" aria-hidden />}
          label="Chiffre du jour"
          to="/pizzaiolo/commandes"
          value={formatPrice(stats.revenueCents)}
          detail={stats.orderCount ? `panier moyen ${formatPrice(stats.averageCents)}` : undefined}
        />
        <StatTile
          icon={<Clock className="size-4" aria-hidden />}
          label="Prochain créneau"
          to="#pilotage"
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

      <DoughBanner tomorrow={doughForecast?.[1]} />

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
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
                      <OrderRow
                        key={order.id}
                        order={order}
                        now={now}
                        actions={actions}
                        onOpen={(o) => setOpenId(o.id)}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="space-y-6">
          <KitchenPanel prep={prep} />
          <ServiceControls
            slots={todaySlots}
            pizzas={[...pizzas].sort((a, b) => a.name.localeCompare(b.name))}
            now={now}
            onPatchSlot={patchSlot}
            onPatchSlots={patchSlots}
            onToggleAvailable={toggleAvailable}
          />
        </div>
      </div>

      <OrderDetailDialog
        order={orders.find((o) => o.id === openId) ?? null}
        actions={actions}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}
