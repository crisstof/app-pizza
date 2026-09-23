import { Router, type Request } from "express";
import { z } from "zod";
import { addDays, forecastDough, salesBetween, SERVICES, serviceKey, startOfToday } from "../../lib/doughForecast.js";
import { HttpError } from "../../lib/errors.js";
import { localDateKey, parseLocalDate } from "../../lib/settings.js";
import { prisma } from "../../prisma.js";

export const adminDoughRouter = Router();

adminDoughRouter.get("/forecast", async (_req, res) => {
  res.json(await forecastDough(3));
});

type Totals = { prepared: number; sold: number; wasted: number; services: number };

function totalsOf(entries: { prepared: number; sold: number; wasted: number }[]): Totals & { wasteRate: number | null } {
  const t = entries.reduce<Totals>(
    (acc, e) => ({
      prepared: acc.prepared + e.prepared,
      sold: acc.sold + e.sold,
      wasted: acc.wasted + e.wasted,
      services: acc.services + 1,
    }),
    { prepared: 0, sold: 0, wasted: 0, services: 0 }
  );
  return { ...t, wasteRate: t.prepared ? t.wasted / t.prepared : null };
}

// End-of-service logs for the last `days` days (today included), each with
// the pizzas actually sold according to the orders, plus totals for this
// period and the one before it (for the trend).
adminDoughRouter.get("/logs", async (req, res) => {
  const days = Math.min(90, Math.max(7, Number(req.query.days) || 28));
  const today = startOfToday();
  const periodStart = addDays(today, -(days - 1));
  const previousStart = addDays(periodStart, -days);

  const [logs, sales] = await Promise.all([
    prisma.doughLog.findMany({
      where: { date: { gte: localDateKey(previousStart), lte: localDateKey(today) } },
      orderBy: [{ date: "asc" }, { service: "asc" }],
    }),
    salesBetween(previousStart, addDays(today, 1)),
  ]);

  const withSold = logs.map((log) => ({
    date: log.date,
    service: log.service,
    prepared: log.prepared,
    wasted: log.wasted,
    demo: log.demo,
    sold: sales.get(serviceKey(log.date, log.service as "LUNCH" | "DINNER")) ?? 0,
  }));
  const currentKey = localDateKey(periodStart);
  const current = withSold.filter((l) => l.date >= currentKey);
  const previous = withSold.filter((l) => l.date < currentKey);

  // Pizzas sold per service for the last 7 days, so the form can show them
  // next to the counts being entered (even before any log exists).
  const recentSales = Array.from({ length: 7 }, (_, i) => localDateKey(addDays(today, -i))).flatMap((date) =>
    SERVICES.map((service) => ({ date, service, sold: sales.get(serviceKey(date, service)) ?? 0 }))
  );

  res.json({
    days,
    logs: current,
    summary: totalsOf(current),
    previousSummary: totalsOf(previous),
    recentSales,
  });
});

const logSchema = z
  .object({
    prepared: z.number().int().min(0).max(2000),
    wasted: z.number().int().min(0).max(2000),
  })
  .refine((l) => l.wasted <= l.prepared, "Il ne peut pas y avoir plus de pâtons jetés que de pâtons faits.");

adminDoughRouter.put("/logs/:date/:service", async (req: Request<{ date: string; service: string }>, res) => {
  const { date, service } = req.params;
  if (!parseLocalDate(date)) throw new HttpError(400, "Date invalide.");
  if (date > localDateKey(new Date())) throw new HttpError(400, "On ne peut pas noter un service à venir.");
  if (service !== "LUNCH" && service !== "DINNER") throw new HttpError(400, "Service invalide.");

  const parsed = logSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  // A real entry replaces a demo one for the same service.
  const log = await prisma.doughLog.upsert({
    where: { date_service: { date, service } },
    update: { ...parsed.data, demo: false },
    create: { date, service, ...parsed.data },
  });
  res.json(log);
});
