import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";

export const ordersRouter = Router();

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
