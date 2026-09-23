import type { ShopSettings } from "@prisma/client";
import { prisma } from "../prisma.js";

export const SLOT_DURATION_MINUTES = 30;

/** The shop's settings row, created with the schema defaults on first read. */
export function getSettings(): Promise<ShopSettings> {
  return prisma.shopSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

export type ServiceName = "LUNCH" | "DINNER";

/** Open service windows as [start, end) minutes since local midnight. */
export function serviceWindows(settings: ShopSettings): { service: ServiceName; start: number; end: number }[] {
  const windows: { service: ServiceName; start: number; end: number }[] = [];
  if (settings.lunchOpen) windows.push({ service: "LUNCH", start: settings.lunchStart, end: settings.lunchEnd });
  if (settings.dinnerOpen) windows.push({ service: "DINNER", start: settings.dinnerStart, end: settings.dinnerEnd });
  return windows;
}

/** Local calendar date as "YYYY-MM-DD" (same convention as ClosedDay.date). */
export function localDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parses "YYYY-MM-DD" as local midnight, or null if malformed. */
export function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return localDateKey(date) === value ? date : null;
}

/** The fields customers may see (footer hours, lunch/dinner split). */
export function publicSettings(settings: ShopSettings) {
  const { lunchOpen, lunchStart, lunchEnd, dinnerOpen, dinnerStart, dinnerEnd, closedWeekdays, daysAhead } = settings;
  return { lunchOpen, lunchStart, lunchEnd, dinnerOpen, dinnerStart, dinnerEnd, closedWeekdays, daysAhead };
}
