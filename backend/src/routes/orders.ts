import { Router } from "express";
import { z } from "zod";
import { attachClientIfPresent, requireAuth } from "../lib/auth.js";
import { requireStaff } from "../lib/staffAuth.js";
import { prisma } from "../prisma.js";

export const ordersRouter = Router();

const LOYALTY_REWARD_THRESHOLD = 10;

const ORDER_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "PICKED_UP",
  "CANCELLED",
] as const;

// What each status is allowed to move to. Anything not listed here
// (e.g. PICKED_UP -> anything) is a dead end.
const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["PICKED_UP"],
  PICKED_UP: [],
  CANCELLED: [],
};

// Which timestamp column records reaching each status (PENDING = createdAt).
const STATUS_TIMESTAMP = {
  CONFIRMED: "confirmedAt",
  PREPARING: "preparingAt",
  READY: "readyAt",
  PICKED_UP: "pickedUpAt",
  CANCELLED: "cancelledAt",
} as const;

// The pizzaiolo can only give or change a "ready in N minutes" estimate
// while the order is still in the kitchen.
const ETA_EDITABLE_STATUSES = ["PENDING", "CONFIRMED", "PREPARING"] as const;
const MAX_ETA_MINUTES = 120;

// Dashboard-shaped order: never `client: true`, which would leak passwordHash.
export const DASHBOARD_ORDER_INCLUDE = {
  items: { include: { pizza: true } },
  timeSlot: true,
  client: { select: { name: true, email: true, phone: true } },
} as const;

class UnavailablePizzaError extends Error {
  constructor(public pizzaName: string) {
    super("PIZZA_UNAVAILABLE");
  }
}

const createOrderSchema = z.object({
  clientName: z.string().min(1).optional(),
  clientEmail: z.string().email().optional(),
  clientPhone: z.string().optional(),
  timeSlotId: z.string(),
  items: z
    .array(
      z.object({
        pizzaId: z.string(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
});

ordersRouter.post("/", attachClientIfPresent, async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { clientName, clientEmail, clientPhone, timeSlotId, items } = parsed.data;

  // Logged-in clients earn/redeem points under their own identity, so a
  // guest can't type someone else's email to farm their loyalty balance.
  if (!req.clientId && (!clientName || !clientEmail)) {
    return res.status(400).json({ error: "Nom et email sont requis." });
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      // Lock the slot's row implicitly via the conditional update below,
      // so two concurrent bookings can't both squeeze into the last spot.
      const slot = await tx.timeSlot.findUniqueOrThrow({ where: { id: timeSlotId } });
      if (slot.closed) throw new Error("SLOT_CLOSED");
      if (slot.reserved >= slot.capacity) {
        throw new Error("SLOT_FULL");
      }

      const pizzas = await tx.pizza.findMany({
        where: { id: { in: items.map((i) => i.pizzaId) } },
      });
      const pizzaById = new Map(pizzas.map((p) => [p.id, p]));

      let subtotalCents = 0;
      let pointsEarned = 0;
      for (const item of items) {
        const pizza = pizzaById.get(item.pizzaId);
        if (!pizza || pizza.archivedAt) throw new Error("PIZZA_NOT_FOUND");
        if (!pizza.available) throw new UnavailablePizzaError(pizza.name);
        subtotalCents += pizza.priceCents * item.quantity;
        pointsEarned += item.quantity;
      }

      let client;
      if (req.clientId) {
        client = await tx.client.findUniqueOrThrow({ where: { id: req.clientId } });
      } else {
        const existing = await tx.client.findUnique({ where: { email: clientEmail! } });
        // A password-protected account can only earn/spend its own loyalty
        // points, or have its name/phone changed, by someone logged in as
        // that account — not by anyone who happens to type its email.
        if (existing?.passwordHash) {
          throw new Error("ACCOUNT_LOGIN_REQUIRED");
        }
        client = existing
          ? await tx.client.update({
              where: { id: existing.id },
              data: { name: clientName!, phone: clientPhone },
            })
          : await tx.client.create({
              data: { name: clientName!, email: clientEmail!, phone: clientPhone },
            });
      }

      // Reward: once the client has 10+ stamps, the cheapest single unit
      // in this order is free, and 10 stamps are spent on it. The debit is
      // conditional on the balance at write time (not the value read above),
      // so two concurrent orders can't both redeem the same 10 points.
      let discountCents = 0;
      if (client.loyaltyPoints >= LOYALTY_REWARD_THRESHOLD) {
        const redeemed = await tx.client.updateMany({
          where: { id: client.id, loyaltyPoints: { gte: LOYALTY_REWARD_THRESHOLD } },
          data: { loyaltyPoints: { decrement: LOYALTY_REWARD_THRESHOLD } },
        });
        if (redeemed.count > 0) {
          const cheapestPizza = pizzas.reduce((min, p) => (p.priceCents < min.priceCents ? p : min));
          discountCents = cheapestPizza.priceCents;
        }
      }
      const totalCents = subtotalCents - discountCents;

      const updatedSlot = await tx.timeSlot.updateMany({
        where: { id: timeSlotId, closed: false, reserved: { lt: slot.capacity } },
        data: { reserved: { increment: 1 } },
      });
      if (updatedSlot.count === 0) throw new Error("SLOT_FULL");

      await tx.client.update({
        where: { id: client.id },
        data: { loyaltyPoints: { increment: pointsEarned } },
      });

      return tx.order.create({
        data: {
          clientId: client.id,
          timeSlotId,
          totalCents,
          discountCents,
          pointsEarned,
          items: {
            create: items.map((item) => ({
              pizzaId: item.pizzaId,
              quantity: item.quantity,
              unitPriceCents: pizzaById.get(item.pizzaId)!.priceCents,
            })),
          },
        },
        include: { items: true },
      });
    });

    res.status(201).json(order);
  } catch (err) {
    if (err instanceof Error && err.message === "SLOT_FULL") {
      return res.status(409).json({ error: "Ce créneau est complet." });
    }
    if (err instanceof Error && err.message === "SLOT_CLOSED") {
      return res.status(409).json({ error: "Ce créneau n'est plus disponible." });
    }
    if (err instanceof UnavailablePizzaError) {
      return res.status(400).json({ error: `${err.pizzaName} n'est plus disponible aujourd'hui.` });
    }
    if (err instanceof Error && err.message === "PIZZA_NOT_FOUND") {
      return res.status(400).json({ error: "Une pizza demandée n'existe pas." });
    }
    if (err instanceof Error && err.message === "ACCOUNT_LOGIN_REQUIRED") {
      return res.status(403).json({ error: "Cet email est associé à un compte. Connecte-toi pour commander." });
    }
    console.error(err);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// Account page: the logged-in client's own order history, newest first.
ordersRouter.get("/mine", requireAuth, async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { clientId: req.clientId! },
    include: { items: { include: { pizza: true } }, timeSlot: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(orders);
});

ordersRouter.get("/:id", async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: {
      items: { include: { pizza: true } },
      timeSlot: true,
      payment: true,
      // Just the first name greeting on the tracking page; anyone with the
      // link can read this route, so no email or phone here.
      client: { select: { name: true } },
    },
  });
  if (!order) return res.status(404).json({ error: "Commande introuvable." });
  res.json(order);
});

// Pizzaiolo dashboard: every order for today (or a given date), oldest slot first.
ordersRouter.get("/", requireStaff, async (req, res) => {
  const dateParam = typeof req.query.date === "string" ? req.query.date : undefined;
  let startOfDay: Date;
  if (dateParam) {
    // Parse "YYYY-MM-DD" as local midnight directly, instead of letting
    // `new Date(dateParam)` treat it as UTC midnight (which shifts the day
    // on negative-UTC-offset servers once setHours() re-localizes it).
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateParam);
    if (!match) {
      return res.status(400).json({ error: "Paramètre 'date' invalide (attendu AAAA-MM-JJ)." });
    }
    const [, year, month, dayOfMonth] = match;
    startOfDay = new Date(Number(year), Number(month) - 1, Number(dayOfMonth));
    if (Number.isNaN(startOfDay.getTime())) {
      return res.status(400).json({ error: "Paramètre 'date' invalide." });
    }
  } else {
    startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
  }
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const orders = await prisma.order.findMany({
    where: { timeSlot: { startsAt: { gte: startOfDay, lt: endOfDay } } },
    include: DASHBOARD_ORDER_INCLUDE,
    orderBy: { timeSlot: { startsAt: "asc" } },
  });

  res.json(orders);
});

const updateStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
});

ordersRouter.patch("/:id/status", requireStaff, async (req, res) => {
  const parsed = updateStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const order = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!order) return res.status(404).json({ error: "Commande introuvable." });

  const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
  if (!allowed.includes(parsed.data.status)) {
    return res.status(409).json({
      error: `Impossible de passer de ${order.status} à ${parsed.data.status}.`,
    });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Conditional on the status we just checked, so a concurrent request
      // that already moved the order elsewhere loses the race instead of
      // silently overwriting it (same pattern as the booking transaction).
      const nextStatus = parsed.data.status;
      const result = await tx.order.updateMany({
        where: { id: req.params.id, status: order.status },
        data: {
          status: nextStatus,
          ...(nextStatus !== "PENDING" && { [STATUS_TIMESTAMP[nextStatus]]: new Date() }),
        },
      });
      if (result.count === 0) throw new Error("STALE_STATUS");

      // Cancelling claws back the stamps this order earned, so
      // cancel-then-reorder can't be used to farm loyalty points.
      // (Redeemed stamps are not refunded, same as a physical card.)
      // Cancelling also gives the order's place in its slot back.
      if (nextStatus === "CANCELLED") {
        await tx.timeSlot.updateMany({
          where: { id: order.timeSlotId, reserved: { gt: 0 } },
          data: { reserved: { decrement: 1 } },
        });
      }

      if (nextStatus === "CANCELLED" && order.pointsEarned > 0) {
        const client = await tx.client.findUniqueOrThrow({ where: { id: order.clientId } });
        const newBalance = Math.max(0, client.loyaltyPoints - order.pointsEarned);
        await tx.client.update({ where: { id: client.id }, data: { loyaltyPoints: newBalance } });
      }
    });
  } catch (err) {
    if (err instanceof Error && err.message === "STALE_STATUS") {
      return res.status(409).json({ error: "La commande a été modifiée entre-temps." });
    }
    throw err;
  }

  const updated = await prisma.order.findUniqueOrThrow({
    where: { id: req.params.id },
    include: DASHBOARD_ORDER_INCLUDE,
  });

  res.json(updated);
});

const updateEtaSchema = z.object({
  minutes: z.number().int().min(1).max(MAX_ETA_MINUTES),
});

// Pizzaiolo sets "ready in N minutes" from now; the tracking page counts down.
ordersRouter.patch("/:id/eta", requireStaff, async (req, res) => {
  const parsed = updateEtaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const now = new Date();
  // Conditional on the status at write time, so an estimate can't land on an
  // order that was marked ready or cancelled in the meantime.
  const result = await prisma.order.updateMany({
    where: { id: req.params.id, status: { in: [...ETA_EDITABLE_STATUSES] } },
    data: {
      etaSetAt: now,
      estimatedReadyAt: new Date(now.getTime() + parsed.data.minutes * 60_000),
    },
  });

  const updated = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: DASHBOARD_ORDER_INCLUDE,
  });
  if (!updated) return res.status(404).json({ error: "Commande introuvable." });
  if (result.count === 0) {
    return res.status(409).json({ error: "Cette commande n'est plus en cuisine." });
  }

  res.json(updated);
});
