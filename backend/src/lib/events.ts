import { EventEmitter } from "node:events";

// In-process bus for live back-office updates (see routes/admin/events.ts).
// Single backend instance only; with several, this would need Redis pub/sub
// or Postgres LISTEN/NOTIFY instead.
export type OrderEvent = { type: "created" | "updated"; orderId: string };

const bus = new EventEmitter();
// One listener per open staff screen; lift the default cap of 10.
bus.setMaxListeners(0);

export function emitOrderEvent(event: OrderEvent) {
  bus.emit("order", event);
}

export function onOrderEvent(listener: (event: OrderEvent) => void) {
  bus.on("order", listener);
  return () => {
    bus.off("order", listener);
  };
}
