import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { createFailureLimiter } from "./rateLimit.js";

// Single shared staff password (backend/.env). Kept separate from customer
// accounts: its own cookie and a `role: "staff"` claim, so a customer
// `session` cookie can never open the back-office.
const COOKIE_NAME = "staff_session";
const SESSION_HOURS = 12;
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

function jwtSecret(): string {
  // Checked at load time by lib/auth.ts, which index.ts always imports first.
  return process.env.JWT_SECRET!;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest();
}

export function staffPasswordConfigured() {
  return Boolean(process.env.STAFF_PASSWORD);
}

// Short fingerprint of the current password, stored in the token: changing
// STAFF_PASSWORD invalidates every open staff session.
function passwordVersion() {
  return sha256(process.env.STAFF_PASSWORD ?? "").toString("hex").slice(0, 8);
}

export function checkStaffPassword(candidate: string) {
  const expected = process.env.STAFF_PASSWORD;
  if (!expected) return false;
  // Compare fixed-length digests so the comparison time doesn't leak length.
  return timingSafeEqual(sha256(candidate), sha256(expected));
}

// Brute-force guard: MAX_FAILURES wrong passwords per IP per window.
const limiter = createFailureLimiter({ max: MAX_FAILURES, windowMs: FAILURE_WINDOW_MS });
export const isLockedOut = limiter.isLockedOut;
export const recordFailure = limiter.recordFailure;
export const clearFailures = limiter.clear;

export function setStaffCookie(res: Response) {
  const token = jwt.sign({ role: "staff", pwv: passwordVersion() }, jwtSecret(), {
    expiresIn: `${SESSION_HOURS}h`,
  });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_HOURS * 60 * 60 * 1000,
  });
}

export function clearStaffCookie(res: Response) {
  res.clearCookie(COOKIE_NAME);
}

export function isStaff(req: Request) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token || !staffPasswordConfigured()) return false;
  try {
    const payload = jwt.verify(token, jwtSecret()) as { role?: string; pwv?: string };
    return payload.role === "staff" && payload.pwv === passwordVersion();
  } catch {
    return false;
  }
}

/** Rejects with 401 unless the request carries a valid staff session. */
export function requireStaff(req: Request, res: Response, next: NextFunction) {
  if (!isStaff(req)) return res.status(401).json({ error: "Accès réservé au pizzaiolo." });
  next();
}
