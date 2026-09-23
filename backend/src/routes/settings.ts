import { Router } from "express";
import { asyncRoute } from "../lib/asyncRoute.js";
import { getSettings, publicSettings } from "../lib/settings.js";

export const settingsRouter = Router();

// Opening hours for the customer pages (footer, lunch/dinner split).
settingsRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    res.json(publicSettings(await getSettings()));
  })
);
