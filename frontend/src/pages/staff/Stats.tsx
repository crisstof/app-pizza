import { useEffect, useMemo, useState, type ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/staff/PageHeader";
import { useStaffError } from "@/components/staff/useStaffError";
import { Card } from "@/components/ui/card";
import { formatMinutes, formatPrice, fromDateKey, WEEKDAYS } from "@/lib/format";
import { fetchStats, type Stats as StatsData } from "@/staffApi";

const PERIODS = [
  { days: 7, label: "7 jours" },
  { days: 28, label: "4 semaines" },
  { days: 84, label: "12 semaines" },
];
// Monday first.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
// Sequential single-hue steps for the heatmap (light → dark).
const HEAT_STEPS = ["bg-primary/10", "bg-primary/25", "bg-primary/45", "bg-primary/70", "bg-primary"];

/** Relative change vs the previous period, colored by whether up is good. */
function Change({ current, previous, higherIsBetter = true, asPoints }: {
  current: number;
  previous: number;
  higherIsBetter?: boolean;
  /** For rates: difference in percentage points instead of a relative %. */
  asPoints?: boolean;
}) {
  if (!asPoints && previous === 0) return <span className="text-xs text-muted-foreground">pas de comparaison</span>;
  const diff = asPoints ? Math.round((current - previous) * 100) : Math.round(((current - previous) / previous) * 100);
  if (diff === 0) return <span className="text-xs text-muted-foreground">stable</span>;
  const good = diff > 0 === higherIsBetter;
  const Icon = diff > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`flex items-center gap-1 text-xs font-semibold ${good ? "text-primary" : "text-destructive"}`}>
      <Icon className="size-3.5" aria-hidden />
      {diff > 0 ? "+" : ""}
      {diff}
      {asPoints ? " pts" : " %"}
      <span className="font-normal text-muted-foreground">vs période d'avant</span>
    </span>
  );
}

function Kpi({ label, value, change }: { label: string; value: string; change: ReactNode }) {
  return (
    <Card className="gap-1 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {change}
    </Card>
  );
}

function bucketLabel(start: string, granularity: "day" | "week") {
  const d = fromDateKey(start);
  return granularity === "week"
    ? `semaine du ${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`
    : d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

function RevenueChart({ stats }: { stats: StatsData }) {
  const max = Math.max(1, ...stats.series.map((b) => b.revenueCents));
  const best = stats.series.reduce((a, b) => (b.revenueCents > a.revenueCents ? b : a), stats.series[0]);

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-lg font-semibold">
        Chiffre d'affaires par {stats.granularity === "week" ? "semaine" : "jour"}
      </h2>
      {best && best.revenueCents > 0 && (
        <p className="mb-4 text-sm text-muted-foreground">
          Meilleur{stats.granularity === "week" ? "e" : ""} : {bucketLabel(best.start, stats.granularity)},{" "}
          {formatPrice(best.revenueCents)}
        </p>
      )}
      <div className="flex h-44 items-end gap-0.5 border-b" role="img" aria-label="Chiffre d'affaires par période, détail au survol">
        {stats.series.map((b) => {
          const label = `${bucketLabel(b.start, stats.granularity)} : ${formatPrice(b.revenueCents)} · ${b.orders} commandes · ${b.pizzas} pizzas`;
          return (
            <div key={b.start} className="group relative flex h-full flex-1 flex-col justify-end" title={label}>
              <div
                className="rounded-t-sm bg-primary transition-opacity group-hover:opacity-80"
                style={{ height: `${(b.revenueCents / max) * 100}%`, minHeight: b.revenueCents ? 2 : 0 }}
              />
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden w-max max-w-56 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-xs text-background group-hover:block">
                {label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{stats.series[0] && bucketLabel(stats.series[0].start, stats.granularity)}</span>
        <span>{stats.series.at(-1) && bucketLabel(stats.series.at(-1)!.start, stats.granularity)}</span>
      </div>
    </Card>
  );
}

function TopPizzas({ stats }: { stats: StatsData }) {
  const max = Math.max(1, ...stats.topPizzas.map((p) => p.quantity));
  return (
    <Card className="p-5">
      <h2 className="mb-4 text-lg font-semibold">Meilleures ventes</h2>
      {stats.topPizzas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune vente sur la période.</p>
      ) : (
        <ol className="space-y-2">
          {stats.topPizzas.map((p, i) => (
            <li key={p.name} className="grid grid-cols-[1.5rem_8rem_minmax(0,1fr)_auto] items-center gap-3 text-sm">
              <span className="text-right text-muted-foreground tabular-nums">{i + 1}</span>
              <span className="truncate font-medium">{p.name}</span>
              <span className="h-2 rounded-full bg-muted" aria-hidden>
                <span className="block h-full rounded-full bg-primary" style={{ width: `${(p.quantity / max) * 100}%` }} />
              </span>
              <span className="text-right tabular-nums">
                <strong>{p.quantity}</strong> <span className="text-muted-foreground">· {formatPrice(p.revenueCents)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function PeakHours({ stats }: { stats: StatsData }) {
  const { times, cell, max } = useMemo(() => {
    const times = [...new Set(stats.heatmap.map((h) => h.minutes))].sort((a, b) => a - b);
    const values = new Map(stats.heatmap.map((h) => [`${h.weekday}|${h.minutes}`, h.pizzas]));
    return {
      times,
      cell: (weekday: number, minutes: number) => values.get(`${weekday}|${minutes}`) ?? 0,
      max: Math.max(1, ...stats.heatmap.map((h) => h.pizzas)),
    };
  }, [stats.heatmap]);

  if (times.length === 0) return null;
  const step = (v: number) => Math.min(HEAT_STEPS.length - 1, Math.floor((v / max) * HEAT_STEPS.length));

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-lg font-semibold">Heures de pointe</h2>
      <p className="mb-4 text-sm text-muted-foreground">Pizzas vendues par jour et créneau, sur toute la période.</p>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0.5 text-xs">
          <thead>
            <tr>
              <th className="sr-only">Jour</th>
              {times.map((m) => (
                <th key={m} scope="col" className="px-0.5 font-normal text-muted-foreground tabular-nums">
                  {formatMinutes(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEK_ORDER.map((weekday) => (
              <tr key={weekday}>
                <th scope="row" className="pr-2 text-left font-medium">
                  {WEEKDAYS[weekday].slice(0, 3)}.
                </th>
                {times.map((m) => {
                  const v = cell(weekday, m);
                  const s = step(v);
                  return (
                    <td
                      key={m}
                      title={`${WEEKDAYS[weekday]} ${formatMinutes(m)} : ${v} pizzas`}
                      className={`h-8 min-w-9 rounded-sm text-center tabular-nums ${
                        v ? `${HEAT_STEPS[s]} ${s >= 3 ? "text-primary-foreground" : "text-foreground"}` : "bg-muted/40 text-muted-foreground"
                      }`}
                    >
                      {v || ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground" aria-hidden>
        moins
        {HEAT_STEPS.map((c) => (
          <span key={c} className={`size-3 rounded-sm ${c}`} />
        ))}
        plus
      </div>
    </Card>
  );
}

export default function Stats() {
  const [days, setDays] = useState(28);
  const [stats, setStats] = useState<StatsData | null>(null);
  const fail = useStaffError();

  useEffect(() => {
    let cancelled = false;
    fetchStats(days)
      .then((s) => !cancelled && setStats(s))
      .catch((err) => !cancelled && fail(err));
    return () => {
      cancelled = true;
    };
  }, [days, fail]);

  const s = stats?.summary;
  const p = stats?.previousSummary;

  return (
    <>
      <PageHeader
        title="Statistiques"
        description="Commandes non annulées, jusqu'à maintenant"
        actions={
          <div className="flex gap-1.5" role="group" aria-label="Période">
            {PERIODS.map((period) => (
              <button
                key={period.days}
                type="button"
                aria-pressed={days === period.days}
                onClick={() => setDays(period.days)}
                className={`min-h-9 rounded-full border px-3.5 text-sm transition-colors ${
                  days === period.days ? "border-primary bg-primary font-semibold text-primary-foreground" : "bg-card hover:border-primary/60"
                }`}
              >
                {period.label}
              </button>
            ))}
          </div>
        }
      />

      {!stats || !s || !p ? (
        <p className="text-sm text-muted-foreground">Calcul des statistiques…</p>
      ) : (
        <div className="space-y-6">
          <section aria-label="Indicateurs" className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Kpi label="Chiffre d'affaires" value={formatPrice(s.revenueCents)} change={<Change current={s.revenueCents} previous={p.revenueCents} />} />
            <Kpi label="Commandes" value={String(s.orders)} change={<Change current={s.orders} previous={p.orders} />} />
            <Kpi label="Pizzas vendues" value={String(s.pizzas)} change={<Change current={s.pizzas} previous={p.pizzas} />} />
            <Kpi
              label="Panier moyen"
              value={formatPrice(s.averageBasketCents)}
              change={<Change current={s.averageBasketCents} previous={p.averageBasketCents} />}
            />
            <Kpi
              label="Annulations"
              value={`${Math.round(s.cancelRate * 100)} %`}
              change={<Change current={s.cancelRate} previous={p.cancelRate} higherIsBetter={false} asPoints />}
            />
          </section>
          <RevenueChart stats={stats} />
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <TopPizzas stats={stats} />
            <PeakHours stats={stats} />
          </div>
        </div>
      )}
    </>
  );
}
