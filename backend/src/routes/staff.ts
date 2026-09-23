import { Router } from "express";
import { z } from "zod";
import {
  checkStaffPassword,
  clearFailures,
  clearStaffCookie,
  isLockedOut,
  isStaff,
  recordFailure,
  setStaffCookie,
  staffPasswordConfigured,
} from "../lib/staffAuth.js";

export const staffRouter = Router();

const loginSchema = z.object({ password: z.string().min(1) });

staffRouter.post("/login", (req, res) => {
  if (!staffPasswordConfigured()) {
    return res.status(503).json({ error: "STAFF_PASSWORD n'est pas configuré dans backend/.env." });
  }
  const ip = req.ip ?? "unknown";
  if (isLockedOut(ip)) {
    return res.status(429).json({ error: "Trop d'essais. Réessaie dans 15 minutes." });
  }
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success || !checkStaffPassword(parsed.data.password)) {
    recordFailure(ip);
    return res.status(401).json({ error: "Mot de passe incorrect." });
  }
  clearFailures(ip);
  setStaffCookie(res);
  res.json({ ok: true });
});

staffRouter.post("/logout", (_req, res) => {
  clearStaffCookie(res);
  res.status(204).end();
});

staffRouter.get("/me", (req, res) => {
  if (!isStaff(req)) return res.status(401).json({ error: "Non connecté." });
  res.json({ ok: true });
});
