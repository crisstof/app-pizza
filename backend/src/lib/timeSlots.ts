import { prisma } from "../prisma.js";
import { getSettings, localDateKey, serviceWindows, SLOT_DURATION_MINUTES } from "./settings.js";

type SlotData = { startsAt: Date; endsAt: Date; capacity: number; service: string };

/**
 * The slots that should exist from now on, according to ShopSettings: every
 * open service window, cut into SLOT_DURATION_MINUTES slots, for the next
 * `daysAhead` days, minus closed weekdays and exceptional ClosedDays.
 */
async function expectedUpcomingSlots(now: Date): Promise<SlotData[]> {
  const [settings, closedDays] = await Promise.all([getSettings(), prisma.closedDay.findMany()]);
  const closedDates = new Set(closedDays.map((d) => d.date));
  const windows = serviceWindows(settings);

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const slots: SlotData[] = [];
  for (let i = 0; i < settings.daysAhead; i++) {
    const day = new Date(today);
    day.setDate(day.getDate() + i);
    if (settings.closedWeekdays.includes(day.getDay()) || closedDates.has(localDateKey(day))) continue;

    for (const window of windows) {
      // The last slot of a window starts one slot before its end (14:00 end → 13:30).
      for (let m = window.start; m + SLOT_DURATION_MINUTES <= window.end; m += SLOT_DURATION_MINUTES) {
        const startsAt = new Date(day);
        startsAt.setHours(Math.floor(m / 60), m % 60, 0, 0);
        if (startsAt < now) continue;
        const endsAt = new Date(startsAt.getTime() + SLOT_DURATION_MINUTES * 60 * 1000);
        slots.push({ startsAt, endsAt, capacity: settings.slotCapacity, service: window.service });
      }
    }
  }
  return slots;
}

/**
 * Makes sure every expected upcoming slot exists. Safe to call repeatedly or
 * concurrently: relies on TimeSlot.startsAt's unique constraint and
 * `skipDuplicates` rather than checking first.
 */
export async function ensureUpcomingTimeSlots(): Promise<void> {
  const slots = await expectedUpcomingSlots(new Date());
  if (slots.length === 0) return;
  await prisma.timeSlot.createMany({ data: slots, skipDuplicates: true });
}

/**
 * Brings existing future slots in line with the settings after staff changed
 * hours, closed days, or capacity:
 * - future slots that are no longer expected are deleted when nothing
 *   references them, or closed (hidden from customers) when orders exist;
 * - missing expected slots are created;
 * - `newCapacity`, when given, is applied to every future slot but never
 *   below what's already reserved.
 * Called from staff request handlers (Express 5 forwards a rejection to the
 * error handler), so it may throw.
 */
export async function syncUpcomingTimeSlots(newCapacity?: number): Promise<void> {
  const now = new Date();
  const expected = await expectedUpcomingSlots(now);
  const expectedTimes = new Set(expected.map((s) => s.startsAt.getTime()));

  const future = await prisma.timeSlot.findMany({
    where: { startsAt: { gte: now } },
    select: { id: true, startsAt: true },
  });
  const staleIds = future.filter((s) => !expectedTimes.has(s.startsAt.getTime())).map((s) => s.id);

  if (staleIds.length > 0) {
    // `orders: none` is evaluated in the same statement as the delete, so a
    // booking landing meanwhile keeps its slot (it gets closed just below).
    await prisma.timeSlot.deleteMany({ where: { id: { in: staleIds }, orders: { none: {} } } });
    await prisma.timeSlot.updateMany({ where: { id: { in: staleIds } }, data: { closed: true } });
  }

  if (expected.length > 0) {
    await prisma.timeSlot.createMany({ data: expected, skipDuplicates: true });
  }

  if (newCapacity !== undefined) {
    await prisma.$executeRaw`UPDATE "TimeSlot" SET capacity = GREATEST(${newCapacity}, reserved) WHERE "startsAt" >= ${now}`;
  }

  lastRefresh = Date.now();
}

const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
let lastRefresh = 0;

/**
 * Throttled, failure-safe wrapper around `ensureUpcomingTimeSlots`: at most
 * once per hour, and never rejects (a transient DB error is logged and
 * swallowed rather than propagated — it runs un-awaited at server startup,
 * where a rejection would be unhandled, and inside the customers' slot list,
 * which should still answer with the slots that already exist).
 * The single shared timestamp means the startup call and the lazy
 * request-time check don't duplicate each other's work.
 */
export async function refreshUpcomingTimeSlots(): Promise<void> {
  if (Date.now() - lastRefresh < REFRESH_INTERVAL_MS) return;
  lastRefresh = Date.now();
  try {
    await ensureUpcomingTimeSlots();
  } catch (err) {
    console.error("Échec de la génération des créneaux :", err);
  }
}
