import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  ChefHat,
  Clock,
  Flame,
  Gift,
  PartyPopper,
  Pizza as PizzaIcon,
  ShoppingBag,
  Store,
  WifiOff,
  XCircle,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { fetchOrder, resolveImageUrl, type Order, type OrderStatus } from "@/api";
import { Card } from "@/components/ui/card";
import { formatPrice, formatTime } from "@/lib/format";
import { minutesUntil, useNow } from "@/lib/useNow";

const POLL_MS = 5000;
const TERMINAL: OrderStatus[] = ["PICKED_UP", "CANCELLED"];

const STEPS: { status: OrderStatus; label: string; at: (o: Order) => string | null }[] = [
  { status: "PENDING", label: "Commande reçue", at: (o) => o.createdAt },
  { status: "CONFIRMED", label: "Confirmée par la pizzeria", at: (o) => o.confirmedAt },
  { status: "PREPARING", label: "Au four", at: (o) => o.preparingAt },
  { status: "READY", label: "Prête au comptoir", at: (o) => o.readyAt },
  { status: "PICKED_UP", label: "Récupérée", at: (o) => o.pickedUpAt },
];

const TAB_TITLES: Record<OrderStatus, string> = {
  PENDING: "Commande reçue",
  CONFIRMED: "Commande confirmée",
  PREPARING: "Au four",
  READY: "Prête !",
  PICKED_UP: "Bon appétit",
  CANCELLED: "Commande annulée",
};

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

function formatSlotDay(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

// Circular countdown from when the pizzaiolo gave the estimate to the announced time.
function CountdownRing({ order, now }: { order: Order; now: number }) {
  const start = new Date(order.etaSetAt ?? order.createdAt).getTime();
  const end = new Date(order.estimatedReadyAt!).getTime();
  const progress = end > start ? Math.min(1, Math.max(0, (now - start) / (end - start))) : 1;
  const remainingMs = Math.max(0, end - now);
  const minutes = Math.floor(remainingMs / 60_000);
  const seconds = Math.floor((remainingMs % 60_000) / 1000);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative size-40 shrink-0">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={radius} fill="none" strokeWidth="8" className="stroke-muted" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          className="stroke-primary transition-[stroke-dashoffset] duration-1000 ease-linear"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {remainingMs > 0 ? (
          <>
            <span className="text-3xl leading-none font-bold tabular-nums">
              {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
            </span>
            <span className="mt-1 text-xs text-muted-foreground">restantes</span>
          </>
        ) : (
          <Flame className="size-10 animate-pulse text-accent" aria-hidden />
        )}
      </div>
    </div>
  );
}

function StatusHero({ order, now }: { order: Order; now: number }) {
  const slotMinutes = minutesUntil(order.timeSlot.startsAt, now);
  const slotLine =
    slotMinutes > 0
      ? `Retrait prévu à ${formatTime(order.timeSlot.startsAt)}, dans ${formatDuration(slotMinutes)}`
      : `Retrait prévu à ${formatTime(order.timeSlot.startsAt)}`;
  const hasEta = order.estimatedReadyAt && ["PENDING", "CONFIRMED", "PREPARING"].includes(order.status);

  let icon: ReactNode;
  let title: string;
  let body: ReactNode;

  if (order.status === "CANCELLED") {
    icon = <XCircle className="size-10 text-destructive" aria-hidden />;
    title = "Commande annulée";
    body = "Contacte la pizzeria si tu penses qu'il y a une erreur.";
  } else if (order.status === "PICKED_UP") {
    icon = <PartyPopper className="size-10 text-accent" aria-hidden />;
    title = "Bon appétit !";
    body = order.pickedUpAt
      ? `Récupérée à ${formatTime(order.pickedUpAt)}. Merci et à bientôt.`
      : "Merci et à bientôt.";
  } else if (order.status === "READY") {
    const waiting = order.readyAt ? Math.max(0, -minutesUntil(order.readyAt, now)) : 0;
    icon = (
      <motion.span
        initial={{ scale: 0.5, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 14 }}
        className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground"
      >
        <ShoppingBag className="size-7" aria-hidden />
      </motion.span>
    );
    title = "Ta pizza t'attend au comptoir !";
    body = waiting > 0 ? `Sortie du four il y a ${formatDuration(waiting)}. Viens vite, elle est chaude.` : "Elle vient de sortir du four. Viens vite, elle est chaude.";
  } else if (hasEta) {
    // Same clock as the ring (ticks every second), so title and ring agree.
    const remainingMs = new Date(order.estimatedReadyAt!).getTime() - now;
    icon = <CountdownRing order={order} now={now} />;
    title =
      remainingMs > 0 ? `Prête dans ${formatDuration(Math.ceil(remainingMs / 60_000))}` : "Encore quelques instants…";
    body =
      remainingMs > 0
        ? `Le pizzaiolo l'annonce pour ${formatTime(order.estimatedReadyAt!)}.`
        : `Annoncée pour ${formatTime(order.estimatedReadyAt!)}, elle arrive : le four fait de son mieux.`;
  } else if (order.status === "PREPARING") {
    icon = <Flame className="size-10 animate-pulse text-accent" aria-hidden />;
    title = "Ta pizza est au four";
    body = `${slotLine}. Le pizzaiolo va bientôt annoncer le délai.`;
  } else if (order.status === "CONFIRMED") {
    icon = <ChefHat className="size-10 text-primary" aria-hidden />;
    title = "Commande confirmée";
    body = `${slotLine}. La préparation démarrera juste avant.`;
  } else {
    icon = <Store className="size-10 text-primary" aria-hidden />;
    title = "Commande reçue";
    body = `${slotLine}. La pizzeria va la confirmer dans un instant.`;
  }

  return (
    <Card className="overflow-hidden p-0">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={order.status + (hasEta ? "-eta" : "")}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="flex flex-col items-center gap-5 p-6 text-center sm:flex-row sm:text-left"
        >
          <div className="flex shrink-0 justify-center">{icon}</div>
          <div aria-live="polite">
            <h2 className="font-display text-2xl leading-tight sm:text-3xl">{title}</h2>
            <p className="mt-2 text-muted-foreground">{body}</p>
          </div>
        </motion.div>
      </AnimatePresence>
    </Card>
  );
}

function Timeline({ order }: { order: Order }) {
  const cancelled = order.status === "CANCELLED";
  const currentIndex = STEPS.findIndex((s) => s.status === order.status);

  return (
    <Card className="p-6">
      <h2 className="mb-4 font-semibold">Étapes</h2>
      <ol className="relative">
        {STEPS.map((step, i) => {
          const at = step.at(order);
          const reached = cancelled ? at !== null : i <= currentIndex;
          const active = !cancelled && i === currentIndex && !TERMINAL.includes(order.status);
          const last = i === STEPS.length - 1;
          return (
            <li key={step.status} className="relative flex gap-4 pb-5 last:pb-0">
              {!last && (
                <span
                  className={`absolute top-8 left-[15px] h-[calc(100%-2rem)] w-0.5 ${
                    !cancelled && i < currentIndex ? "bg-primary" : "bg-border"
                  }`}
                  aria-hidden
                />
              )}
              <span
                className={`relative flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                  reached && !active
                    ? "border-primary bg-primary text-primary-foreground"
                    : active
                      ? "border-primary bg-card text-primary"
                      : "border-border bg-card text-muted-foreground"
                }`}
              >
                {active && <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" aria-hidden />}
                {reached && !active ? <Check className="size-4" aria-hidden /> : i + 1}
              </span>
              <div className="flex min-h-8 flex-1 items-center justify-between gap-3">
                <span className={reached ? "font-medium" : "text-muted-foreground"}>
                  {step.label}
                  {active && <span className="sr-only"> (étape en cours)</span>}
                </span>
                <span className="text-sm text-muted-foreground tabular-nums">{at ? formatTime(at) : "—"}</span>
              </div>
            </li>
          );
        })}
        {cancelled && (
          <li className="mt-5 flex items-center gap-4 text-destructive">
            <XCircle className="size-8 shrink-0" aria-hidden />
            <div className="flex flex-1 items-center justify-between gap-3">
              <span className="font-medium">Annulée</span>
              <span className="text-sm tabular-nums">{order.cancelledAt ? formatTime(order.cancelledAt) : "—"}</span>
            </div>
          </li>
        )}
      </ol>
    </Card>
  );
}

function OrderDetails({ order }: { order: Order }) {
  const subtotal = order.items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);

  return (
    <Card className="p-6">
      <h2 className="mb-4 font-semibold">Ta commande</h2>
      <ul className="space-y-3">
        {order.items.map((item) => (
          <li key={item.id} className="flex items-center gap-3">
            <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
              {item.pizza.imageUrl ? (
                <img src={resolveImageUrl(item.pizza.imageUrl)!} alt="" className="absolute inset-0 size-full object-cover" />
              ) : (
                <PizzaIcon className="m-3 size-6 text-primary/60" aria-hidden />
              )}
            </div>
            <span className="flex-1">
              <span className="font-semibold tabular-nums">{item.quantity}×</span> {item.pizza.name}
            </span>
            <span className="text-sm text-muted-foreground tabular-nums">
              {formatPrice(item.unitPriceCents * item.quantity)}
            </span>
          </li>
        ))}
      </ul>

      <dl className="mt-4 space-y-1 border-t pt-4 text-sm">
        {order.discountCents > 0 && (
          <>
            <div className="flex justify-between text-muted-foreground">
              <dt>Sous-total</dt>
              <dd className="tabular-nums">{formatPrice(subtotal)}</dd>
            </div>
            <div className="flex justify-between text-primary">
              <dt className="flex items-center gap-1.5">
                <Gift className="size-4" aria-hidden /> Pizza offerte (carte fidélité)
              </dt>
              <dd className="tabular-nums">−{formatPrice(order.discountCents)}</dd>
            </div>
          </>
        )}
        <div className="flex justify-between text-base font-semibold">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatPrice(order.totalCents)}</dd>
        </div>
      </dl>

      <div className="mt-4 space-y-2 rounded-lg bg-muted/60 p-3 text-sm">
        <p className="flex items-center gap-2">
          <Clock className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="first-letter:uppercase">
            {formatSlotDay(order.timeSlot.startsAt)} à {formatTime(order.timeSlot.startsAt)}
          </span>
        </p>
        {order.pointsEarned > 0 && order.status !== "CANCELLED" && (
          <p className="flex items-center gap-2">
            <Gift className="size-4 shrink-0 text-primary" aria-hidden />+{order.pointsEarned} tampon
            {order.pointsEarned > 1 ? "s" : ""} sur ta carte fidélité
          </p>
        )}
      </div>
    </Card>
  );
}

export default function OrderTracking() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const statusRef = useRef<OrderStatus | null>(null);
  statusRef.current = order?.status ?? null;
  const now = useNow(1000);

  useEffect(() => {
    if (!orderId) return;
    const id = orderId;

    let cancelled = false;
    async function load() {
      try {
        const data = await fetchOrder(id);
        if (!cancelled) {
          setOrder(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erreur inconnue.");
      }
    }
    const refresh = () => {
      const isTerminal = statusRef.current !== null && TERMINAL.includes(statusRef.current);
      if (!document.hidden && !isTerminal) load();
    };

    load();
    const interval = setInterval(refresh, POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [orderId]);

  // Show the live status in the browser tab, so a customer on another tab sees "Prête !".
  const status = order?.status;
  useEffect(() => {
    if (!status) return;
    const previous = document.title;
    document.title = `${TAB_TITLES[status]} · App Pizza`;
    return () => {
      document.title = previous;
    };
  }, [status]);

  if (error && !order) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-muted-foreground">{error}</p>
        <Link to="/" className="text-sm underline-offset-4 hover:underline">
          Retour à l'accueil
        </Link>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Chargement de ta commande...
      </div>
    );
  }

  const live = !TERMINAL.includes(order.status);

  return (
    <div className="min-h-screen">
      <header className="bg-hero text-hero-foreground">
        <div className="mx-auto max-w-2xl px-4 pt-5 pb-16">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-hero-muted hover:text-hero-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden /> App Pizza
          </Link>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm tracking-widest text-hero-muted uppercase">Réf {order.id.slice(0, 8)}</p>
              <h1 className="font-display text-3xl tracking-wide sm:text-4xl">
                {order.client?.name ? `Merci ${order.client.name.split(" ")[0]} !` : "Suivi de commande"}
              </h1>
            </div>
            {live && (
              <span className="flex items-center gap-2 rounded-full bg-hero-foreground/10 px-3 py-1 text-sm">
                <span className="relative flex size-2.5">
                  <span className="absolute inset-0 animate-ping rounded-full bg-hero-foreground/60" aria-hidden />
                  <span className="relative size-2.5 rounded-full bg-hero-foreground" />
                </span>
                Suivi en direct
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto -mt-10 max-w-2xl space-y-6 px-4 pb-12">
        {error && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <WifiOff className="size-4 shrink-0" aria-hidden />
            Connexion perdue, nouvel essai dans quelques secondes.
          </div>
        )}

        <StatusHero order={order} now={now} />
        <Timeline order={order} />
        <OrderDetails order={order} />

        <p className="text-center">
          <Link to="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            Passer une nouvelle commande
          </Link>
        </p>
      </main>
    </div>
  );
}
