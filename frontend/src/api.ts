const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export type Pizza = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  available: boolean;
};

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
  clientName: string;
  clientEmail: string;
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
  createdAt: string;
  client: { name: string; email: string; phone: string | null };
  timeSlot: TimeSlot;
  items: { id: string; quantity: number; pizza: Pizza }[];
};

export async function fetchPizzas(): Promise<Pizza[]> {
  const res = await fetch(`${API_URL}/api/pizzas`);
  if (!res.ok) throw new Error("Impossible de charger les pizzas.");
  return res.json();
}

export async function fetchTimeSlots(): Promise<TimeSlot[]> {
  const res = await fetch(`${API_URL}/api/time-slots`);
  if (!res.ok) throw new Error("Impossible de charger les créneaux.");
  return res.json();
}

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

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const res = await fetch(`${API_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(extractErrorMessage(data));
  return data;
}

export async function fetchOrder(orderId: string): Promise<Order> {
  const res = await fetch(`${API_URL}/api/orders/${orderId}`);
  const data = await res.json();
  if (!res.ok) throw new Error(extractErrorMessage(data));
  return data;
}

export async function fetchOrders(date?: string): Promise<Order[]> {
  const url = new URL(`${API_URL}/api/orders`);
  if (date) url.searchParams.set("date", date);
  const res = await fetch(url);
  if (!res.ok) throw new Error("Impossible de charger les commandes.");
  return res.json();
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order> {
  const res = await fetch(`${API_URL}/api/orders/${orderId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(extractErrorMessage(data));
  return data;
}
