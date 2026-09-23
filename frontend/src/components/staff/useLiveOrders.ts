import { useEffect, useRef, useState } from "react";
import { apiUrl } from "@/api";

export type LiveOrderEvent = { type: "created" | "updated"; orderId: string };

/**
 * Subscribes to the backend's order event stream (Server-Sent Events).
 * EventSource reconnects by itself; `live` tells whether it's connected right
 * now, so the page can say "en direct" or fall back on its polling.
 */
export function useLiveOrders(onEvent: (event: LiveOrderEvent) => void) {
  const [live, setLive] = useState(false);
  // Latest callback without reopening the connection on every render.
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });

  useEffect(() => {
    const source = new EventSource(apiUrl("/api/admin/events"), { withCredentials: true });
    source.onopen = () => setLive(true);
    source.onerror = () => setLive(false);
    source.addEventListener("order", (e) => {
      try {
        handler.current(JSON.parse((e as MessageEvent<string>).data));
      } catch {
        // Ignore a malformed event rather than breaking the stream.
      }
    });
    return () => source.close();
  }, []);

  return live;
}
