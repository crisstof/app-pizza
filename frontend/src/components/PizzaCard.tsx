import { motion } from "framer-motion";
import { Minus, Pizza as PizzaIcon, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Pizza } from "@/api";
import { formatPrice } from "@/lib/format";

export function PizzaCard({
  pizza,
  quantity,
  onChange,
}: {
  pizza: Pizza;
  quantity: number;
  onChange: (delta: number) => void;
}) {
  const selected = quantity > 0;

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md ${
        selected ? "border-primary ring-2 ring-primary" : "border-border"
      }`}
    >
      <div className="relative aspect-[4/3] bg-muted">
        {pizza.imageUrl ? (
          <img
            src={pizza.imageUrl}
            alt={pizza.name}
            loading="lazy"
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-primary/60">
            <PizzaIcon className="size-10" aria-hidden />
          </div>
        )}
        {selected && (
          <span className="absolute top-2 right-2 rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
            {quantity} dans le panier
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-display text-lg leading-tight">{pizza.name}</h3>
        <p className="mt-1 flex-1 text-sm text-muted-foreground">{pizza.description}</p>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-lg font-semibold">{formatPrice(pizza.priceCents)}</span>

          {selected ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="size-9 rounded-full"
                aria-label={`Retirer une ${pizza.name}`}
                onClick={() => onChange(-1)}
              >
                <Minus className="size-4" />
              </Button>
              <motion.span
                key={quantity}
                initial={{ scale: 1.3 }}
                animate={{ scale: 1 }}
                className="w-5 text-center font-semibold tabular-nums"
                aria-live="polite"
              >
                {quantity}
              </motion.span>
              <Button
                type="button"
                size="icon"
                className="size-9 rounded-full"
                aria-label={`Ajouter une ${pizza.name}`}
                onClick={() => onChange(1)}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          ) : (
            <Button type="button" size="sm" onClick={() => onChange(1)}>
              <Plus className="size-4" /> Ajouter
            </Button>
          )}
        </div>
      </div>
    </motion.article>
  );
}
