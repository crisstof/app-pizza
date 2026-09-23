import { Router } from "express";
import { refreshUpcomingTimeSlots } from "../lib/timeSlots.js";
import { prisma } from "../prisma.js";

export const timeSlotsRouter = Router();

// Only slots that still have room and haven't started yet.
timeSlotsRouter.get("/", async (_req, res) => {
  await refreshUpcomingTimeSlots();

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
