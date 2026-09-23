import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { authRouter } from "./routes/auth.js";
import { pizzasRouter } from "./routes/pizzas.js";
import { timeSlotsRouter } from "./routes/timeSlots.js";
import { ordersRouter } from "./routes/orders.js";

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL ?? "http://localhost:5173", credentials: true }));
app.use(cookieParser());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/pizzas", pizzasRouter);
app.use("/api/time-slots", timeSlotsRouter);
app.use("/api/orders", ordersRouter);

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(port, () => {
  console.log(`Backend démarré sur http://localhost:${port}`);
});
