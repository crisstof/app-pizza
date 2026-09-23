export function formatPrice(cents: number) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

export function formatTime(value: string | Date) {
  return new Date(value).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/** Minutes since midnight → "11:00". */
export function formatMinutes(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Minutes since midnight → "11h" / "11h30", for customer-facing hours. */
export function formatHour(minutes: number) {
  const m = minutes % 60;
  return `${Math.floor(minutes / 60)}h${m ? String(m).padStart(2, "0") : ""}`;
}

/** "11:00" → minutes since midnight. */
export function parseMinutes(value: string) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Local calendar date as "YYYY-MM-DD" (the backend's date-param format). */
export function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "YYYY-MM-DD" → local midnight. */
export function fromDateKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDayLong(value: string | Date) {
  return new Date(value).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

export function formatDateShort(value: string | Date) {
  return new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export const WEEKDAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
