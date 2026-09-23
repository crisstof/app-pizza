import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../../lib/errors.js";
import { prisma } from "../../prisma.js";

export const adminClientsRouter = Router();

// Explicit select: never send passwordHash, only whether an account exists.
const CLIENT_FIELDS = {
  id: true,
  name: true,
  email: true,
  phone: true,
  loyaltyPoints: true,
  createdAt: true,
  passwordHash: true,
} as const;

function withoutHash<T extends { passwordHash: string | null }>({ passwordHash, ...client }: T) {
  return { ...client, hasAccount: passwordHash !== null };
}

adminClientsRouter.get("/", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const clients = await prisma.client.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
          ],
        }
      : undefined,
    select: { ...CLIENT_FIELDS, _count: { select: { orders: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Money spent, not counting cancelled orders, in one grouped query.
  const spent = await prisma.order.groupBy({
    by: ["clientId"],
    where: { clientId: { in: clients.map((c) => c.id) }, status: { not: "CANCELLED" } },
    _sum: { totalCents: true },
  });
  const spentById = new Map(spent.map((s) => [s.clientId, s._sum.totalCents ?? 0]));

  res.json(
    clients.map(({ _count, ...client }) => ({
      ...withoutHash(client),
      orderCount: _count.orders,
      spentCents: spentById.get(client.id) ?? 0,
    })),
  );
});

adminClientsRouter.get("/:id", async (req, res) => {
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    select: {
      ...CLIENT_FIELDS,
      orders: {
        include: { items: { include: { pizza: true } }, timeSlot: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!client) throw new HttpError(404, "Client introuvable.");
  res.json(withoutHash(client));
});

const loyaltySchema = z.object({
  delta: z
    .number()
    .int()
    .min(-100)
    .max(100)
    .refine((d) => d !== 0, "Ajustement nul."),
});

// Manual stamp adjustment (goodwill gesture, correction).
adminClientsRouter.patch("/:id/loyalty", async (req, res) => {
  const parsed = loyaltySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { delta } = parsed.data;

  // Conditional on the balance at write time, so a removal can never take
  // it below zero, even racing an order that spends stamps.
  const result = await prisma.client.updateMany({
    where: { id: req.params.id, ...(delta < 0 && { loyaltyPoints: { gte: -delta } }) },
    data: { loyaltyPoints: { increment: delta } },
  });
  const client = await prisma.client.findUnique({ where: { id: req.params.id }, select: CLIENT_FIELDS });
  if (!client) throw new HttpError(404, "Client introuvable.");
  if (result.count === 0) {
    throw new HttpError(409, `Ce client n'a que ${client.loyaltyPoints} tampon${client.loyaltyPoints > 1 ? "s" : ""}.`);
  }
  res.json(withoutHash(client));
});
