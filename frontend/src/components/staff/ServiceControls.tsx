import { useState } from "react";
import { Ban, CalendarClock, PackageX, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Link } from "react-router-dom";
import type { TimeSlot } from "@/api";
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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { AdminPizza } from "@/staffApi";
import { SlotTile } from "./SlotTile";

type SlotPatch = { capacity?: number; closed?: boolean };

/**
 * Live service controls on the Service page: today's remaining slots
 * (capacity, open/closed, close the rest of the day) and sold-out switches.
 */
export function ServiceControls({
  slots,
  pizzas,
  now,
  onPatchSlot,
  onPatchSlots,
  onToggleAvailable,
}: {
  /** Today's slots, including closed ones. */
  slots: TimeSlot[];
  pizzas: AdminPizza[];
  now: number;
  onPatchSlot: (slot: TimeSlot, patch: SlotPatch) => void;
  onPatchSlots: (slots: TimeSlot[], patch: SlotPatch) => Promise<void>;
  onToggleAvailable: (pizza: AdminPizza, available: boolean) => void;
}) {
  const [bulkBusy, setBulkBusy] = useState(false);
  const remaining = slots.filter((s) => new Date(s.startsAt).getTime() > now);
  const open = remaining.filter((s) => !s.closed);
  const closed = remaining.filter((s) => s.closed);
  const soldOut = pizzas.filter((p) => !p.available).length;

  async function bulk(target: TimeSlot[], patch: SlotPatch) {
    setBulkBusy(true);
    try {
      await onPatchSlots(target, patch);
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <Card id="pilotage" className="scroll-mt-6 gap-6 p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <SlidersHorizontal className="size-5 text-primary" aria-hidden /> Pilotage du service
      </h2>

      <section aria-labelledby="pilotage-slots">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 id="pilotage-slots" className="flex items-center gap-1.5 text-sm font-semibold">
            <CalendarClock className="size-4 text-muted-foreground" aria-hidden /> Créneaux restants aujourd'hui
          </h3>
          <Link to="/pizzaiolo/creneaux" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
            Horaires et autres jours
          </Link>
        </div>

        {remaining.length === 0 ? (
          <p className="text-sm text-muted-foreground">Plus de créneau aujourd'hui.</p>
        ) : (
          <>
            <ul className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
              {remaining.map((slot) => (
                <SlotTile key={slot.id} slot={slot} now={now} onPatch={(patch) => onPatchSlot(slot, patch)} />
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              {open.length > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="outline" disabled={bulkBusy} className="text-destructive hover:text-destructive">
                      <Ban className="size-4" aria-hidden /> Stopper les commandes pour aujourd'hui
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="theme-staff">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Stopper les commandes pour aujourd'hui ?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Les {open.length} créneaux encore ouverts aujourd'hui sont fermés : plus aucun client ne peut
                        réserver pour ce soir. Les commandes déjà prises restent valables. Tu peux rouvrir à tout moment.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Garder ouvert</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-white hover:bg-destructive/90"
                        onClick={() => bulk(open, { closed: true })}
                      >
                        Fermer {open.length} créneaux
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {closed.length > 0 && (
                <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => bulk(closed, { closed: false })}>
                  <RotateCcw className="size-4" aria-hidden /> Rouvrir les {closed.length} créneaux fermés
                </Button>
              )}
            </div>
          </>
        )}
      </section>

      <section aria-labelledby="pilotage-stock">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 id="pilotage-stock" className="flex items-center gap-1.5 text-sm font-semibold">
            <PackageX className="size-4 text-muted-foreground" aria-hidden /> Ruptures
            {soldOut > 0 && <span className="font-normal text-destructive">· {soldOut} épuisée{soldOut > 1 ? "s" : ""}</span>}
          </h3>
          <Link to="/pizzaiolo/carte" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
            Modifier la carte
          </Link>
        </div>
        <ul className="grid max-h-80 grid-cols-1 gap-x-4 overflow-y-auto sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          {pizzas.map((pizza) => (
            <li key={pizza.id} className="flex min-h-10 items-center justify-between gap-2 border-b py-1 text-sm last:border-b-0">
              <span className={pizza.available ? "" : "font-semibold text-destructive line-through"}>{pizza.name}</span>
              <Switch
                checked={pizza.available}
                onCheckedChange={(v) => onToggleAvailable(pizza, v)}
                aria-label={`${pizza.name} disponible`}
              />
            </li>
          ))}
        </ul>
      </section>
    </Card>
  );
}
