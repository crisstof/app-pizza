import { Router } from "express";
import { prisma } from "../prisma.js";

export const timeSlotsRouter = Router();

// Only slots that still have room and haven't started yet.
timeSlotsRouter.get("/", async (_req, res) => {
  const slots = await prisma.timeSlot.findMany({
    where: {
      startsAt: { gte: new Date() },
    },
    orderBy: { startsAt: "asc" },
  });

  const withAvailability = slots.map((slot) => ({
    ...slot,
    available: slot.capacity - slot.reserved,
  }));

  res.json(withAvailability);
});
