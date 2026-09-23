import { LOYALTY_REWARD_THRESHOLD } from "@/api";

/**
 * Client-side preview of the reward the backend applies at order creation
 * (backend/src/routes/orders.ts): at 10+ points, the cheapest pizza in the
 * cart is free. Display only — the server's computed total is authoritative.
 */
export function previewReward(
  lines: { pizza: { priceCents: number } }[],
  loyaltyPoints: number | null
): number {
  if (loyaltyPoints === null || loyaltyPoints < LOYALTY_REWARD_THRESHOLD || lines.length === 0) return 0;
  return Math.min(...lines.map((l) => l.pizza.priceCents));
}
