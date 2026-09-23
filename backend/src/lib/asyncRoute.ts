import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Express 4 doesn't catch rejections from async handlers, and an unhandled
 * rejection crashes the whole process. Wrapping a handler forwards them to
 * `errorHandler` below instead.
 */
export function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

// Mounted last in index.ts: turns anything thrown/forwarded into a JSON 500
// (or the status an error carries, e.g. multer's 413-style errors).
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = typeof err?.status === "number" ? err.status : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? "Erreur serveur." : String(err.message ?? "Requête invalide.") });
};

/** An error with an HTTP status, for `throw` inside `asyncRoute` handlers. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
