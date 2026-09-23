import { Router } from "express";
import { prisma } from "../../prisma.js";
import { DASHBOARD_ORDER_INCLUDE } from "../orders.js";

export const adminOrdersRouter = Router();

// Search across every date: client name / email / phone, or order reference
// (the first characters of the id, as shown on tickets).
adminOrdersRouter.get("/", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q.length < 2) return res.json([]);

  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { id: { startsWith: q.toLowerCase() } },
        { client: { name: { contains: q, mode: "insensitive" } } },
        { client: { email: { contains: q, mode: "insensitive" } } },
        { client: { phone: { contains: q } } },
      ],
    },
    include: DASHBOARD_ORDER_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json(orders);
});
