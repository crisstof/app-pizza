import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Save, TrendingDown, TrendingUp, Wheat } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/staff/PageHeader";
import { useStaffError } from "@/components/staff/useStaffError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDayLong, fromDateKey, toDateKey } from "@/lib/format";
import {
  fetchDoughForecast,
  fetchDoughLogs,
  fetchShopSettings,
  saveDoughLog,
  saveShopSettings,
  type DayForecast,
  type DoughLogs,
  type DoughService,
  type DoughTotals,
  type ServiceForecast,
} from "@/staffApi";

const SERVICE_LABEL: Record<DoughService, string> = { LUNCH: "Midi", DINNER: "Soir" };

function dayName(date: string) {
  const today = toDateKey(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date === today) return "Aujourd'hui";
  if (date === toDateKey(tomorrow)) return "Demain";
  return fromDateKey(date).toLocaleDateString("fr-FR", { weekday: "long" }).replace(/^./, (c) => c.toUpperCase());
}

function weekdayPlural(date: string) {
  return `${fromDateKey(date).toLocaleDateString("fr-FR", { weekday: "long" })}s`;
}

/** One service's recommendation, with the numbers behind it. */
function ServiceLine({ date, forecast, large }: { date: string; forecast: ServiceForecast; large?: boolean }) {
  const explanation = [
    forecast.weeksUsed > 0
      ? `moyenne des ${forecast.weeksUsed} derniers ${weekdayPlural(date)} : ${forecast.average.toLocaleString("fr-FR")}`
      : "pas encore d'historique",
    forecast.booked > 0 ? `déjà réservées : ${forecast.booked}` : null,
    `marge +${forecast.marginPercent} %`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          {SERVICE_LABEL[forecast.service]}
          {!forecast.reliable && (
            <Badge variant="outline" className="font-normal">
              peu d'historique
            </Badge>
          )}
        </p>
        <p className="text-xs text-muted-foreground">{explanation}</p>
        {forecast.outliers > 0 && (
          <p className="text-xs text-muted-foreground">
            {forecast.outliers} jour{forecast.outliers > 1 ? "s" : ""} anormal{forecast.outliers > 1 ? "aux" : ""} ignoré
            {forecast.outliers > 1 ? "s" : ""}
          </p>
        )}
      </div>
      <p className={`shrink-0 font-bold tabular-nums ${large ? "text-3xl" : "text-xl"}`}>
        {forecast.recommended}
        <span className="sr-only"> pâtons</span>
      </p>
    </div>
  );
}

function DayCard({ day, highlight }: { day: DayForecast; highlight?: boolean }) {
  return (
    <Card className={`gap-2 p-5 ${highlight ? "border-2 border-primary" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          {highlight && (
            <p className="mb-1 text-xs font-semibold tracking-wide text-primary uppercase">À préparer ce soir</p>
          )}
          <h2 className={`font-semibold ${highlight ? "text-xl" : "text-base"}`}>
            {dayName(day.date)}{" "}
            <span className="font-normal text-muted-foreground">· {formatDayLong(fromDateKey(day.date))}</span>
          </h2>
        </div>
        {!day.closed && (
          <p className="text-right">
            <span className={`block font-bold tabular-nums ${highlight ? "text-5xl" : "text-3xl"}`}>{day.total}</span>
            <span className="text-xs text-muted-foreground">pâtons</span>
          </p>
        )}
      </div>
      {day.closed ? (
        <p className="text-sm text-muted-foreground">Fermé : pas de pâte à préparer.</p>
      ) : (
        <div className="divide-y">
          {day.services.map((s) => (
            <ServiceLine key={s.service} date={day.date} forecast={s} large={highlight} />
          ))}
        </div>
      )}
    </Card>
  );
}

function LogForm({ logs, onSaved }: { logs: DoughLogs; onSaved: () => void }) {
  const dates = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return toDateKey(d);
      }),
    []
  );
  const [date, setDate] = useState(dates[0]);

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Fin de service : noter les pâtons</h2>
          <p className="text-sm text-muted-foreground">30 secondes pour savoir ce que tu jettes vraiment.</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="log-date" className="text-xs">
            Jour
          </Label>
          <select
            id="log-date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 rounded-md border bg-card px-2 text-sm"
          >
            {dates.map((d, i) => (
              <option key={d} value={d}>
                {i === 0 ? "Aujourd'hui" : i === 1 ? "Hier" : formatDayLong(fromDateKey(d))}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {(["LUNCH", "DINNER"] as const).map((service) => (
          <ServiceLogForm
            key={`${date}-${service}`}
            date={date}
            service={service}
            existing={logs.logs.find((l) => l.date === date && l.service === service)}
            sold={logs.recentSales.find((s) => s.date === date && s.service === service)?.sold ?? 0}
            onSaved={onSaved}
          />
        ))}
      </div>
    </Card>
  );
}

function ServiceLogForm({
  date,
  service,
  existing,
  sold,
  onSaved,
}: {
  date: string;
  service: DoughService;
  existing?: { prepared: number; wasted: number; demo: boolean };
  sold: number;
  onSaved: () => void;
}) {
  const [prepared, setPrepared] = useState(existing ? String(existing.prepared) : "");
  const [wasted, setWasted] = useState(existing ? String(existing.wasted) : "");
  const [saving, setSaving] = useState(false);
  const fail = useStaffError();
  const id = `${date}-${service}`;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await saveDoughLog(date, service, { prepared: Number(prepared), wasted: Number(wasted) });
      toast.success(`${SERVICE_LABEL[service]} noté : ${prepared} faits, ${wasted} jetés`);
      onSaved();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold">{SERVICE_LABEL[service]}</p>
        {existing && !existing.demo && (
          <span className="flex items-center gap-1 text-xs text-primary">
            <CheckCircle2 className="size-3.5" aria-hidden /> Noté
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Vendues d'après les commandes : {sold}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`${id}-prepared`}>Faits</Label>
          <Input
            id={`${id}-prepared`}
            type="number"
            inputMode="numeric"
            min={0}
            required
            value={prepared}
            onChange={(e) => setPrepared(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-wasted`}>Jetés</Label>
          <Input
            id={`${id}-wasted`}
            type="number"
            inputMode="numeric"
            min={0}
            max={prepared ? Number(prepared) : undefined}
            required
            value={wasted}
            onChange={(e) => setWasted(e.target.value)}
          />
        </div>
      </div>
      <Button type="submit" size="sm" disabled={saving || prepared === "" || wasted === ""}>
        <Save className="size-4" aria-hidden /> {existing && !existing.demo ? "Mettre à jour" : "Enregistrer"}
      </Button>
    </form>
  );
}

function percent(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 100)} %`;
}

function Trend({ current, previous }: { current: number | null; previous: number | null }) {
  if (current === null || previous === null) return null;
  const diff = Math.round((current - previous) * 100);
  if (diff === 0) return <span className="text-xs text-muted-foreground">stable</span>;
  const better = diff < 0; // less waste is better
  const Icon = better ? TrendingDown : TrendingUp;
  return (
    <span className={`flex items-center gap-1 text-xs font-semibold ${better ? "text-primary" : "text-destructive"}`}>
      <Icon className="size-3.5" aria-hidden />
      {diff > 0 ? "+" : ""}
      {diff} pts vs 4 semaines d'avant
    </span>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {detail}
    </div>
  );
}

/** Sold + wasted per day, stacked. Days without a log stay empty. */
function WasteChart({ logs, days }: { logs: DoughLogs["logs"]; days: number }) {
  const series = useMemo(() => {
    const byDate = new Map<string, { sold: number; wasted: number }>();
    for (const log of logs) {
      const d = byDate.get(log.date) ?? { sold: 0, wasted: 0 };
      d.sold += log.prepared - log.wasted;
      d.wasted += log.wasted;
      byDate.set(log.date, d);
    }
    return Array.from({ length: days }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      const date = toDateKey(d);
      return { date, ...(byDate.get(date) ?? { sold: 0, wasted: 0 }), logged: byDate.has(date) };
    });
  }, [logs, days]);
  const max = Math.max(1, ...series.map((d) => d.sold + d.wasted));

  return (
    <figure>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primary" aria-hidden /> Utilisés
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-accent" aria-hidden /> Jetés
        </span>
      </div>
      <div className="flex h-36 items-end gap-0.5 border-b" role="img" aria-label={`Pâtons utilisés et jetés par jour, ${days} derniers jours`}>
        {series.map((d) => {
          const label = `${formatDayLong(fromDateKey(d.date))} : ${d.logged ? `${d.sold} utilisés, ${d.wasted} jetés` : "non noté"}`;
          return (
            <div key={d.date} className="group relative flex h-full flex-1 flex-col justify-end" title={label}>
              {d.logged ? (
                <>
                  <div
                    className="rounded-t-sm bg-accent"
                    style={{ height: `${(d.wasted / max) * 100}%`, marginBottom: d.wasted ? 2 : 0 }}
                  />
                  <div className="bg-primary" style={{ height: `${(d.sold / max) * 100}%` }} />
                </>
              ) : (
                <div className="h-0.5 bg-border" />
              )}
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden w-max max-w-48 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-xs text-background group-hover:block">
                {label}
              </span>
            </div>
          );
        })}
      </div>
      <figcaption className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>il y a {days - 1} jours</span>
        <span>aujourd'hui</span>
      </figcaption>
    </figure>
  );
}

function WasteCard({ logs }: { logs: DoughLogs }) {
  const s: DoughTotals = logs.summary;
  return (
    <Card className="p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Pertes des {Math.round(logs.days / 7)} dernières semaines</h2>
        <p className="text-sm text-muted-foreground">
          {s.services} service{s.services > 1 ? "s" : ""} noté{s.services > 1 ? "s" : ""}.
          {logs.logs.some((l) => l.demo) && " Contient des données de démo."}
        </p>
      </div>
      {s.services === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Rien de noté pour l'instant. Note tes pâtons en fin de service pour suivre tes pertes.
        </p>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Faits" value={String(s.prepared)} />
            <Stat label="Vendus (commandes)" value={String(s.sold)} />
            <Stat label="Jetés" value={String(s.wasted)} />
            <Stat
              label="Taux de perte"
              value={percent(s.wasteRate)}
              detail={<Trend current={s.wasteRate} previous={logs.previousSummary.wasteRate} />}
            />
          </div>
          <WasteChart logs={logs.logs} days={logs.days} />
        </>
      )}
    </Card>
  );
}

function MarginSetting({ current }: { current: ServiceForecast | undefined }) {
  const [value, setValue] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fail = useStaffError();

  useEffect(() => {
    fetchShopSettings()
      .then((s) => setValue(String(s.doughMarginPercent)))
      .catch(fail);
  }, [fail]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await saveShopSettings({ doughMarginPercent: Number(value) });
      toast.success("Marge enregistrée");
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="gap-3 p-5">
      <h2 className="text-lg font-semibold">Marge de sécurité</h2>
      {current && (
        <p className="text-sm">
          Utilisée en ce moment : <strong>+{current.marginPercent} %</strong>{" "}
          <span className="text-muted-foreground">
            {current.marginSource === "auto"
              ? "(calculée sur tes ventes passées : elle aurait suffi 8 services sur 10)"
              : "(ton réglage, en attendant assez d'historique)"}
          </span>
        </p>
      )}
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="dough-margin">Marge quand il n'y a pas assez d'historique (%)</Label>
          <Input
            id="dough-margin"
            type="number"
            min={0}
            max={50}
            className="w-28"
            value={value ?? ""}
            onChange={(e) => setValue(e.target.value)}
            disabled={value === null}
          />
        </div>
        <Button type="submit" variant="outline" disabled={saving || value === null || value === ""}>
          Enregistrer
        </Button>
      </form>
    </Card>
  );
}

export default function Dough() {
  const [forecast, setForecast] = useState<DayForecast[] | null>(null);
  const [logs, setLogs] = useState<DoughLogs | null>(null);
  const fail = useStaffError();

  const load = useCallback(() => {
    fetchDoughForecast().then(setForecast).catch(fail);
    fetchDoughLogs(28).then(setLogs).catch(fail);
  }, [fail]);

  useEffect(() => {
    load();
  }, [load]);

  const [today, tomorrow, afterTomorrow] = forecast ?? [];
  const anyService = forecast?.flatMap((d) => d.services)[0];
  const lowHistory = forecast?.some((d) => d.services.some((s) => !s.reliable));

  return (
    <>
      <PageHeader title="Pâtons" description="Prévoir juste, jeter moins" />

      {forecast === null ? (
        <p className="text-sm text-muted-foreground">Calcul de la prévision…</p>
      ) : (
        <section aria-label="Prévision" className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          {tomorrow && <DayCard day={tomorrow} highlight />}
          <div className="grid gap-4">
            {today && <DayCard day={today} />}
            {afterTomorrow && <DayCard day={afterTomorrow} />}
          </div>
          {lowHistory && (
            <p className="flex items-start gap-2 text-sm text-muted-foreground lg:col-span-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
              Peu d'historique : la prévision s'appuie surtout sur les réservations déjà faites. Elle s'affine
              chaque semaine.
            </p>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 gap-6">
        {logs && <LogForm logs={logs} onSaved={load} />}
        {logs && <WasteCard logs={logs} />}
        <MarginSetting current={anyService} />
      </div>

      <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
        <Wheat className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Calcul : moyenne des 8 derniers mêmes jours (les plus récents comptent plus, les jours anormaux sont ignorés),
        jamais moins que les pizzas déjà réservées, plus la marge de sécurité.
      </p>
    </>
  );
}
