import { Prisma } from "@prisma/client";
import { Router, type RequestHandler } from "express";
import multer from "multer";
import { z } from "zod";
import { asyncRoute, HttpError } from "../../lib/asyncRoute.js";
import { pizzaPhotoUpload, pizzaPhotoUrl, removeUploadedPhoto } from "../../lib/uploads.js";
import { prisma } from "../../prisma.js";

export const adminPizzasRouter = Router();

const pizzaSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis.").max(60),
  description: z.string().trim().max(200).nullable().optional(),
  priceCents: z.number().int().min(1, "Le prix doit être positif.").max(100_00),
  category: z.enum(["TOMATO", "CREAM", "SPECIAL"]),
  tags: z.array(z.enum(["vegetarian", "spicy", "popular", "new"])).max(4),
  available: z.boolean(),
});

function isUniqueNameError(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function isNotFoundError(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025";
}

// Whole menu for staff, including "Épuisée" pizzas; archived ones are gone.
adminPizzasRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    const pizzas = await prisma.pizza.findMany({
      where: { archivedAt: null },
      include: { _count: { select: { orderItems: true } } },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    res.json(pizzas);
  })
);

adminPizzasRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const parsed = pizzaSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const pizza = await prisma.pizza.create({ data: parsed.data });
      res.status(201).json(pizza);
    } catch (err) {
      if (isUniqueNameError(err)) throw new HttpError(409, "Une pizza porte déjà ce nom.");
      throw err;
    }
  })
);

adminPizzasRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const parsed = pizzaSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const pizza = await prisma.pizza.update({
        where: { id: req.params.id, archivedAt: null },
        data: parsed.data,
      });
      res.json(pizza);
    } catch (err) {
      if (isUniqueNameError(err)) throw new HttpError(409, "Une pizza porte déjà ce nom.");
      if (isNotFoundError(err)) throw new HttpError(404, "Pizza introuvable.");
      throw err;
    }
  })
);

// A pizza that was never ordered is deleted for good; otherwise it's archived
// so past orders keep showing what was bought.
adminPizzasRouter.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    const pizza = await prisma.pizza.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { orderItems: true } } },
    });
    if (!pizza || pizza.archivedAt) throw new HttpError(404, "Pizza introuvable.");

    if (pizza._count.orderItems === 0) {
      try {
        await prisma.pizza.delete({ where: { id: pizza.id } });
        await removeUploadedPhoto(pizza.imageUrl);
        return res.json({ deleted: true });
      } catch (err) {
        // Ordered between the count and the delete: fall through to archiving.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003")) throw err;
      }
    }
    // Archiving frees the name for a future pizza with the same name.
    await prisma.pizza.update({
      where: { id: pizza.id },
      data: { archivedAt: new Date(), available: false, name: `${pizza.name} (archivée ${pizza.id.slice(-6)})` },
    });
    res.json({ deleted: false, archived: true });
  })
);

// Runs multer and turns its errors (file too large…) into readable 400s.
const receivePhoto: RequestHandler = (req, res, next) =>
  pizzaPhotoUpload(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      return next(
        new HttpError(400, err.code === "LIMIT_FILE_SIZE" ? "Photo trop lourde (5 Mo maximum)." : "Envoi de la photo refusé.")
      );
    }
    next(err);
  });

adminPizzasRouter.post(
  "/:id/photo",
  receivePhoto,
  asyncRoute(async (req, res) => {
    if (!req.file) throw new HttpError(400, "Aucune photo reçue.");
    const pizza = await prisma.pizza.findUnique({ where: { id: req.params.id } });
    if (!pizza || pizza.archivedAt) {
      await removeUploadedPhoto(pizzaPhotoUrl(req.file.filename));
      throw new HttpError(404, "Pizza introuvable.");
    }
    const updated = await prisma.pizza.update({
      where: { id: pizza.id },
      data: { imageUrl: pizzaPhotoUrl(req.file.filename) },
    });
    await removeUploadedPhoto(pizza.imageUrl);
    res.json(updated);
  })
);
