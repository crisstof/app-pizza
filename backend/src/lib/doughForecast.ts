import type { ShopSettings } from "@prisma/client";
import { prisma } from "../prisma.js";
import { getSettings, localDateKey } from "./settings.js";

// Dough forecast: how many dough balls (one per pizza) to prepare for a
// service, from bookings already taken and what the same weekday sold over
// the past weeks, plus a safety margin learned from past forecast errors.
// Plain statistics on purpose: every number can be explained on screen.

export type Service = "LUNCH" | "DINNER";
export const SERVICES: Service[] = ["LUNCH", "DINNER"];

const HISTORY_WEEKS = 8;
const RELIABLE_MIN_WEEKS = 4;
const MIN_BACKTEST_POINTS = 6;
const MARGIN_PERCENTILE = 0.8;
const MIN_AUTO_MARGIN = 0.05;
const MAX_AUTO_MARGIN = 0.3;

const key = (date: string, service: Service) => `${date}|${service}`;

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function serviceOf(startsAt: Date, settings: ShopSettings): Service {
  const minutes = startsAt.getHours() * 60 + startsAt.getMinutes();
  return settings.dinnerOpen && minutes >= settings.dinnerStart ? "DINNER" : "LUNCH";
}

/**
 * Pizzas sold (non-cancelled orders) and which services were open, per
 * "date|service", over [from, to). A service counts as open when it had at
 * least one slot, so fully closed days don't drag the averages down.
 */
export async function loadServiceData(from: Date, to: Date, settings: ShopSettings) {
  const [items, slots] = await Promise.all([
    prisma.orderItem.findMany({
      where: { order: { status: { not: "CANCELLED" }, timeSlot: { startsAt: { gte: from, lt: to } } } },
      select: { quantity: true, order: { select: { timeSlot: { select: { startsAt: true } } } } },
    }),
    prisma.timeSlot.findMany({
      where: { startsAt: { gte: from, lt: to } },
      select: { startsAt: true, closed: true },
    }),
  ]);

  const sales = new Map<string, number>();
  for (const item of items) {
    const startsAt = item.order.timeSlot.startsAt;
    const k = key(localDateKey(startsAt), serviceOf(startsAt, settings));
    sales.set(k, (sales.get(k) ?? 0) + item.quantity);
  }

  const open = new Set<string>();
  const bookable = new Set<string>();
  for (const slot of slots) {
    const k = key(localDateKey(slot.startsAt), serviceOf(slot.startsAt, settings));
    open.add(k);
    if (!slot.closed) bookable.add(k);
  }
  for (const k of sales.keys()) open.add(k);

  return { sales, open, bookable };
}

type ServiceData = Awaited<ReturnType<typeof loadServiceData>>;

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Weighted average of the same weekday over the previous weeks (recent weeks
 * weigh more). Abnormal days — under half or over double the median, e.g. a
 * storm or an oven breakdown — are left out so one odd day doesn't skew the
 * next weeks' forecasts.
 */
function sameWeekdayAverage(date: Date, service: Service, data: ServiceData) {
  const history: { sales: number; weight: number }[] = [];
  for (let week = 1; week <= HISTORY_WEEKS; week++) {
    const k = key(localDateKey(addDays(date, -7 * week)), service);
    if (!data.open.has(k)) continue; // closed that day: not a zero-sales day
    history.push({ sales: data.sales.get(k) ?? 0, weight: HISTORY_WEEKS + 1 - week });
  }

  let kept = history;
  if (history.length >= 3) {
    const m = median(history.map((h) => h.sales));
    kept = history.filter((h) => h.sales >= m / 2 && h.sales <= m * 2);
  }
  const weights = kept.reduce((sum, h) => sum + h.weight, 0);
  const weighted = kept.reduce((sum, h) => sum + h.weight * h.sales, 0);
  return {
    average: weights ? weighted / weights : 0,
    weeksUsed: kept.length,
    outliers: history.length - kept.length,
  };
}

function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

/**
 * Safety margin learned by backtesting: for each past service of the last
 * HISTORY_WEEKS weeks, forecast it from the weeks before and compare with
 * what was really sold. The margin is the relative error that would have
 * covered 80% of those services. Falls back to the manual setting when there
 * aren't enough points.
 */
function learnMargin(today: Date, data: ServiceData, settings: ShopSettings) {
  const errors: number[] = [];
  for (let day = 1; day <= HISTORY_WEEKS * 7; day++) {
    const date = addDays(today, -day);
    for (const service of SERVICES) {
      const k = key(localDateKey(date), service);
      const actual = data.sales.get(k) ?? 0;
      if (!data.open.has(k) || actual === 0) continue;
      const { average, weeksUsed } = sameWeekdayAverage(date, service, data);
      if (weeksUsed < 2 || average === 0) continue;
      errors.push(actual / average - 1);
    }
  }
  if (errors.length < MIN_BACKTEST_POINTS) {
    return { margin: settings.doughMarginPercent / 100, source: "setting" as const, points: errors.length };
  }
  const margin = Math.min(MAX_AUTO_MARGIN, Math.max(MIN_AUTO_MARGIN, percentile(errors, MARGIN_PERCENTILE)));
  return { margin, source: "auto" as const, points: errors.length };
}

export type ServiceForecast = {
  service: Service;
  booked: number;
  average: number;
  weeksUsed: number;
  /** Abnormal past days left out of the average. */
  outliers: number;
  expected: number;
  marginPercent: number;
  marginSource: "auto" | "setting";
  recommended: number;
  reliable: boolean;
};

export type DayForecast = { date: string; closed: boolean; services: ServiceForecast[]; total: number };

/** Forecast for today and the next `days - 1` days. */
export async function forecastDough(days = 3): Promise<DayForecast[]> {
  const settings = await getSettings();
  const today = startOfToday();
  // History for the averages plus as much again for the backtest.
  const from = addDays(today, -HISTORY_WEEKS * 7 * 2);
  const to = addDays(today, days);
  const data = await loadServiceData(from, to, settings);
  const { margin, source } = learnMargin(today, data, settings);

  const result: DayForecast[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    const services: ServiceForecast[] = [];
    for (const service of SERVICES) {
      const k = key(localDateKey(date), service);
      const booked = data.sales.get(k) ?? 0;
      // Skip services with no bookable slot and nothing booked (closed).
      if (!data.bookable.has(k) && booked === 0) continue;
      const { average, weeksUsed, outliers } = sameWeekdayAverage(date, service, data);
      const expected = Math.max(booked, average);
      services.push({
        service,
        booked,
        average: Math.round(average * 10) / 10,
        weeksUsed,
        outliers,
        expected: Math.round(expected * 10) / 10,
        marginPercent: Math.round(margin * 100),
        marginSource: source,
        recommended: Math.ceil(expected * (1 + margin)),
        reliable: weeksUsed >= RELIABLE_MIN_WEEKS,
      });
    }
    result.push({
      date: localDateKey(date),
      closed: services.length === 0,
      services,
      total: services.reduce((sum, s) => sum + s.recommended, 0),
    });
  }
  return result;
}

/** Pizzas sold per "date|service" for past log comparisons. */
export async function salesBetween(fromKey: Date, toExclusive: Date) {
  const settings = await getSettings();
  return (await loadServiceData(fromKey, toExclusive, settings)).sales;
}

export { addDays, startOfToday, key as serviceKey };
