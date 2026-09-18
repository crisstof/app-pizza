import { motion } from "framer-motion";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { TimeSlot } from "@/api";

function formatSlot(slot: TimeSlot) {
  const start = new Date(slot.startsAt);
  return {
    day: start.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" }),
    time: start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
  };
}

export function TimeSlotPicker({
  slots,
  selectedId,
  onSelect,
}: {
  slots: TimeSlot[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {slots.map((slot, i) => {
        const { day, time } = formatSlot(slot);
        const full = slot.available <= 0;
        const selected = selectedId === slot.id;

        return (
          <motion.button
            key={slot.id}
            type="button"
            disabled={full}
            onClick={() => onSelect(slot.id)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, delay: i * 0.02 }}
            whileTap={{ scale: 0.97 }}
            className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              selected
                ? "border-primary bg-primary/10 ring-2 ring-primary"
                : "border-border bg-card hover:border-primary/50"
            }`}
          >
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {day}
            </span>
            <span className="text-base font-semibold">{time}</span>
            <Badge
              variant={full ? "destructive" : "secondary"}
              className="mt-1 gap-1 text-xs"
            >
              <Users className="size-3" />
              {full ? "Complet" : `${slot.available} places`}
            </Badge>
          </motion.button>
        );
      })}
    </div>
  );
}
