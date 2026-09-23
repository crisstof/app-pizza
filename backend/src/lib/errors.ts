import type { ErrorRequestHandler } from "express";

// Express 5 forwards errors thrown (or rejected) in async route handlers to
// the error-handling middleware below, so handlers can simply `throw`.

// Mounted last in index.ts: turns anything thrown/forwarded into a JSON 500
// (or the status an error carries, e.g. multer's 413-style errors).
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = typeof err?.status === "number" ? err.status : 500;
  if (status >= 500) console.error(err);
  // Only our own HttpError messages are meant for users; library errors
  // (malformed JSON…) get a generic wording.
  const message = status >= 500 ? "Erreur serveur." : err instanceof HttpError ? err.message : "Requête invalide.";
  res.status(status).json({ error: message });
};

/** An error with an HTTP status, for `throw` inside route handlers. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
