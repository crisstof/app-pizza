import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Pizza as PizzaIcon } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { fetchMyOrders, LOYALTY_REWARD_THRESHOLD, type Order } from "@/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function LoyaltyCard({ points }: { points: number }) {
  const stamps = Math.min(points, LOYALTY_REWARD_THRESHOLD);
  const ready = points >= LOYALTY_REWARD_THRESHOLD;

  return (
    <Card className="p-6">
      <h2 className="font-display mb-1 text-lg tracking-wide">Carte fidélité</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {ready
          ? "Ta prochaine commande t'offre la pizza la moins chère 🎉"
          : `1 tampon par pizza commandée · encore ${LOYALTY_REWARD_THRESHOLD - stamps} pour une pizza gratuite`}
      </p>
      <div className="grid grid-cols-5 gap-3">
        {Array.from({ length: LOYALTY_REWARD_THRESHOLD }).map((_, i) => {
          const filled = i < stamps;
          return (
            <motion.div
              key={i}
              initial={false}
              animate={{ scale: filled ? 1 : 0.9 }}
              className={`flex aspect-square items-center justify-center rounded-full border-2 ${
                filled ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"
              }`}
            >
              {filled ? <Check className="size-4" /> : <PizzaIcon className="size-4 opacity-40" />}
            </motion.div>
          );
        })}
      </div>
    </Card>
  );
}

export default function Account() {
  const { client, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    if (!loading && !client) navigate("/connexion");
  }, [loading, client, navigate]);

  useEffect(() => {
    if (client) fetchMyOrders().then(setOrders).catch(() => setOrders([]));
  }, [client]);

  if (loading || !client) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Chargement...
      </div>
    );
  }

  async function handleLogout() {
    await logout();
    toast.success("À bientôt !");
    navigate("/");
  }

  return (
    <div className="min-h-screen pb-16">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-6">
          <div>
            <h1 className="font-display text-2xl tracking-wide">Bonjour {client.name}</h1>
            <p className="text-sm text-muted-foreground">{client.email}</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            Déconnexion
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        <section className="mb-10">
          <LoyaltyCard points={client.loyaltyPoints} />
        </section>

        <Separator className="mb-10" />

        <section>
          <h2 className="font-display mb-4 text-lg tracking-wide">Mes commandes</h2>
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune commande pour l'instant.</p>
          ) : (
            <div className="space-y-2">
              {orders.map((order) => (
                <Link key={order.id} to={`/suivi/${order.id}`}>
                  <Card className="flex items-center justify-between p-4 transition-colors hover:border-primary/50">
                    <div>
                      <p className="text-sm text-muted-foreground">{formatDate(order.createdAt)}</p>
                      <p className="text-sm">
                        {order.items.map((i) => `${i.quantity}× ${i.pizza.name}`).join(", ")}
                      </p>
                    </div>
                    <span className="font-semibold">{(order.totalCents / 100).toFixed(2)} €</span>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        <p className="mt-8 text-center">
          <Link to="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            Commander
          </Link>
        </p>
      </main>
    </div>
  );
}
