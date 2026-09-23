import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { authRouter } from "./routes/auth.js";
import { errorHandler } from "./lib/errors.js";
import { requireStaff, staffPasswordConfigured } from "./lib/staffAuth.js";
import { refreshUpcomingTimeSlots } from "./lib/timeSlots.js";
import { UPLOADS_DIR } from "./lib/uploads.js";
import { adminClientsRouter } from "./routes/admin/clients.js";
import { adminDoughRouter } from "./routes/admin/dough.js";
import { adminEventsRouter } from "./routes/admin/events.js";
import { adminOrdersRouter } from "./routes/admin/orders.js";
import { adminPizzasRouter } from "./routes/admin/pizzas.js";
import { adminStatsRouter } from "./routes/admin/stats.js";
import { adminTimeSlotsRouter } from "./routes/admin/timeSlots.js";
import { pizzasRouter } from "./routes/pizzas.js";
import { settingsRouter } from "./routes/settings.js";
import { staffRouter } from "./routes/staff.js";
import { timeSlotsRouter } from "./routes/timeSlots.js";
import { ordersRouter } from "./routes/orders.js";

const app = express();
// Behind a reverse proxy, trust its X-Forwarded-For so req.ip (used by the
// login lockouts) is the visitor's address, not the proxy's.
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY));
app.use(cors({ origin: process.env.FRONTEND_URL ?? "http://localhost:5173", credentials: true }));
app.use(cookieParser());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

// Uploaded pizza photos (backend/uploads, gitignored).
app.use("/uploads", express.static(UPLOADS_DIR, { maxAge: "7d" }));

app.use("/api/auth", authRouter);
app.use("/api/pizzas", pizzasRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/time-slots", timeSlotsRouter);
app.use("/api/orders", ordersRouter);

// Staff back-office: login is open, everything under /api/admin needs it.
app.use("/api/staff", staffRouter);
app.use("/api/admin", requireStaff);
app.use("/api/admin/pizzas", adminPizzasRouter);
app.use("/api/admin/orders", adminOrdersRouter);
app.use("/api/admin/clients", adminClientsRouter);
app.use("/api/admin/dough", adminDoughRouter);
app.use("/api/admin/events", adminEventsRouter);
app.use("/api/admin/stats", adminStatsRouter);
app.use("/api/admin", adminTimeSlotsRouter);

app.use(errorHandler);

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(port, () => {
  console.log(`Backend démarré sur http://localhost:${port}`);
  if (!staffPasswordConfigured()) {
    console.warn("STAFF_PASSWORD absent de backend/.env : l'espace pizzaiolo est inaccessible.");
  }
  refreshUpcomingTimeSlots();
});
