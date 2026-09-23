// Back-office calls (staff session cookie). Same `api()` helper as api.ts,
// so errors come back as ApiError with the HTTP status — a 401 means the
// staff session expired and the layout sends the user back to the login.
import { api, jsonBody, type Order, type Pizza, type PizzaCategory, type PizzaTag, type TimeSlot } from "@/api";

export type ShopSettings = {
  lunchOpen: boolean;
  lunchStart: number;
  lunchEnd: number;
  dinnerOpen: boolean;
  dinnerStart: number;
  dinnerEnd: number;
  slotCapacity: number;
  daysAhead: number;
  closedWeekdays: number[];
};

export type ClosedDay = { date: string; reason: string | null };

export type AdminPizza = Pizza & { _count: { orderItems: number } };

export type PizzaInput = {
  name: string;
  description: string | null;
  priceCents: number;
  category: PizzaCategory;
  tags: PizzaTag[];
  available: boolean;
};

export type AdminClient = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  loyaltyPoints: number;
  createdAt: string;
  hasAccount: boolean;
  orderCount: number;
  spentCents: number;
};

export type AdminClientDetail = Omit<AdminClient, "orderCount" | "spentCents"> & {
  orders: Omit<Order, "client">[];
};

// Session
export const staffLogin = (password: string) => api<{ ok: true }>("/api/staff/login", jsonBody("POST", { password }));
export const staffLogout = () => api<void>("/api/staff/logout", { method: "POST" });
export const fetchStaffSession = () => api<{ ok: true }>("/api/staff/me");

// Menu
export const fetchAdminPizzas = () => api<AdminPizza[]>("/api/admin/pizzas");
export const createPizza = (input: PizzaInput) => api<Pizza>("/api/admin/pizzas", jsonBody("POST", input));
export const updatePizza = (id: string, input: Partial<PizzaInput>) =>
  api<Pizza>(`/api/admin/pizzas/${id}`, jsonBody("PATCH", input));
export const deletePizza = (id: string) =>
  api<{ deleted: boolean; archived?: boolean }>(`/api/admin/pizzas/${id}`, { method: "DELETE" });
export function uploadPizzaPhoto(id: string, file: File) {
  const form = new FormData();
  form.append("photo", file);
  return api<Pizza>(`/api/admin/pizzas/${id}/photo`, { method: "POST", body: form });
}

// Hours and slots
export const fetchShopSettings = () => api<ShopSettings>("/api/admin/settings");
export const saveShopSettings = (settings: ShopSettings) =>
  api<ShopSettings>("/api/admin/settings", jsonBody("PUT", settings));
export const fetchDaySlots = (date: string) =>
  api<TimeSlot[]>(`/api/admin/time-slots?date=${encodeURIComponent(date)}`);
export const updateSlot = (id: string, patch: { capacity?: number; closed?: boolean }) =>
  api<TimeSlot>(`/api/admin/time-slots/${id}`, jsonBody("PATCH", patch));
export const fetchClosedDays = () => api<ClosedDay[]>("/api/admin/closed-days");
export const addClosedDay = (date: string, reason?: string) =>
  api<ClosedDay>("/api/admin/closed-days", jsonBody("POST", { date, reason }));
export const removeClosedDay = (date: string) =>
  api<void>(`/api/admin/closed-days/${encodeURIComponent(date)}`, { method: "DELETE" });

// Orders and clients
export const searchOrders = (q: string) => api<Order[]>(`/api/admin/orders?q=${encodeURIComponent(q)}`);
export const fetchClients = (q: string) => api<AdminClient[]>(`/api/admin/clients?q=${encodeURIComponent(q)}`);
export const fetchClient = (id: string) => api<AdminClientDetail>(`/api/admin/clients/${id}`);
export const adjustLoyalty = (id: string, delta: number) =>
  api<Omit<AdminClientDetail, "orders">>(`/api/admin/clients/${id}/loyalty`, jsonBody("PATCH", { delta }));
