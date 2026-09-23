import { prisma } from "../prisma.js";

const SLOT_DURATION_MINUTES = 30;
const SLOT_CAPACITY = 5;
const DAYS_AHEAD = 7;

// Lunch and dinner service windows, every day of the week. [startHour, endHour)
// in 24h local time; the last slot of a window starts at `endHour` minus one
// slot duration, e.g. a window ending at 14 with 30-minute slots last starts
// a booking at 13:30.
const SERVICE_WINDOWS: { startHour: number; endHour: number }[] = [
  { startHour: 11, endHour: 14 },
  { startHour: 18, endHour: 22 },
];

function slotsForDay(day: Date): { startsAt: Date; endsAt: Date; capacity: number }[] {
  const slots: { startsAt: Date; endsAt: Date; capacity: number }[] = [];
  for (const window of SERVICE_WINDOWS) {
    const windowStart = new Date(day);
    windowStart.setHours(window.startHour, 0, 0, 0);
    const windowEnd = new Date(day);
    windowEnd.setHours(window.endHour, 0, 0, 0);

    for (
      let startsAt = windowStart;
      startsAt < windowEnd;
      startsAt = new Date(startsAt.getTime() + SLOT_DURATION_MINUTES * 60 * 1000)
    ) {
      const endsAt = new Date(startsAt.getTime() + SLOT_DURATION_MINUTES * 60 * 1000);
      slots.push({ startsAt, endsAt, capacity: SLOT_CAPACITY });
    }
  }
  return slots;
}

/**
 * Makes sure bookable time slots exist for the next `daysAhead` days.
 * Safe to call repeatedly (e.g. on every server start, or lazily from a
 * request handler): relies on TimeSlot.startsAt's unique constraint and
 * `skipDuplicates` rather than checking first, so concurrent calls can't
 * race into duplicate-key errors.
 */
export async function ensureUpcomingTimeSlots(daysAhead = DAYS_AHEAD): Promise<void> {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const candidates = Array.from({ length: daysAhead })
    .flatMap((_, i) => {
      const day = new Date(today);
      day.setDate(day.getDate() + i);
      return slotsForDay(day);
    })
    .filter((slot) => slot.startsAt >= now);

  if (candidates.length === 0) return;

  await prisma.timeSlot.createMany({ data: candidates, skipDuplicates: true });
}

const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
let lastRefresh = 0;

/**
 * Throttled, failure-safe wrapper around `ensureUpcomingTimeSlots`: at most
 * once per hour, and never rejects (a transient DB error is logged and
 * swallowed rather than propagated — this runs on both server startup and
 * inside a hot request path, and Express 4 doesn't catch rejections thrown
 * from async handlers, so an uncaught one would crash the whole process).
 * The single shared timestamp means the startup call and the lazy
 * request-time check don't duplicate each other's work.
 */
export async function refreshUpcomingTimeSlots(daysAhead = DAYS_AHEAD): Promise<void> {
  if (Date.now() - lastRefresh < REFRESH_INTERVAL_MS) return;
  lastRefresh = Date.now();
  try {
    await ensureUpcomingTimeSlots(daysAhead);
  } catch (err) {
    console.error("Échec de la génération des créneaux :", err);
  }
}
