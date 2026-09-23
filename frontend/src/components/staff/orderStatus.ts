import type { OrderStatus } from "@/api";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

export const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; variant: BadgeVariant; next?: { status: OrderStatus; label: string } }
> = {
  PENDING: { label: "En attente", variant: "outline", next: { status: "CONFIRMED", label: "Confirmer" } },
  CONFIRMED: {
    label: "Confirmée",
    variant: "secondary",
    next: { status: "PREPARING", label: "Lancer la préparation" },
  },
  PREPARING: {
    label: "En préparation",
    variant: "default",
    next: { status: "READY", label: "Marquer prête" },
  },
  READY: {
    label: "Prête",
    variant: "default",
    next: { status: "PICKED_UP", label: "Marquer récupérée" },
  },
  PICKED_UP: { label: "Récupérée", variant: "secondary" },
  CANCELLED: { label: "Annulée", variant: "destructive" },
};

/** Still in the kitchen: can get an ETA, can be cancelled (mirrors the backend). */
export const TO_PREPARE: OrderStatus[] = ["PENDING", "CONFIRMED", "PREPARING"];
export const ETA_CHOICES = [5, 10, 15, 20, 30];
export const ALL_STATUSES = Object.keys(STATUS_CONFIG) as OrderStatus[];
