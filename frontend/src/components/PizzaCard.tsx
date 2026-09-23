import { motion } from "framer-motion";
import { Flame, Leaf, Minus, Pizza as PizzaIcon, Plus, Sparkles, Star, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveImageUrl, type Pizza, type PizzaTag } from "@/api";
import { formatPrice } from "@/lib/format";

const TAG_BADGES: Record<PizzaTag, { label: string; icon: LucideIcon; iconClass: string }> = {
  popular: { label: "Populaire", icon: Star, iconClass: "text-accent" },
  new: { label: "Nouveau", icon: Sparkles, iconClass: "text-accent" },
  spicy: { label: "Épicée", icon: Flame, iconClass: "text-primary" },
  vegetarian: { label: "Végétarienne", icon: Leaf, iconClass: "text-primary" },
};
const TAG_ORDER: PizzaTag[] = ["popular", "new", "spicy", "vegetarian"];

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
  const soldOut = !pizza.available;
  const image = resolveImageUrl(pizza.imageUrl);

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow ${
        soldOut ? "opacity-70" : "hover:shadow-md"
      } ${selected ? "border-primary ring-2 ring-primary" : "border-border"}`}
    >
      <div className="relative aspect-[4/3] bg-muted">
        {image ? (
          <img
            src={image}
            alt={pizza.name}
            loading="lazy"
            className={`absolute inset-0 size-full object-cover ${soldOut ? "grayscale" : ""}`}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-primary/60">
            <PizzaIcon className="size-10" aria-hidden />
          </div>
        )}
        {pizza.tags.length > 0 && (
          <ul className="absolute top-2 left-2 flex flex-wrap gap-1.5" aria-label="Caractéristiques">
            {TAG_ORDER.filter((tag) => pizza.tags.includes(tag)).map((tag) => {
              const { label, icon: Icon, iconClass } = TAG_BADGES[tag];
              return (
                <li
                  key={tag}
                  className="flex items-center gap-1 rounded-full bg-card/90 px-2 py-0.5 text-xs font-semibold text-foreground shadow-sm backdrop-blur"
                >
                  <Icon className={`size-3.5 ${iconClass}`} aria-hidden />
                  {label}
                </li>
              );
            })}
          </ul>
        )}
        {soldOut && (
          <span className="absolute inset-x-0 bottom-0 bg-foreground/80 py-1.5 text-center text-sm font-semibold text-background">
            Victime de son succès : épuisée
          </span>
        )}
        {selected && (
          <span className="absolute right-2 bottom-2 rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
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
          ) : soldOut ? (
            <span className="text-sm font-semibold text-muted-foreground">Épuisée</span>
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
