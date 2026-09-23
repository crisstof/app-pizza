import { Check, Gift, Mail, Phone } from "lucide-react";
import type { Order } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDayLong, formatPrice, formatTime } from "@/lib/format";
import { CancelOrderButton } from "./OrderRow";
import type { OrderActions } from "./useOrderActions";
import { STATUS_CONFIG, TO_PREPARE } from "./orderStatus";

const STEPS: { label: string; at: (o: Order) => string | null }[] = [
  { label: "Reçue", at: (o) => o.createdAt },
  { label: "Confirmée", at: (o) => o.confirmedAt },
  { label: "En préparation", at: (o) => o.preparingAt },
  { label: "Prête", at: (o) => o.readyAt },
  { label: "Récupérée", at: (o) => o.pickedUpAt },
  { label: "Annulée", at: (o) => o.cancelledAt },
];

/** Full order sheet: client contact, items, timeline, and the same actions as the row. */
export function OrderDetailDialog({
  order,
  actions,
  onClose,
}: {
  order: Order | null;
  actions: OrderActions;
  onClose: () => void;
}) {
  if (!order) return null;
  const config = STATUS_CONFIG[order.status];
  const subtotal = order.items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
  const steps = STEPS.filter((s) => s.at(order) || s.label !== "Annulée");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="theme-staff max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {order.client.name} <Badge variant={config.variant}>{config.label}</Badge>
          </DialogTitle>
          <DialogDescription className="first-letter:uppercase">
            {formatDayLong(order.timeSlot.startsAt)} à {formatTime(order.timeSlot.startsAt)} · Réf{" "}
            {order.id.slice(0, 8)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 text-sm">
          <a
            href={`mailto:${order.client.email}`}
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 hover:bg-muted"
          >
            <Mail className="size-4" aria-hidden /> {order.client.email}
          </a>
          {order.client.phone && (
            <a
              href={`tel:${order.client.phone}`}
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 hover:bg-muted"
            >
              <Phone className="size-4" aria-hidden /> {order.client.phone}
            </a>
          )}
        </div>

        <section>
          <h3 className="mb-2 text-sm font-semibold">Articles</h3>
          <ul className="space-y-1 text-sm">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span>
                  {item.quantity}× {item.pizza.name}
                </span>
                <span className="tabular-nums">{formatPrice(item.unitPriceCents * item.quantity)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-2 space-y-1 border-t pt-2 text-sm">
            {order.discountCents > 0 && (
              <>
                <div className="flex justify-between text-muted-foreground">
                  <dt>Sous-total</dt>
                  <dd className="tabular-nums">{formatPrice(subtotal)}</dd>
                </div>
                <div className="flex justify-between text-primary">
                  <dt className="flex items-center gap-1.5">
                    <Gift className="size-4" aria-hidden /> Pizza offerte (fidélité)
                  </dt>
                  <dd className="tabular-nums">−{formatPrice(order.discountCents)}</dd>
                </div>
              </>
            )}
            <div className="flex justify-between font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatPrice(order.totalCents)}</dd>
            </div>
          </dl>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">Chronologie</h3>
          <ol className="space-y-1.5 text-sm">
            {steps.map((step) => {
              const at = step.at(order);
              return (
                <li key={step.label} className={`flex justify-between ${at ? "" : "text-muted-foreground"}`}>
                  <span className="flex items-center gap-2">
                    <Check className={`size-4 ${at ? "text-primary" : "opacity-0"}`} aria-hidden />
                    {step.label}
                  </span>
                  <span className="tabular-nums">{at ? formatTime(at) : "—"}</span>
                </li>
              );
            })}
          </ol>
          {order.estimatedReadyAt && TO_PREPARE.includes(order.status) && (
            <p className="mt-2 text-sm text-muted-foreground">
              Annoncée au client pour {formatTime(order.estimatedReadyAt)}.
            </p>
          )}
        </section>

        {(config.next || TO_PREPARE.includes(order.status)) && (
          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            {TO_PREPARE.includes(order.status) && (
              <CancelOrderButton order={order} onConfirm={() => actions.advance(order, "CANCELLED")} />
            )}
            {config.next && (
              <Button onClick={() => actions.advance(order, config.next!.status)}>{config.next.label}</Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
