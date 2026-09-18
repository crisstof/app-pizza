import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, Pizza as PizzaIcon, XCircle } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { fetchOrder, type Order, type OrderStatus } from "@/api";
import { Card } from "@/components/ui/card";

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: "PENDING", label: "Reçue" },
  { status: "CONFIRMED", label: "Confirmée" },
  { status: "PREPARING", label: "En préparation" },
  { status: "READY", label: "Prête" },
  { status: "PICKED_UP", label: "Récupérée" },
];

function formatSlot(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusStepper({ status }: { status: OrderStatus }) {
  if (status === "CANCELLED") {
    return (
      <div className="flex items-center gap-3 text-destructive">
        <XCircle className="size-8" />
        <div>
          <p className="font-semibold">Commande annulée</p>
          <p className="text-sm text-muted-foreground">
            Contacte la pizzeria si tu penses qu'il y a une erreur.
          </p>
        </div>
      </div>
    );
  }

  const currentIndex = STEPS.findIndex((s) => s.status === status);

  return (
    <div className="flex items-start justify-between">
      {STEPS.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <div key={step.status} className="flex flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              <div className="flex-1">{i > 0 && <div className={`h-0.5 ${done || active ? "bg-primary" : "bg-border"}`} />}</div>
            </div>
            <motion.div
              initial={false}
              animate={{ scale: active ? 1.15 : 1 }}
              className={`flex size-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${
                done
                  ? "border-primary bg-primary text-primary-foreground"
                  : active
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground"
              }`}
            >
              {done ? <Check className="size-4" /> : i + 1}
            </motion.div>
            <span
              className={`mt-2 text-xs ${active ? "font-semibold text-foreground" : "text-muted-foreground"}`}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function OrderTracking() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const statusRef = useRef<OrderStatus | null>(null);
  statusRef.current = order?.status ?? null;

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

    load();
    const interval = setInterval(() => {
      const isTerminal = statusRef.current === "PICKED_UP" || statusRef.current === "CANCELLED";
      if (!isTerminal) load();
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [orderId]);

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

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-6">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10">
            <PizzaIcon className="size-6 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl tracking-wide">Suivi de commande</h1>
            <p className="text-sm text-muted-foreground">Réf {order.id.slice(0, 8)}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10">
        <Card className="mb-8 p-6">
          <StatusStepper status={order.status} />
        </Card>

        <Card className="p-6">
          <h2 className="mb-3 font-semibold">Détails</h2>
          <ul className="mb-3 space-y-1 text-sm">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between">
                <span>
                  {item.quantity}× {item.pizza.name}
                </span>
                <span className="text-muted-foreground">
                  {((item.pizza.priceCents * item.quantity) / 100).toFixed(2)} €
                </span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between border-t pt-3 text-sm font-semibold">
            <span>Total</span>
            <span>{(order.totalCents / 100).toFixed(2)} €</span>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Créneau : {formatSlot(order.timeSlot.startsAt)}
          </p>
        </Card>

        <p className="mt-6 text-center">
          <Link to="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            Passer une nouvelle commande
          </Link>
        </p>
      </main>
    </div>
  );
}
