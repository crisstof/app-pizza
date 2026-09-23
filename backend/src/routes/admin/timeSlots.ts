import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../../lib/errors.js";
import { getSettings, localDateKey, parseLocalDate, SLOT_DURATION_MINUTES } from "../../lib/settings.js";
import { syncUpcomingTimeSlots } from "../../lib/timeSlots.js";
import { prisma } from "../../prisma.js";

export const adminTimeSlotsRouter = Router();

const minutesOfDay = z
  .number()
  .int()
  .min(0)
  .max(24 * 60)
  .refine((m) => m % SLOT_DURATION_MINUTES === 0, "Les horaires vont par demi-heure.");

const settingsFields = z.object({
  lunchOpen: z.boolean(),
  lunchStart: minutesOfDay,
  lunchEnd: minutesOfDay,
  dinnerOpen: z.boolean(),
  dinnerStart: minutesOfDay,
  dinnerEnd: minutesOfDay,
  slotCapacity: z.number().int().min(1).max(50),
  daysAhead: z.number().int().min(1).max(30),
  closedWeekdays: z.array(z.number().int().min(0).max(6)).max(7),
  doughMarginPercent: z.number().int().min(0).max(50),
});
type SettingsFields = z.infer<typeof settingsFields>;

// Checked on the merged result, since a partial update can break a rule
// through a field it didn't send (e.g. moving lunch end past dinner start).
function settingsProblem(s: SettingsFields): string | null {
  if (s.lunchOpen && s.lunchStart >= s.lunchEnd) return "Le midi doit finir après avoir commencé.";
  if (s.dinnerOpen && s.dinnerStart >= s.dinnerEnd) return "Le soir doit finir après avoir commencé.";
  if (s.lunchOpen && s.dinnerOpen && s.lunchEnd > s.dinnerStart) {
    return "Le service du soir doit commencer après la fin du midi.";
  }
  return null;
}

// Fields that change which slots exist; the dough margin doesn't.
const SLOT_FIELDS: (keyof SettingsFields)[] = [
  "lunchOpen",
  "lunchStart",
  "lunchEnd",
  "dinnerOpen",
  "dinnerStart",
  "dinnerEnd",
  "slotCapacity",
  "daysAhead",
  "closedWeekdays",
];

adminTimeSlotsRouter.get("/settings", async (_req, res) => {
  res.json(await getSettings());
});

// Partial update: each back-office page sends only the fields it edits, so
// two pages open at once can't revert each other's changes.
adminTimeSlotsRouter.patch("/settings", async (req, res) => {
  const parsed = settingsFields.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = { ...parsed.data };
  if (data.closedWeekdays) data.closedWeekdays = [...new Set(data.closedWeekdays)].sort();

  const previous = await getSettings();
  const problem = settingsProblem({ ...previous, ...data });
  if (problem) throw new HttpError(400, problem);

  const settings = await prisma.shopSettings.update({ where: { id: 1 }, data });
  const slotsChanged = SLOT_FIELDS.some((f) => JSON.stringify(previous[f]) !== JSON.stringify(settings[f]));
  if (slotsChanged) {
    await syncUpcomingTimeSlots(previous.slotCapacity !== settings.slotCapacity ? settings.slotCapacity : undefined);
  }
  res.json(settings);
});

// Every slot of one day for staff, including closed and full ones.
adminTimeSlotsRouter.get("/time-slots", async (req, res) => {
  const day = typeof req.query.date === "string" ? parseLocalDate(req.query.date) : null;
  if (!day) throw new HttpError(400, "Paramètre 'date' invalide (attendu AAAA-MM-JJ).");
  const next = new Date(day);
  next.setDate(next.getDate() + 1);

  const slots = await prisma.timeSlot.findMany({
    where: { startsAt: { gte: day, lt: next } },
    orderBy: { startsAt: "asc" },
  });
  res.json(slots.map((slot) => ({ ...slot, available: slot.capacity - slot.reserved })));
});

const slotPatchSchema = z.object({
  capacity: z.number().int().min(0).max(50).optional(),
  closed: z.boolean().optional(),
});

adminTimeSlotsRouter.patch("/time-slots/:id", async (req, res) => {
  const parsed = slotPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { capacity, closed } = parsed.data;

  // Capacity can't drop below what's already booked. Conditional on
  // `reserved` at write time (same pattern as booking), so a booking that
  // lands meanwhile can't end up over capacity.
  const result = await prisma.timeSlot.updateMany({
    where: { id: req.params.id, ...(capacity !== undefined && { reserved: { lte: capacity } }) },
    data: { capacity, closed },
  });
  const slot = await prisma.timeSlot.findUnique({ where: { id: req.params.id } });
  if (!slot) throw new HttpError(404, "Créneau introuvable.");
  if (result.count === 0) {
    throw new HttpError(409, `Ce créneau a déjà ${slot.reserved} commande${slot.reserved > 1 ? "s" : ""}.`);
  }
  res.json({ ...slot, available: slot.capacity - slot.reserved });
});

adminTimeSlotsRouter.get("/closed-days", async (_req, res) => {
  const days = await prisma.closedDay.findMany({
    where: { date: { gte: localDateKey(new Date()) } },
    orderBy: { date: "asc" },
  });
  res.json(days);
});

const closedDaySchema = z.object({
  date: z.string(),
  reason: z.string().trim().max(80).optional(),
});

adminTimeSlotsRouter.post("/closed-days", async (req, res) => {
  const parsed = closedDaySchema.safeParse(req.body);
  const day = parsed.success ? parseLocalDate(parsed.data.date) : null;
  if (!parsed.success || !day) throw new HttpError(400, "Date invalide.");
  if (parsed.data.date < localDateKey(new Date())) throw new HttpError(400, "Cette date est déjà passée.");

  const reason = parsed.data.reason || null;
  const closedDay = await prisma.closedDay.upsert({
    where: { date: parsed.data.date },
    update: { reason },
    create: { date: parsed.data.date, reason },
  });
  // Removes that day's empty slots and closes the ones that have orders.
  await syncUpcomingTimeSlots();
  res.status(201).json(closedDay);
});

adminTimeSlotsRouter.delete("/closed-days/:date", async (req, res) => {
  await prisma.closedDay.deleteMany({ where: { date: req.params.date } });
  // Recreates the day's slots (ones kept closed because of orders stay
  // closed; staff can reopen them from the day view).
  await syncUpcomingTimeSlots();
  res.status(204).end();
});
