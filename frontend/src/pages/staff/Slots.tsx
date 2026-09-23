import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CalendarOff, ChevronLeft, ChevronRight, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { TimeSlot } from "@/api";
import { PageHeader } from "@/components/staff/PageHeader";
import { SlotTile } from "@/components/staff/SlotTile";
import { useStaffError } from "@/components/staff/useStaffError";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatDayLong, formatMinutes, fromDateKey, toDateKey, WEEKDAYS } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import {
  addClosedDay,
  fetchClosedDays,
  fetchDaySlots,
  fetchShopSettings,
  removeClosedDay,
  saveShopSettings,
  updateSlot,
  type ClosedDay,
  type ShopSettings,
} from "@/staffApi";

// Half-hour steps from 06:00 to midnight.
const TIME_CHOICES = Array.from({ length: 37 }, (_, i) => 360 + i * 30);
// Monday first, as on a French calendar.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function TimeSelect({ id, value, onChange, disabled }: { id: string; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))} disabled={disabled}>
      <SelectTrigger id={id} className="w-28">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="theme-staff max-h-72">
        {TIME_CHOICES.map((m) => (
          <SelectItem key={m} value={String(m)}>
            {formatMinutes(m)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ServiceRow({
  label,
  open,
  start,
  end,
  onChange,
}: {
  label: string;
  open: boolean;
  start: number;
  end: number;
  onChange: (patch: { open?: boolean; start?: number; end?: number }) => void;
}) {
  const id = label.toLowerCase();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
      <div className="flex w-28 items-center gap-2">
        <Switch id={`${id}-open`} checked={open} onCheckedChange={(v) => onChange({ open: v })} />
        <Label htmlFor={`${id}-open`}>{label}</Label>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Label htmlFor={`${id}-start`} className="sr-only">
          Début {label}
        </Label>
        <TimeSelect id={`${id}-start`} value={start} onChange={(v) => onChange({ start: v })} disabled={!open} />
        <span className="text-muted-foreground">à</span>
        <Label htmlFor={`${id}-end`} className="sr-only">
          Fin {label}
        </Label>
        <TimeSelect id={`${id}-end`} value={end} onChange={(v) => onChange({ end: v })} disabled={!open} />
      </div>
      {!open && <span className="text-sm text-muted-foreground">Fermé</span>}
    </div>
  );
}

function SettingsCard({ onSaved }: { onSaved: () => void }) {
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const fail = useStaffError();

  useEffect(() => {
    fetchShopSettings().then(setSettings).catch(fail);
  }, [fail]);

  if (!settings) return <Card className="p-5 text-sm text-muted-foreground">Chargement des horaires…</Card>;

  const set = (patch: Partial<ShopSettings>) => setSettings({ ...settings, ...patch });
  const toggleWeekday = (day: number) =>
    set({
      closedWeekdays: settings.closedWeekdays.includes(day)
        ? settings.closedWeekdays.filter((d) => d !== day)
        : [...settings.closedWeekdays, day],
    });

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      // Only this card's fields: the dough margin is edited on the Pâtons page.
      const { doughMarginPercent: _margin, ...hours } = settings;
      setSettings(await saveShopSettings(hours));
      toast.success("Horaires enregistrés, créneaux mis à jour");
      onSaved();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <form onSubmit={handleSave} className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Horaires d'ouverture</h2>
          <p className="text-sm text-muted-foreground">
            Créneaux de 30 min. Les changements s'appliquent aux créneaux à venir ; ceux qui ont déjà des commandes sont
            gardés (fermés s'ils sortent des horaires).
          </p>
        </div>

        <div className="space-y-2">
          <ServiceRow
            label="Midi"
            open={settings.lunchOpen}
            start={settings.lunchStart}
            end={settings.lunchEnd}
            onChange={({ open, start, end }) =>
              set({ lunchOpen: open ?? settings.lunchOpen, lunchStart: start ?? settings.lunchStart, lunchEnd: end ?? settings.lunchEnd })
            }
          />
          <ServiceRow
            label="Soir"
            open={settings.dinnerOpen}
            start={settings.dinnerStart}
            end={settings.dinnerEnd}
            onChange={({ open, start, end }) =>
              set({
                dinnerOpen: open ?? settings.dinnerOpen,
                dinnerStart: start ?? settings.dinnerStart,
                dinnerEnd: end ?? settings.dinnerEnd,
              })
            }
          />
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Jours de fermeture chaque semaine</legend>
          <div className="flex flex-wrap gap-2">
            {WEEK_ORDER.map((day) => {
              const closed = settings.closedWeekdays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={closed}
                  onClick={() => toggleWeekday(day)}
                  className={`min-h-9 rounded-full border px-3.5 text-sm transition-colors ${
                    closed ? "border-destructive bg-destructive/10 font-semibold text-destructive" : "bg-card hover:border-primary/60"
                  }`}
                >
                  {WEEKDAYS[day].slice(0, 3)}.{closed && <span className="sr-only"> (fermé)</span>}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="slot-capacity">Commandes max par créneau</Label>
            <Input
              id="slot-capacity"
              type="number"
              min={1}
              max={50}
              value={settings.slotCapacity}
              onChange={(e) => set({ slotCapacity: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="days-ahead">Réservation possible jusqu'à (jours)</Label>
            <Input
              id="days-ahead"
              type="number"
              min={1}
              max={30}
              value={settings.daysAhead}
              onChange={(e) => set({ daysAhead: Number(e.target.value) })}
            />
          </div>
        </div>

        <Button type="submit" disabled={saving}>
          <Save className="size-4" aria-hidden /> {saving ? "Enregistrement…" : "Enregistrer les horaires"}
        </Button>
      </form>
    </Card>
  );
}

function ClosedDaysCard({ onChanged }: { onChanged: () => void }) {
  const [days, setDays] = useState<ClosedDay[]>([]);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const fail = useStaffError();

  const load = useCallback(() => fetchClosedDays().then(setDays).catch(fail), [fail]);
  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    try {
      await addClosedDay(date, reason || undefined);
      toast.success(`Fermé le ${formatDayLong(fromDateKey(date))}`);
      setDate("");
      setReason("");
      load();
      onChanged();
    } catch (err) {
      fail(err);
    }
  }

  async function handleRemove(day: ClosedDay) {
    try {
      await removeClosedDay(day.date);
      toast.success(`Réouvert le ${formatDayLong(fromDateKey(day.date))}`);
      load();
      onChanged();
    } catch (err) {
      fail(err);
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CalendarOff className="size-5 text-accent" aria-hidden /> Fermetures exceptionnelles
        </h2>
        <p className="text-sm text-muted-foreground">Congés, jours fériés… Plus aucune réservation ce jour-là.</p>
      </div>

      <form onSubmit={handleAdd} className="mb-4 flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="closed-date">Date</Label>
          <Input id="closed-date" type="date" required min={toDateKey(new Date())} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="min-w-40 flex-1 space-y-1">
          <Label htmlFor="closed-reason">Motif (optionnel)</Label>
          <Input id="closed-reason" maxLength={80} placeholder="Congés" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <Button type="submit" disabled={!date}>
          Fermer ce jour
        </Button>
      </form>

      {days.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune fermeture prévue.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {days.map((day) => (
            <li key={day.date} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span>
                <span className="font-medium first-letter:uppercase">{formatDayLong(fromDateKey(day.date))}</span>
                {day.reason && <span className="text-muted-foreground"> · {day.reason}</span>}
              </span>
              <Button variant="ghost" size="icon" onClick={() => handleRemove(day)} aria-label={`Rouvrir le ${day.date}`}>
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}


function DaySlotsCard({ refreshKey }: { refreshKey: number }) {
  const [day, setDay] = useState(() => toDateKey(new Date()));
  const [slots, setSlots] = useState<TimeSlot[] | null>(null);
  const fail = useStaffError();
  const now = useNow(60_000);

  useEffect(() => {
    let cancelled = false;
    fetchDaySlots(day)
      .then((s) => !cancelled && setSlots(s))
      .catch((err) => !cancelled && fail(err));
    return () => {
      cancelled = true;
    };
  }, [day, refreshKey, fail]);

  async function patch(slot: TimeSlot, change: { capacity?: number; closed?: boolean }) {
    try {
      const updated = await updateSlot(slot.id, change);
      setSlots((prev) => prev?.map((s) => (s.id === updated.id ? updated : s)) ?? null);
    } catch (err) {
      fail(err);
    }
  }

  const shift = (days: number) => {
    const date = fromDateKey(day);
    date.setDate(date.getDate() + days);
    setDay(toDateKey(date));
  };

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Créneaux du jour</h2>
          <p className="text-sm text-muted-foreground">Ajuste la capacité ou ferme un créneau (rush, four en panne…).</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Jour précédent">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-40 text-center text-sm font-medium first-letter:uppercase">{formatDayLong(fromDateKey(day))}</span>
          <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="Jour suivant">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {slots === null ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : slots.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Aucun créneau ce jour-là (fermé, ou au-delà de la période de réservation).
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {slots.map((slot) => (
            <SlotTile key={slot.id} slot={slot} now={now} onPatch={(change) => patch(slot, change)} />
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function Slots() {
  // Bumped when hours or closures change, so the day view reloads.
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);

  return (
    <>
      <PageHeader title="Créneaux et horaires" description="Quand les clients peuvent réserver" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SettingsCard onSaved={bump} />
        <ClosedDaysCard onChanged={bump} />
        <div className="xl:col-span-2">
          <DaySlotsCard refreshKey={refreshKey} />
        </div>
      </div>
    </>
  );
}
