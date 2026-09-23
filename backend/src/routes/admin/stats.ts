import { Router } from "express";
import { localDateKey } from "../../lib/settings.js";
import { prisma } from "../../prisma.js";

export const adminStatsRouter = Router();

const PERIODS = [7, 28, 84];

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Monday of the date's week, as "YYYY-MM-DD". */
function weekKey(date: Date) {
  const d = startOfDay(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDateKey(d);
}

type OrderRow = Awaited<ReturnType<typeof loadOrders>>[number];

function loadOrders(from: Date, to: Date) {
  return prisma.order.findMany({
    where: { timeSlot: { startsAt: { gte: from, lt: to } } },
    select: {
      status: true,
      totalCents: true,
      timeSlot: { select: { startsAt: true } },
      items: { select: { quantity: true, unitPriceCents: true, pizza: { select: { name: true } } } },
    },
  });
}

function summarize(orders: OrderRow[]) {
  const kept = orders.filter((o) => o.status !== "CANCELLED");
  const revenueCents = kept.reduce((sum, o) => sum + o.totalCents, 0);
  return {
    revenueCents,
    orders: kept.length,
    pizzas: kept.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0),
    averageBasketCents: kept.length ? Math.round(revenueCents / kept.length) : 0,
    cancelRate: orders.length ? (orders.length - kept.length) / orders.length : 0,
  };
}

// Sales figures over the last N days (up to now), with the previous N days
// for trends: revenue over time, best sellers, and busiest weekday × time.
adminStatsRouter.get("/", async (req, res) => {
  const requested = Number(req.query.days);
  const days = PERIODS.includes(requested) ? requested : 28;
  const now = new Date();
  const today = startOfDay(now);
  // Per day for short periods; per week (12 whole Monday-started weeks, the
  // last one being the current week) for the long one, so no bar is cut.
  const byWeek = days > 28;
  const from = byWeek ? addDays(today, -((today.getDay() + 6) % 7) - 7 * (days / 7 - 1)) : addDays(today, -(days - 1));
  // The previous period covers exactly as much time, so a trend compares
  // like with like even while today (or this week) is still under way.
  const previousFrom = addDays(from, -days);
  const previousTo = new Date(previousFrom.getTime() + (now.getTime() - from.getTime()));

  const [orders, previousOrders] = await Promise.all([loadOrders(from, now), loadOrders(previousFrom, previousTo)]);
  const kept = orders.filter((o) => o.status !== "CANCELLED");

  const buckets = new Map<string, { revenueCents: number; orders: number; pizzas: number }>();
  for (let d = new Date(from); d <= now; d = addDays(d, byWeek ? 7 : 1)) {
    buckets.set(byWeek ? weekKey(d) : localDateKey(d), { revenueCents: 0, orders: 0, pizzas: 0 });
  }
  for (const o of kept) {
    const k = byWeek ? weekKey(o.timeSlot.startsAt) : localDateKey(o.timeSlot.startsAt);
    const b = buckets.get(k);
    if (!b) continue;
    b.revenueCents += o.totalCents;
    b.orders += 1;
    b.pizzas += o.items.reduce((s, i) => s + i.quantity, 0);
  }

  const pizzas = new Map<string, { quantity: number; revenueCents: number }>();
  for (const o of kept) {
    for (const item of o.items) {
      const p = pizzas.get(item.pizza.name) ?? { quantity: 0, revenueCents: 0 };
      p.quantity += item.quantity;
      p.revenueCents += item.quantity * item.unitPriceCents;
      pizzas.set(item.pizza.name, p);
    }
  }

  // Pizzas per weekday (0 = Sunday) and slot start time (minutes since midnight).
  const heat = new Map<string, number>();
  for (const o of kept) {
    const s = o.timeSlot.startsAt;
    const k = `${s.getDay()}|${s.getHours() * 60 + s.getMinutes()}`;
    heat.set(k, (heat.get(k) ?? 0) + o.items.reduce((sum, i) => sum + i.quantity, 0));
  }

  res.json({
    days,
    granularity: byWeek ? "week" : "day",
    summary: summarize(orders),
    previousSummary: summarize(previousOrders),
    series: [...buckets].map(([start, b]) => ({ start, ...b })),
    topPizzas: [...pizzas]
      .map(([name, p]) => ({ name, ...p }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10),
    heatmap: [...heat].map(([k, pizzas]) => {
      const [weekday, minutes] = k.split("|").map(Number);
      return { weekday, minutes, pizzas };
    }),
  });
});
