import { Router } from "express";
import { refreshUpcomingTimeSlots } from "../lib/timeSlots.js";
import { prisma } from "../prisma.js";

export const timeSlotsRouter = Router();

// Upcoming slots customers can book: not started yet, not closed by staff.
timeSlotsRouter.get("/", async (_req, res) => {
  await refreshUpcomingTimeSlots();

  const slots = await prisma.timeSlot.findMany({
    where: {
      startsAt: { gte: new Date() },
      closed: false,
    },
    orderBy: { startsAt: "asc" },
  });

  const withAvailability = slots.map((slot) => ({
    ...slot,
    available: slot.capacity - slot.reserved,
  }));

  res.json(withAvailability);
});
