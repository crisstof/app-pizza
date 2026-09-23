import { Minus, Plus } from "lucide-react";
import type { TimeSlot } from "@/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { formatTime } from "@/lib/format";

/** One slot with its fill level, an open/closed switch and capacity −/+. */
export function SlotTile({
  slot,
  now,
  onPatch,
}: {
  slot: TimeSlot;
  now: number;
  onPatch: (patch: { capacity?: number; closed?: boolean }) => void;
}) {
  const fill = slot.capacity > 0 ? Math.min(1, slot.reserved / slot.capacity) : 1;
  const full = slot.reserved >= slot.capacity;
  const past = new Date(slot.startsAt).getTime() < now;

  return (
    <li>
      <Card className={`gap-2 p-3 ${slot.closed ? "bg-muted/60" : ""} ${past ? "opacity-60" : ""}`}>
        <div className="flex items-center justify-between">
          <span className="font-semibold tabular-nums">{formatTime(slot.startsAt)}</span>
          <Switch
            checked={!slot.closed}
            disabled={past}
            onCheckedChange={(open) => onPatch({ closed: !open })}
            aria-label={`Créneau de ${formatTime(slot.startsAt)} ouvert`}
          />
        </div>
        <div className="h-1.5 rounded-full bg-muted" aria-hidden>
          <div className={`h-full rounded-full ${full ? "bg-accent" : "bg-primary"}`} style={{ width: `${fill * 100}%` }} />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className={slot.closed ? "font-semibold text-destructive" : "text-muted-foreground"}>
            {slot.closed ? "Fermé" : full ? "Complet" : `${slot.reserved}/${slot.capacity}`}
            {slot.closed && slot.reserved > 0 && ` · ${slot.reserved} cmd`}
          </span>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={past || slot.capacity <= slot.reserved}
              onClick={() => onPatch({ capacity: slot.capacity - 1 })}
              aria-label={`Une place de moins à ${formatTime(slot.startsAt)}`}
            >
              <Minus className="size-3.5" />
            </Button>
            <span className="w-5 text-center font-semibold tabular-nums">{slot.capacity}</span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={past || slot.capacity >= 50}
              onClick={() => onPatch({ capacity: slot.capacity + 1 })}
              aria-label={`Une place de plus à ${formatTime(slot.startsAt)}`}
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
        </div>
      </Card>
    </li>
  );
}
