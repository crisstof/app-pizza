import { Router } from "express";
import { onOrderEvent } from "../../lib/events.js";
import { isStaff } from "../../lib/staffAuth.js";

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
  function stop() {
    clearInterval(heartbeat);
    unsubscribe();
  }
  // Comment lines keep proxies from closing an idle connection. The session
  // is re-checked each time: once it expires or STAFF_PASSWORD changes, the
  // stream ends (and the browser's reconnect then gets a 401).
  const heartbeat = setInterval(() => {
    if (!isStaff(req)) {
      stop();
      res.end();
      return;
    }
    res.write(": ping\n\n");
  }, HEARTBEAT_MS);

  req.on("close", stop);
});
