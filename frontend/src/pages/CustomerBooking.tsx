import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDown, CalendarClock, Clock, Flame, Gift, Pizza as PizzaIcon, ShoppingBag, User } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  createOrder,
  fetchPizzas,
  fetchShopHours,
  fetchTimeSlots,
  LOYALTY_REWARD_THRESHOLD,
  type Pizza,
  type ShopHours,
  type TimeSlot,
} from "@/api";
import { useAuth } from "@/context/AuthContext";
import { CartFooter } from "@/components/CartFooter";
import { CartSummary } from "@/components/CartSummary";
import { PizzaCard } from "@/components/PizzaCard";
import { TimeSlotPicker } from "@/components/TimeSlotPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatHour, WEEKDAYS } from "@/lib/format";
import { previewReward } from "@/lib/loyalty";

const HERO_IMAGE = "/images/hero.jpg";

const MENU_FILTERS: { key: string; label: string; match: (p: Pizza) => boolean }[] = [
  { key: "all", label: "Toutes", match: () => true },
  { key: "tomato", label: "Base tomate", match: (p) => p.category === "TOMATO" },
  { key: "cream", label: "Base crème", match: (p) => p.category === "CREAM" },
  { key: "special", label: "Spécialités", match: (p) => p.category === "SPECIAL" },
  { key: "vegetarian", label: "Végétariennes", match: (p) => p.tags.includes("vegetarian") },
];

function HowItWorks({ hours }: { hours: ShopHours | null }) {
  const steps = [
    { icon: PizzaIcon, title: "Choisis tes pizzas", text: "Classiques, base crème ou spécialités." },
    {
      icon: CalendarClock,
      title: "Réserve ton créneau",
      text: hours ? `Jusqu'à ${hours.daysAhead} jour${hours.daysAhead > 1 ? "s" : ""} à l'avance.` : "Midi ou soir, à l'avance.",
    },
    { icon: ShoppingBag, title: "Récupère-la bien chaude", text: "Elle sort du four à l'heure que tu as choisie." },
  ];
  return (
    <section aria-label="Comment ça marche" className="relative z-10 mx-auto -mt-12 max-w-6xl px-4">
      <ol className="grid gap-4 rounded-2xl border border-border bg-card p-6 shadow-lg sm:grid-cols-3">
        {steps.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="flex items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon className="size-5" aria-hidden />
            </span>
            <div>
              <p className="font-display text-lg leading-tight">
                <span className="text-primary">{i + 1}.</span> {title}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

// Shop hours come from the back-office settings (Créneaux et horaires).
function openDaysLabel(closedWeekdays: number[]) {
  if (closedWeekdays.length === 0) return "7 jours sur 7";
  const names = [1, 2, 3, 4, 5, 6, 0].filter((d) => closedWeekdays.includes(d)).map((d) => WEEKDAYS[d].toLowerCase());
  return `Fermé le ${names.join(", le ")}`;
}

function Footer({ hours }: { hours: ShopHours | null }) {
  return (
    <footer className="mt-16 bg-hero text-hero-foreground">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div>
          <p className="font-display flex items-center gap-2 text-2xl">
            <PizzaIcon className="size-6" aria-hidden /> App Pizza
          </p>
          <p className="mt-2 text-sm text-hero-muted">Pizzas cuites au feu de bois, à emporter.</p>
        </div>
        <div>
          <p className="mb-2 flex items-center gap-2 font-semibold">
            <Clock className="size-4" aria-hidden /> Horaires
          </p>
          {hours && (
            <>
              <p className="text-sm text-hero-muted">{openDaysLabel(hours.closedWeekdays)}</p>
              {hours.lunchOpen && (
                <p className="text-sm text-hero-muted">
                  Midi : {formatHour(hours.lunchStart)} – {formatHour(hours.lunchEnd)}
                </p>
              )}
              {hours.dinnerOpen && (
                <p className="text-sm text-hero-muted">
                  Soir : {formatHour(hours.dinnerStart)} – {formatHour(hours.dinnerEnd)}
                </p>
              )}
            </>
          )}
        </div>
        <nav aria-label="Liens" className="flex flex-col gap-2 text-sm text-hero-muted">
          <Link to="/compte" className="hover:text-hero-foreground">Mon compte</Link>
          <Link to="/inscription" className="hover:text-hero-foreground">Carte fidélité : 10 pizzas, 1 offerte</Link>
          <Link to="/pizzaiolo" className="hover:text-hero-foreground">Espace pizzaiolo</Link>
        </nav>
      </div>
    </footer>
  );
}

function SectionTitle({ step, title }: { step: number; title: string }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
        {step}
      </span>
      <h2 className="font-display text-2xl tracking-wide">{title}</h2>
    </div>
  );
}

function Hero({ onOrder }: { onOrder: () => void }) {
  const [imageOk, setImageOk] = useState(true);

  return (
    <section className="relative isolate overflow-hidden bg-hero text-hero-foreground">
      {imageOk && (
        <>
          <img
            src={HERO_IMAGE}
            alt=""
            onError={() => setImageOk(false)}
            className="absolute inset-0 -z-20 size-full object-cover"
          />
          <div className="absolute inset-0 -z-10 bg-linear-to-b from-hero/80 via-hero/60 to-hero/90" aria-hidden />
        </>
      )}
      <div className="mx-auto flex max-w-6xl flex-col items-center px-4 pt-20 pb-28 text-center sm:pt-28 sm:pb-36">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 flex items-center gap-2 text-sm tracking-widest text-hero-muted uppercase"
        >
          <Flame className="size-4" aria-hidden /> Cuites au feu de bois
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="font-display text-4xl leading-tight sm:text-6xl"
        >
          Ta pizza sort du four
          <br />à l'heure que tu choisis
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-4 max-w-xl text-base text-hero-muted sm:text-lg"
        >
          Choisis tes pizzas, réserve ton créneau de retrait, et on s'occupe du reste.
        </motion.p>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <Button
            size="lg"
            onClick={onOrder}
            className="mt-8 bg-hero-foreground text-hero hover:bg-hero-foreground/90"
          >
            Voir la carte <ArrowDown className="size-4" />
          </Button>
        </motion.div>
      </div>
    </section>
  );
}

export default function CustomerBooking() {
  const navigate = useNavigate();
  const { client, refresh } = useAuth();
  const [pizzas, setPizzas] = useState<Pizza[]>([]);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [menuFilter, setMenuFilter] = useState("all");
  const [hours, setHours] = useState<ShopHours | null>(null);

  useEffect(() => {
    Promise.all([fetchPizzas(), fetchTimeSlots()])
      .then(([p, s]) => {
        setPizzas(p);
        setSlots(s);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
    // Footer / lunch-dinner split only: the page works without it.
    fetchShopHours().then(setHours).catch(() => {});
  }, []);

  const lines = useMemo(
    () =>
      pizzas
        .filter((pizza) => (quantities[pizza.id] ?? 0) > 0)
        .map((pizza) => ({ pizza, quantity: quantities[pizza.id] })),
    [pizzas, quantities]
  );
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  const subtotalCents = lines.reduce((sum, l) => sum + l.pizza.priceCents * l.quantity, 0);
  const discountCents = previewReward(lines, client ? client.loyaltyPoints : null);
  const totalCents = subtotalCents - discountCents;
  const selectedSlot = slots.find((s) => s.id === selectedSlotId);
  const activeFilter = MENU_FILTERS.find((f) => f.key === menuFilter) ?? MENU_FILTERS[0];
  const visiblePizzas = pizzas.filter(activeFilter.match);

  function setQuantity(pizzaId: string, delta: number) {
    setQuantities((prev) => ({
      ...prev,
      [pizzaId]: Math.max(0, (prev[pizzaId] ?? 0) + delta),
    }));
  }

  function scrollToMenu() {
    document.getElementById("menu")?.scrollIntoView({ behavior: "smooth" });
  }

  async function handleSubmit() {
    if (lines.length === 0) {
      toast.error("Choisis au moins une pizza.");
      return;
    }
    if (!selectedSlotId) {
      toast.error("Choisis un créneau horaire.");
      document.getElementById("creneau")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    if (!client && (!name || !email)) {
      toast.error("Renseigne ton nom et ton email.");
      document.getElementById("coordonnees")?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    setSubmitting(true);
    try {
      const order = await createOrder({
        clientName: client ? undefined : name,
        clientEmail: client ? undefined : email,
        clientPhone: phone || undefined,
        timeSlotId: selectedSlotId,
        items: lines.map((l) => ({ pizzaId: l.pizza.id, quantity: l.quantity })),
      });
      toast.success("Commande confirmée");
      if (client) refresh();
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
        Chargement du menu…
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 lg:pb-0">
      <header className="sticky top-0 z-20 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <PizzaIcon className="size-6 text-primary" aria-hidden />
            <span className="font-display text-xl tracking-wide text-primary">App Pizza</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            {client ? (
              <Link to="/compte" className="flex items-center gap-1.5 hover:text-primary">
                <User className="size-4" aria-hidden />
                <span className="hidden sm:inline">{client.name}</span>
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
                  {Math.min(client.loyaltyPoints, LOYALTY_REWARD_THRESHOLD)}/{LOYALTY_REWARD_THRESHOLD}
                </span>
              </Link>
            ) : (
              <Link to="/connexion" className="hover:text-primary">
                Connexion
              </Link>
            )}
            <Link to="/pizzaiolo" className="text-muted-foreground hover:text-primary">
              Espace pizzaiolo
            </Link>
          </nav>
        </div>
      </header>

      <Hero onOrder={scrollToMenu} />
      <HowItWorks hours={hours} />

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-12 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-14">
          <section id="menu" className="scroll-mt-20">
            <SectionTitle step={1} title="Nos pizzas" />
            <div
              className="mb-6 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden"
              role="group"
              aria-label="Filtrer la carte"
            >
              {MENU_FILTERS.map((filter) => {
                const count = pizzas.filter(filter.match).length;
                if (count === 0) return null;
                const active = filter.key === menuFilter;
                return (
                  <button
                    key={filter.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setMenuFilter(filter.key)}
                    className={`flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm transition-colors ${
                      active
                        ? "border-primary bg-primary font-semibold text-primary-foreground"
                        : "border-border bg-card hover:border-primary/60"
                    }`}
                  >
                    {filter.label}
                    <span
                      className={`rounded-full px-1.5 text-xs tabular-nums ${
                        active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {visiblePizzas.map((pizza) => (
                <PizzaCard
                  key={pizza.id}
                  pizza={pizza}
                  quantity={quantities[pizza.id] ?? 0}
                  onChange={(delta) => setQuantity(pizza.id, delta)}
                />
              ))}
            </div>
          </section>

          <section id="creneau" className="scroll-mt-20">
            <SectionTitle step={2} title="Ton créneau de retrait" />
            <TimeSlotPicker
              slots={slots}
              selectedId={selectedSlotId}
              onSelect={setSelectedSlotId}
              eveningStartMinutes={hours?.dinnerStart}
            />
          </section>

          <section id="coordonnees" className="scroll-mt-20">
            <SectionTitle step={3} title="Tes coordonnées" />
            <div className="grid max-w-md gap-4">
              {client ? (
                <p className="text-sm text-muted-foreground">
                  Connecté en tant que <span className="font-medium text-foreground">{client.name}</span> (
                  {client.email})
                </p>
              ) : (
                <>
                  <div className="grid gap-1.5">
                    <Label htmlFor="name">Nom</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jean Dupont" required />
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
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Gift className="size-4 text-accent" aria-hidden />
                    <span>
                      <Link to="/inscription" className="text-primary underline-offset-4 hover:underline">
                        Crée un compte
                      </Link>{" "}
                      pour cumuler des tampons : 10 pizzas, la suivante offerte.
                    </span>
                  </p>
                </>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="phone">Téléphone (optionnel)</Label>
                <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="06 12 34 56 78" />
              </div>
            </div>
          </section>
        </div>

        <div className="hidden lg:block">
          <div className="sticky top-20">
            <CartSummary
              lines={lines}
              slot={selectedSlot}
              totalCents={totalCents}
              discountCents={discountCents}
              itemCount={itemCount}
              loyaltyPoints={client ? client.loyaltyPoints : null}
              submitting={submitting}
              onSubmit={handleSubmit}
            />
          </div>
        </div>
      </main>

      <Footer hours={hours} />

      <div className="lg:hidden">
        <CartFooter totalCents={totalCents} itemCount={itemCount} submitting={submitting} onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
