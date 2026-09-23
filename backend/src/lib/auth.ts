import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET manquant dans l'environnement.");
}
const JWT_SECRET: string = process.env.JWT_SECRET;

const COOKIE_NAME = "session";
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// Compared against when the email has no account, so a login attempt takes
// the same bcrypt time either way and doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

/** Constant-time-ish check: false for a missing hash, after the same work. */
export async function verifyPasswordOrDummy(password: string, hash: string | null | undefined): Promise<boolean> {
  const ok = await bcrypt.compare(password, hash ?? DUMMY_HASH);
  return Boolean(hash) && ok;
}

/** Emails are stored and looked up lowercased (a single account per address). */
export const normalizedEmail = () => z.string().trim().toLowerCase().email();

export function setSessionCookie(res: Response, clientId: string) {
  const token = jwt.sign({ clientId }, JWT_SECRET, { expiresIn: "30d" });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE_MS,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE_NAME);
}

function readClientId(req: Request): string | null {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { clientId: string };
    return payload.clientId;
  } catch {
    return null;
  }
}

declare global {
  namespace Express {
    interface Request {
      clientId?: string;
    }
  }
}

/** Decodes the session cookie if present; never rejects the request. */
export function attachClientIfPresent(req: Request, _res: Response, next: NextFunction) {
  const clientId = readClientId(req);
  if (clientId) req.clientId = clientId;
  next();
}

/** Rejects the request with 401 unless a valid session cookie is present. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const clientId = readClientId(req);
  if (!clientId) return res.status(401).json({ error: "Non authentifié." });
  req.clientId = clientId;
  next();
}
