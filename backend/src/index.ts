import "dotenv/config";
import cors from "cors";
import express from "express";
import { pizzasRouter } from "./routes/pizzas.js";
import { timeSlotsRouter } from "./routes/timeSlots.js";
import { ordersRouter } from "./routes/orders.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/pizzas", pizzasRouter);
app.use("/api/time-slots", timeSlotsRouter);
app.use("/api/orders", ordersRouter);

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(port, () => {
  console.log(`Backend démarré sur http://localhost:${port}`);
});
