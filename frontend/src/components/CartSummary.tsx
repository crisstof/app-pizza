import { AnimatePresence, motion } from "framer-motion";
import { Clock, Gift, Loader2, ShoppingBag } from "lucide-react";
import { LOYALTY_REWARD_THRESHOLD, type Pizza, type TimeSlot } from "@/api";
import { Button } from "@/components/ui/button";
import { formatPrice, formatTime } from "@/lib/format";

function formatSlot(slot: TimeSlot) {
  const start = new Date(slot.startsAt);
  const day = start.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return `${day} à ${formatTime(start)}`;
}

export function CartSummary({
  lines,
  slot,
  totalCents,
  discountCents,
  itemCount,
  loyaltyPoints,
  submitting,
  onSubmit,
}: {
  lines: { pizza: Pizza; quantity: number }[];
  slot: TimeSlot | undefined;
  totalCents: number;
  discountCents: number;
  itemCount: number;
  loyaltyPoints: number | null;
  submitting: boolean;
  onSubmit: () => void;
}) {
  const rewardApplies = discountCents > 0;

  return (
    <aside className="rounded-xl border border-border bg-card p-5" aria-label="Ton panier">
      <h2 className="font-display mb-4 flex items-center gap-2 text-xl">
        <ShoppingBag className="size-5 text-primary" aria-hidden /> Ton panier
      </h2>

      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ajoute une pizza pour commencer.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          <AnimatePresence initial={false}>
            {lines.map(({ pizza, quantity }) => (
              <motion.li
                key={pizza.id}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex justify-between"
              >
                <span>
                  {quantity}× {pizza.name}
                </span>
                <span className="tabular-nums">{formatPrice(pizza.priceCents * quantity)}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
        <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
        {slot ? <span className="text-foreground first-letter:uppercase">{formatSlot(slot)}</span> : "Choisis un créneau"}
      </p>

      {rewardApplies && (
        <div className="mt-3 flex justify-between text-sm text-accent">
          <span>Pizza offerte (fidélité)</span>
          <span className="tabular-nums">−{formatPrice(discountCents)}</span>
        </div>
      )}

      <div className="mt-4 flex justify-between border-t border-border pt-4 text-lg font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{formatPrice(totalCents)}</span>
      </div>

      {loyaltyPoints !== null && (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-accent/10 px-3 py-2 text-xs text-accent">
          <Gift className="size-4 shrink-0" aria-hidden />
          {loyaltyPoints >= LOYALTY_REWARD_THRESHOLD
            ? "Ta pizza la moins chère est offerte sur cette commande"
            : `+${itemCount} tampon${itemCount > 1 ? "s" : ""} · ${Math.min(loyaltyPoints, LOYALTY_REWARD_THRESHOLD)}/${LOYALTY_REWARD_THRESHOLD} sur ta carte`}
        </p>
      )}

      <Button type="button" size="lg" className="mt-4 w-full" disabled={submitting} onClick={onSubmit}>
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Envoi…
          </>
        ) : (
          "Commander"
        )}
      </Button>
    </aside>
  );
}
