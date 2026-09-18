import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Pizza as PizzaIcon } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  createOrder,
  fetchPizzas,
  fetchTimeSlots,
  type Pizza,
  type TimeSlot,
} from "@/api";
import { CartFooter } from "@/components/CartFooter";
import { PizzaCard } from "@/components/PizzaCard";
import { TimeSlotPicker } from "@/components/TimeSlotPicker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

function SectionTitle({ step, title }: { step: number; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
        {step}
      </span>
      <h2 className="font-display text-lg tracking-wide">{title}</h2>
    </div>
  );
}

export default function CustomerBooking() {
  const navigate = useNavigate();
  const [pizzas, setPizzas] = useState<Pizza[]>([]);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([fetchPizzas(), fetchTimeSlots()])
      .then(([p, s]) => {
        setPizzas(p);
        setSlots(s);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  const items = useMemo(
    () =>
      Object.entries(quantities)
        .filter(([, qty]) => qty > 0)
        .map(([pizzaId, quantity]) => ({ pizzaId, quantity })),
    [quantities]
  );

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  const totalCents = useMemo(
    () =>
      items.reduce((sum, item) => {
        const pizza = pizzas.find((p) => p.id === item.pizzaId);
        return sum + (pizza?.priceCents ?? 0) * item.quantity;
      }, 0),
    [items, pizzas]
  );

  function setQuantity(pizzaId: string, delta: number) {
    setQuantities((prev) => ({
      ...prev,
      [pizzaId]: Math.max(0, (prev[pizzaId] ?? 0) + delta),
    }));
  }

  async function handleSubmit() {
    if (items.length === 0) {
      toast.error("Choisis au moins une pizza.");
      return;
    }
    if (!selectedSlotId) {
      toast.error("Choisis un créneau horaire.");
      return;
    }
    if (!name || !email) {
      toast.error("Renseigne ton nom et ton email.");
      return;
    }

    setSubmitting(true);
    try {
      const order = await createOrder({
        clientName: name,
        clientEmail: email,
        clientPhone: phone || undefined,
        timeSlotId: selectedSlotId,
        items,
      });
      toast.success("Commande confirmée !");
      navigate(`/suivi/${order.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Chargement du menu...
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-6">
          <div className="flex items-center gap-3">
            <motion.div
              initial={{ rotate: -15, scale: 0.8 }}
              animate={{ rotate: 0, scale: 1 }}
              className="flex size-11 items-center justify-center rounded-2xl bg-primary/10"
            >
              <PizzaIcon className="size-6 text-primary" />
            </motion.div>
            <div>
              <h1 className="font-display text-2xl tracking-wide">App Pizza</h1>
              <p className="text-sm text-muted-foreground">
                Réserve ton créneau et commande en ligne
              </p>
            </div>
          </div>
          <Link
            to="/pizzaiolo"
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            Espace pizzaiolo
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        <section className="mb-10">
          <SectionTitle step={1} title="Choisis tes pizzas" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {pizzas.map((pizza) => (
              <PizzaCard
                key={pizza.id}
                pizza={pizza}
                quantity={quantities[pizza.id] ?? 0}
                onChange={(delta) => setQuantity(pizza.id, delta)}
              />
            ))}
          </div>
        </section>

        <Separator className="mb-10" />

        <section className="mb-10">
          <SectionTitle step={2} title="Choisis un créneau" />
          <TimeSlotPicker
            slots={slots}
            selectedId={selectedSlotId}
            onSelect={setSelectedSlotId}
          />
        </section>

        <Separator className="mb-10" />

        <section>
          <SectionTitle step={3} title="Tes coordonnées" />
          <div className="grid max-w-sm gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="name">Nom</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jean Dupont"
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="toi@exemple.com"
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="phone">Téléphone (optionnel)</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="06 12 34 56 78"
              />
            </div>
          </div>
        </section>
      </main>

      <CartFooter
        totalCents={totalCents}
        itemCount={itemCount}
        submitting={submitting}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
