import { Router } from "express";
import { prisma } from "../prisma.js";

export const pizzasRouter = Router();

pizzasRouter.get("/", async (_req, res) => {
  const pizzas = await prisma.pizza.findMany({ where: { available: true } });
  res.json(pizzas);
});
