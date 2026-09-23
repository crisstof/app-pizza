import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { TimeSlot } from "@/api";
import { formatTime } from "@/lib/format";

const EVENING_START_HOUR = 15;

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(date: Date) {
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (dayKey(date) === dayKey(today)) return "Aujourd'hui";
  if (dayKey(date) === dayKey(tomorrow)) return "Demain";
  return date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
}

type Day = { key: string; date: Date; slots: TimeSlot[] };

function SlotChip({
  slot,
  selected,
  onSelect,
}: {
  slot: TimeSlot;
  selected: boolean;
  onSelect: () => void;
}) {
  const start = new Date(slot.startsAt);
  const full = slot.available <= 0;
  const low = !full && slot.available <= 2;

  return (
    <button
      type="button"
      disabled={full}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${start.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} à ${formatTime(start)}, ${
        full ? "complet" : `${slot.available} places`
      }`}
      className={`flex min-h-11 flex-col items-center justify-center rounded-lg border px-2 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card hover:border-primary/60"
      }`}
    >
      <span className="font-semibold tabular-nums">{formatTime(start)}</span>
      {(full || low) && (
        <span className={`text-[11px] ${selected ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
          {full ? "Complet" : `${slot.available} pl.`}
        </span>
      )}
    </button>
  );
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
  const days = useMemo(() => {
    const byDay = new Map<string, Day>();
    for (const slot of slots) {
      const date = new Date(slot.startsAt);
      const key = dayKey(date);
      const day = byDay.get(key) ?? { key, date, slots: [] };
      day.slots.push(slot);
      byDay.set(key, day);
    }
    return [...byDay.values()];
  }, [slots]);

  const selectedSlot = slots.find((s) => s.id === selectedId);
  const defaultDay =
    days.find((d) => d.slots.some((s) => s.available > 0))?.key ?? days[0]?.key ?? "";
  const [activeDayKey, setActiveDayKey] = useState(
    selectedSlot ? dayKey(new Date(selectedSlot.startsAt)) : defaultDay
  );
  const activeDay = days.find((d) => d.key === activeDayKey) ?? days[0];

  if (!activeDay) {
    return <p className="text-sm text-muted-foreground">Aucun créneau disponible pour le moment.</p>;
  }

  const lunch = activeDay.slots.filter((s) => new Date(s.startsAt).getHours() < EVENING_START_HOUR);
  const dinner = activeDay.slots.filter((s) => new Date(s.startsAt).getHours() >= EVENING_START_HOUR);

  return (
    <div>
      <div className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Jour de retrait">
        {days.map((day) => {
          const active = day.key === activeDay.key;
          const hasRoom = day.slots.some((s) => s.available > 0);
          const holdsSelection = day.slots.some((s) => s.id === selectedId);
          return (
            <button
              key={day.key}
              type="button"
              onClick={() => setActiveDayKey(day.key)}
              aria-pressed={active}
              disabled={!hasRoom}
              className={`relative min-h-10 shrink-0 rounded-lg border px-4 text-sm capitalize transition-colors disabled:opacity-40 ${
                active
                  ? "border-primary bg-primary font-semibold text-primary-foreground"
                  : "border-border bg-card hover:border-primary/60"
              }`}
            >
              {dayLabel(day.date)}
              {holdsSelection && !active && (
                <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-primary ring-2 ring-background" />
              )}
              {holdsSelection && <span className="sr-only"> (créneau choisi)</span>}
            </button>
          );
        })}
      </div>

      <motion.div
        key={activeDay.key}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="space-y-5"
      >
        {[
          { label: "Midi", slots: lunch },
          { label: "Soir", slots: dinner },
        ]
          .filter((service) => service.slots.length > 0)
          .map((service) => (
            <div key={service.label}>
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {service.label}
              </p>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {service.slots.map((slot) => (
                  <SlotChip
                    key={slot.id}
                    slot={slot}
                    selected={slot.id === selectedId}
                    onSelect={() => onSelect(slot.id)}
                  />
                ))}
              </div>
            </div>
          ))}
      </motion.div>
    </div>
  );
}
