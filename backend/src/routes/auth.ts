import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { clearSessionCookie, hashPassword, requireAuth, setSessionCookie, verifyPassword } from "../lib/auth.js";
import { createFailureLimiter } from "../lib/rateLimit.js";

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { name, email, password } = parsed.data;

  const existing = await prisma.client.findUnique({ where: { email } });
  if (existing?.passwordHash) {
    return res.status(409).json({ error: "Un compte existe déjà avec cet email." });
  }

  const passwordHash = await hashPassword(password);
  const client = existing
    ? await prisma.client.update({ where: { id: existing.id }, data: { name, passwordHash } })
    : await prisma.client.create({ data: { name, email, passwordHash } });

  setSessionCookie(res, client.id);
  res.status(201).json({ name: client.name, email: client.email, loyaltyPoints: client.loyaltyPoints });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Password guessing guard. Keyed on IP + email (5 tries per account from one
// place), plus a looser per-IP cap against spraying many accounts. Not keyed
// on the email alone, which would let anyone lock a customer out.
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const accountLimiter = createFailureLimiter({ max: 5, windowMs: FAILURE_WINDOW_MS });
const ipLimiter = createFailureLimiter({ max: 30, windowMs: FAILURE_WINDOW_MS });

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, password } = parsed.data;
  const ip = req.ip ?? "unknown";
  const accountKey = `${ip}|${email.toLowerCase()}`;
  if (ipLimiter.isLockedOut(ip) || accountLimiter.isLockedOut(accountKey)) {
    return res.status(429).json({ error: "Trop d'essais. Réessaie dans 15 minutes." });
  }

  const client = await prisma.client.findUnique({ where: { email } });
  if (!client?.passwordHash || !(await verifyPassword(password, client.passwordHash))) {
    ipLimiter.recordFailure(ip);
    accountLimiter.recordFailure(accountKey);
    return res.status(401).json({ error: "Email ou mot de passe incorrect." });
  }
  accountLimiter.clear(accountKey);

  setSessionCookie(res, client.id);
  res.json({ name: client.name, email: client.email, loyaltyPoints: client.loyaltyPoints });
});

authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const client = await prisma.client.findUnique({ where: { id: req.clientId! } });
  if (!client) return res.status(401).json({ error: "Non authentifié." });
  res.json({ name: client.name, email: client.email, loyaltyPoints: client.loyaltyPoints });
});
