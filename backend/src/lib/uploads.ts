import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { HttpError } from "./asyncRoute.js";

// Uploaded files live in backend/uploads (gitignored) and are served at /uploads.
export const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
export const UPLOADS_URL_PREFIX = "/uploads/";
const PIZZA_DIR = path.join(UPLOADS_DIR, "pizzas");
mkdirSync(PIZZA_DIR, { recursive: true });

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export const pizzaPhotoUpload = multer({
  storage: multer.diskStorage({
    destination: PIZZA_DIR,
    // Random name: never trust the client's file name as a path.
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${EXTENSION_BY_TYPE[file.mimetype]}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (EXTENSION_BY_TYPE[file.mimetype]) cb(null, true);
    else cb(new HttpError(400, "Photo en JPEG, PNG ou WebP uniquement."));
  },
}).single("photo");

export function pizzaPhotoUrl(filename: string) {
  return `${UPLOADS_URL_PREFIX}pizzas/${filename}`;
}

/**
 * Deletes a previously uploaded photo. Only touches files under /uploads/ —
 * the starter menu's /images/*.jpg belong to the frontend and are never
 * removed. Missing files are ignored.
 */
export async function removeUploadedPhoto(imageUrl: string | null) {
  if (!imageUrl?.startsWith(UPLOADS_URL_PREFIX)) return;
  const filePath = path.resolve(UPLOADS_DIR, imageUrl.slice(UPLOADS_URL_PREFIX.length));
  if (!filePath.startsWith(UPLOADS_DIR + path.sep)) return;
  await unlink(filePath).catch(() => {});
}
