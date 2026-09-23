import { motion } from "framer-motion";
import { Printer, Timer, X } from "lucide-react";
import { toast } from "sonner";
import type { Order } from "@/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatPrice, formatTime } from "@/lib/format";
import { printTicket } from "@/lib/printTicket";
import { minutesUntil } from "@/lib/useNow";
import { ETA_CHOICES, STATUS_CONFIG, TO_PREPARE } from "./orderStatus";
import type { OrderActions } from "./useOrderActions";

/** Kitchen ticket, only when staff ask for it. */
export function PrintTicketButton({ order, label }: { order: Order; label?: boolean }) {
  return (
    <Button
      size={label ? "default" : "icon"}
      variant={label ? "outline" : "ghost"}
      className={label ? "" : "size-8"}
      aria-label={label ? undefined : `Imprimer le ticket de ${order.client.name}`}
      title="Imprimer le ticket"
      onClick={() => {
        if (!printTicket(order)) toast.error("Fenêtre d'impression bloquée : autorise les pop-ups pour ce site.");
      }}
    >
      <Printer className="size-4" aria-hidden /> {label && "Imprimer le ticket"}
    </Button>
  );
}

export function CancelOrderButton({ order, onConfirm }: { order: Order; onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
          <X className="size-4" aria-hidden /> Annuler
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="theme-staff">
        <AlertDialogHeader>
          <AlertDialogTitle>Annuler la commande de {order.client.name} ?</AlertDialogTitle>
          <AlertDialogDescription>
            {order.items.map((i) => `${i.quantity}× ${i.pizza.name}`).join(", ")} · {formatPrice(order.totalCents)}.
            La place du créneau est libérée et les tampons gagnés avec cette commande sont retirés. Pense à
            prévenir le client.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Garder</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={onConfirm}>
            Annuler la commande
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function EtaStatus({ order, now }: { order: Order; now: number }) {
  if (!order.estimatedReadyAt) {
    return <span className="text-muted-foreground">Pas encore d'estimation envoyée au client</span>;
  }
  const minutes = minutesUntil(order.estimatedReadyAt, now);
  return (
    <span className="flex flex-wrap items-center gap-x-1.5">
      <Timer className="size-3.5 text-primary" aria-hidden />
      Annoncée prête à <strong className="tabular-nums">{formatTime(order.estimatedReadyAt)}</strong>
      {minutes > 0 ? (
        <span className="text-muted-foreground">· dans {minutes} min</span>
      ) : minutes === 0 ? (
        <span className="font-semibold">· maintenant</span>
      ) : (
        <span className="font-semibold text-accent">· en retard de {-minutes} min</span>
      )}
    </span>
  );
}

export function OrderRow({
  order,
  now,
  actions,
  onOpen,
  context,
}: {
  order: Order;
  now: number;
  actions: OrderActions;
  onOpen?: (order: Order) => void;
  /** Extra line, e.g. the slot date in cross-day search results. */
  context?: string;
}) {
  const config = STATUS_CONFIG[order.status];
  const done = order.status === "PICKED_UP" || order.status === "CANCELLED";
  const inKitchen = TO_PREPARE.includes(order.status);

  return (
    <motion.li layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <Card className={`gap-3 p-4 ${done ? "opacity-60" : ""}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {onOpen ? (
                <button
                  type="button"
                  className="font-semibold underline-offset-4 hover:underline"
                  onClick={() => onOpen(order)}
                >
                  {order.client.name}
                </button>
              ) : (
                <span className="font-semibold">{order.client.name}</span>
              )}
              <Badge variant={config.variant}>{config.label}</Badge>
            </div>
            {context && <p className="text-xs font-semibold text-muted-foreground first-letter:uppercase">{context}</p>}
            <p className="text-sm">{order.items.map((i) => `${i.quantity}× ${i.pizza.name}`).join(", ")}</p>
            <p className="text-xs text-muted-foreground">
              {formatPrice(order.totalCents)} · Réf {order.id.slice(0, 8)}
              {order.client.phone && ` · ${order.client.phone}`}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1">
            <PrintTicketButton order={order} />
            {inKitchen && <CancelOrderButton order={order} onConfirm={() => actions.advance(order, "CANCELLED")} />}
            {config.next && (
              <Button size="sm" onClick={() => actions.advance(order, config.next!.status)}>
                {config.next.label}
              </Button>
            )}
          </div>
        </div>

        {inKitchen && (
          <div className="flex flex-col gap-2 border-t pt-3 text-xs">
            <EtaStatus order={order} now={now} />
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label={`Délai annoncé à ${order.client.name}`}
            >
              <span className="mr-1 whitespace-nowrap text-muted-foreground">Prête dans</span>
              {ETA_CHOICES.map((minutes) => (
                <Button
                  key={minutes}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 min-w-11 px-2 tabular-nums"
                  aria-label={`Prête dans ${minutes} minutes`}
                  onClick={() => actions.setEta(order, minutes)}
                >
                  {minutes}′
                </Button>
              ))}
            </div>
          </div>
        )}
      </Card>
    </motion.li>
  );
}
