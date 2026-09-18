import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChefHat, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { fetchOrders, updateOrderStatus, type Order, type OrderStatus } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

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

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function PizzaSummary({ orders }: { orders: Order[] }) {
  const counts = new Map<string, number>();
  for (const order of orders) {
    if (order.status === "CANCELLED" || order.status === "PICKED_UP") continue;
    for (const item of order.items) {
      counts.set(item.pizza.name, (counts.get(item.pizza.name) ?? 0) + item.quantity);
    }
  }
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Rien à préparer pour l'instant.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([name, qty]) => (
        <Badge key={name} variant="outline" className="gap-1.5 px-3 py-1 text-sm">
          <span className="font-bold">{qty}×</span> {name}
        </Badge>
      ))}
    </div>
  );
}

function OrderCard({
  order,
  onAdvance,
}: {
  order: Order;
  onAdvance: (order: Order, status: OrderStatus) => void;
}) {
  const config = STATUS_CONFIG[order.status];
  const itemsLabel = order.items.map((i) => `${i.quantity}× ${i.pizza.name}`).join(", ");

  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">{order.client.name}</span>
            <Badge variant={config.variant}>{config.label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{itemsLabel}</p>
          <p className="text-xs text-muted-foreground">
            {(order.totalCents / 100).toFixed(2)} € · Réf {order.id.slice(0, 8)}
          </p>
        </div>

        {config.next && (
          <Button size="sm" onClick={() => onAdvance(order, config.next!.status)}>
            {config.next.label}
          </Button>
        )}
      </Card>
    </motion.div>
  );
}

export default function PizzaioloDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setOrders(await fetchOrders());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdvance(order: Order, status: OrderStatus) {
    try {
      const updated = await updateOrderStatus(order.id, status);
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      toast.success(`${order.client.name} · ${STATUS_CONFIG[status].label}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur inconnue.");
    }
  }

  const bySlot = new Map<string, Order[]>();
  for (const order of orders) {
    const key = order.timeSlot.startsAt;
    bySlot.set(key, [...(bySlot.get(key) ?? []), order]);
  }
  const slots = [...bySlot.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="theme-staff min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10">
              <ChefHat className="size-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Espace pizzaiolo</h1>
              <p className="text-sm text-muted-foreground">Commandes du jour</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={load} title="Rafraîchir">
              <RefreshCw className="size-4" />
            </Button>
            <Link to="/" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
              Vue client
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <section className="mb-10">
          <h2 className="mb-3 text-lg font-semibold">Pizzas à préparer</h2>
          <PizzaSummary orders={orders} />
        </section>

        <Separator className="mb-10" />

        <section>
          <h2 className="mb-4 text-lg font-semibold">Commandes par créneau</h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Chargement...</p>
          ) : slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune commande aujourd'hui.</p>
          ) : (
            <div className="space-y-8">
              {slots.map(([startsAt, slotOrders]) => (
                <div key={startsAt}>
                  <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                    {formatTime(startsAt)}
                  </h3>
                  <div className="space-y-2">
                    {slotOrders.map((order) => (
                      <OrderCard key={order.id} order={order} onAdvance={handleAdvance} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
