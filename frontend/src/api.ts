const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

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
  client: { name: string; email: string; phone: string | null };
  timeSlot: TimeSlot;
  items: { id: string; quantity: number; pizza: Pizza }[];
};

export type AuthClient = { name: string; email: string; loyaltyPoints: number };

export const LOYALTY_REWARD_THRESHOLD = 10;

function extractErrorMessage(data: unknown): string {
  if (typeof data === "object" && data !== null && "error" in data) {
    const error = (data as { error: unknown }).error;
    if (typeof error === "string") return error;
    if (typeof error === "object" && error !== null && "fieldErrors" in error) {
      const fieldErrors = (error as { fieldErrors: Record<string, string[]> }).fieldErrors;
      const firstMessage = Object.values(fieldErrors).flat()[0];
      if (firstMessage) return firstMessage;
    }
  }
  return "Erreur lors de la commande.";
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { credentials: "include", ...options });
  if (res.status === 204) return undefined as T;
  const data = await res.json();
  if (!res.ok) throw new Error(extractErrorMessage(data));
  return data;
}

export function fetchPizzas(): Promise<Pizza[]> {
  return api("/api/pizzas");
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

export function fetchMe(): Promise<AuthClient> {
  return api("/api/auth/me");
}
