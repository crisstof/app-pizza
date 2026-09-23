import { Router } from "express";
import { onOrderEvent } from "../../lib/events.js";

export const adminEventsRouter = Router();

const HEARTBEAT_MS = 25_000;

// Server-Sent Events: the Service page keeps this open and gets an event the
// moment an order is created or changes, instead of waiting for its polling.
adminEventsRouter.get("/", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Tell nginx not to buffer the stream once deployed behind it.
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 5000\n\n");

  const unsubscribe = onOrderEvent((event) => {
    res.write(`event: order\ndata: ${JSON.stringify(event)}\n\n`);
  });
  // Comment lines keep proxies from closing an idle connection.
  const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});
