import { AnimatePresence, motion } from "framer-motion";
import { Loader2, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";

export function CartFooter({
  totalCents,
  itemCount,
  submitting,
  onSubmit,
}: {
  totalCents: number;
  itemCount: number;
  submitting: boolean;
  onSubmit: () => void;
}) {
  return (
    <AnimatePresence>
      {itemCount > 0 && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed inset-x-0 bottom-0 z-10 border-t bg-card/95 p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur"
        >
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <ShoppingBag className="size-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">
                  {itemCount} pizza{itemCount > 1 ? "s" : ""}
                </p>
                <p className="text-lg font-bold">{formatPrice(totalCents)}</p>
              </div>
            </div>
            <Button type="submit" size="lg" disabled={submitting} onClick={onSubmit}>
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Envoi...
                </>
              ) : (
                "Commander"
              )}
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
