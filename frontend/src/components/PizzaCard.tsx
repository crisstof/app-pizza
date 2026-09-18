import { motion } from "framer-motion";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Pizza } from "@/api";

function formatPrice(cents: number) {
  return (cents / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}

export function PizzaCard({
  pizza,
  quantity,
  onChange,
}: {
  pizza: Pizza;
  quantity: number;
  onChange: (delta: number) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        className={`relative overflow-hidden p-4 transition-shadow ${
          quantity > 0 ? "ring-2 ring-primary shadow-md" : "shadow-sm"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-display text-base leading-tight">{pizza.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {pizza.description}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-lg font-bold">
            {formatPrice(pizza.priceCents)}
          </span>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-8 rounded-full"
              disabled={quantity === 0}
              onClick={() => onChange(-1)}
            >
              <Minus className="size-4" />
            </Button>
            <motion.span
              key={quantity}
              initial={{ scale: 1.3 }}
              animate={{ scale: 1 }}
              className="w-4 text-center font-medium tabular-nums"
            >
              {quantity}
            </motion.span>
            <Button
              type="button"
              size="icon"
              className="size-8 rounded-full"
              onClick={() => onChange(1)}
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
