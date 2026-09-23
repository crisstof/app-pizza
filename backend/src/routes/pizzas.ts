import { Router } from "express";
import { asyncRoute } from "../lib/asyncRoute.js";
import { prisma } from "../prisma.js";

export const pizzasRouter = Router();

// The customer menu: sold-out pizzas are included (shown greyed out),
// archived ones are not.
pizzasRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    const pizzas = await prisma.pizza.findMany({
      where: { archivedAt: null },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    res.json(pizzas);
  })
);
