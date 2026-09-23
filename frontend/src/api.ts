const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

/** Photos uploaded from the back-office are served by the backend (/uploads/…);
 * the starter menu's /images/… are static files of this frontend. */
export function resolveImageUrl(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith("/uploads/") ? `${API_URL}${url}` : url;
}

export type Pizza = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  category: PizzaCategory;
  tags: PizzaTag[];
  available: boolean;
};

export type PizzaCategory = "TOMATO" | "CREAM" | "SPECIAL";
export type PizzaTag = "vegetarian" | "spicy" | "popular" | "new";

export type TimeSlot = {
  id: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  reserved: number;
  available: number;
  closed: boolean;
};

/** Opening hours, times in minutes since midnight (660 = 11:00). */
export type ShopHours = {
  lunchOpen: boolean;
  lunchStart: number;
  lunchEnd: number;
  dinnerOpen: boolean;
  dinnerStart: number;
  dinnerEnd: number;
  closedWeekdays: number[];
  daysAhead: number;
};

export type OrderItemInput = { pizzaId: string; quantity: number };

export type CreateOrderInput = {
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  timeSlotId: string;
  items: OrderItemInput[];
};

export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PREPARING"
  | "READY"
  | "PICKED_UP"
  | "CANCELLED";

export type Order = {
  id: string;
  status: OrderStatus;
  totalCents: number;
  discountCents: number;
  pointsEarned: number;
  createdAt: string;
  confirmedAt: string | null;
  preparingAt: string | null;
  readyAt: string | null;
  pickedUpAt: string | null;
  cancelledAt: string | null;
  etaSetAt: string | null;
  estimatedReadyAt: string | null;
  client: { name: string; email: string; phone: string | null };
  timeSlot: TimeSlot;
  items: { id: string; quantity: number; unitPriceCents: number; pizza: Pizza }[];
};

export type AuthClient = { name: string; email: string; loyaltyPoints: number };

export const LOYALTY_REWARD_THRESHOLD = 10;

function extractErrorMessage(data: unknown): string {
  if (typeof data === "object" && data !== null && "error" in data) {
    const error = (data as { error: unknown }).error;
    if (typeof error === "string") return error;
    // Zod's flatten(): field errors first, then object-level (refine) errors.
    if (typeof error === "object" && error !== null && "fieldErrors" in error) {
      const { fieldErrors, formErrors } = error as { fieldErrors: Record<string, string[]>; formErrors?: string[] };
      const firstMessage = Object.values(fieldErrors).flat()[0] ?? formErrors?.[0];
      if (firstMessage) return firstMessage;
    }
  }
  return "Une erreur est survenue.";
}

/** A failed API call, keeping the HTTP status (e.g. 401 → back to login). */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { credentials: "include", ...options });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(extractErrorMessage(data), res.status);
  return data;
}

/** Absolute backend URL, for what can't go through `api()` (EventSource…). */
export function apiUrl(path: string) {
  return `${API_URL}${path}`;
}

/** JSON body helper for POST/PUT/PATCH calls. */
export function jsonBody(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export function fetchPizzas(): Promise<Pizza[]> {
  return api("/api/pizzas");
}

export function fetchShopHours(): Promise<ShopHours> {
  return api("/api/settings");
}

export function fetchTimeSlots(): Promise<TimeSlot[]> {
  return api("/api/time-slots");
}

export function createOrder(input: CreateOrderInput): Promise<Order> {
  return api("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function fetchOrder(orderId: string): Promise<Order> {
  return api(`/api/orders/${orderId}`);
}

export function fetchOrders(date?: string): Promise<Order[]> {
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  return api(`/api/orders${query}`);
}

export function fetchMyOrders(): Promise<Order[]> {
  return api("/api/orders/mine");
}

export function updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order> {
  return api(`/api/orders/${orderId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

export function updateOrderEta(orderId: string, minutes: number): Promise<Order> {
  return api(`/api/orders/${orderId}/eta`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ minutes }),
  });
}

export function register(input: { name: string; email: string; password: string }): Promise<AuthClient> {
  return api("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function login(input: { email: string; password: string }): Promise<AuthClient> {
  return api("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function logout(): Promise<void> {
  return api("/api/auth/logout", { method: "POST" });
}

/** The logged-in client, or null when logged out. */
export function fetchMe(): Promise<AuthClient | null> {
  return api("/api/auth/me");
}
