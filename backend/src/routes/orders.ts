import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";

export const ordersRouter = Router();

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

const createOrderSchema = z.object({
  clientName: z.string().min(1),
  clientEmail: z.string().email(),
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

ordersRouter.post("/", async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { clientName, clientEmail, clientPhone, timeSlotId, items } = parsed.data;

  try {
    const order = await prisma.$transaction(async (tx) => {
      // Lock the slot's row implicitly via the conditional update below,
      // so two concurrent bookings can't both squeeze into the last spot.
      const slot = await tx.timeSlot.findUniqueOrThrow({ where: { id: timeSlotId } });
      if (slot.reserved >= slot.capacity) {
        throw new Error("SLOT_FULL");
      }

      const pizzas = await tx.pizza.findMany({
        where: { id: { in: items.map((i) => i.pizzaId) } },
      });
      const pizzaById = new Map(pizzas.map((p) => [p.id, p]));

      let totalCents = 0;
      for (const item of items) {
        const pizza = pizzaById.get(item.pizzaId);
        if (!pizza) throw new Error("PIZZA_NOT_FOUND");
        totalCents += pizza.priceCents * item.quantity;
      }

      const client = await tx.client.upsert({
        where: { email: clientEmail },
        update: { name: clientName, phone: clientPhone },
        create: { name: clientName, email: clientEmail, phone: clientPhone },
      });

      const updatedSlot = await tx.timeSlot.updateMany({
        where: { id: timeSlotId, reserved: { lt: slot.capacity } },
        data: { reserved: { increment: 1 } },
      });
      if (updatedSlot.count === 0) throw new Error("SLOT_FULL");

      return tx.order.create({
        data: {
          clientId: client.id,
          timeSlotId,
          totalCents,
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
    if (err instanceof Error && err.message === "PIZZA_NOT_FOUND") {
      return res.status(400).json({ error: "Une pizza demandée n'existe pas." });
    }
    console.error(err);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

ordersRouter.get("/:id", async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { items: { include: { pizza: true } }, timeSlot: true, payment: true },
  });
  if (!order) return res.status(404).json({ error: "Commande introuvable." });
  res.json(order);
});

// Pizzaiolo dashboard: every order for today (or a given date), oldest slot first.
ordersRouter.get("/", async (req, res) => {
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
    include: {
      client: true,
      items: { include: { pizza: true } },
      timeSlot: true,
    },
    orderBy: { timeSlot: { startsAt: "asc" } },
  });

  res.json(orders);
});

const updateStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
});

ordersRouter.patch("/:id/status", async (req, res) => {
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

  // Conditional on the status we just checked, so a concurrent request that
  // already moved the order elsewhere loses the race instead of silently
  // overwriting it (same pattern as the time-slot booking transaction above).
  const result = await prisma.order.updateMany({
    where: { id: req.params.id, status: order.status },
    data: { status: parsed.data.status },
  });
  if (result.count === 0) {
    return res.status(409).json({ error: "La commande a été modifiée entre-temps." });
  }

  const updated = await prisma.order.findUniqueOrThrow({
    where: { id: req.params.id },
    include: { items: { include: { pizza: true } }, timeSlot: true, client: true },
  });

  res.json(updated);
});
