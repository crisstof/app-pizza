import { toast } from "sonner";
import { updateOrderEta, updateOrderStatus, type Order, type OrderStatus } from "@/api";
import { STATUS_CONFIG } from "./orderStatus";
import { useStaffError } from "./useStaffError";

export type OrderActions = {
  advance: (order: Order, status: OrderStatus) => Promise<void>;
  setEta: (order: Order, minutes: number) => Promise<void>;
};

/** Status / ETA / cancel calls with toasts; `onUpdated` receives the fresh order. */
export function useOrderActions(onUpdated: (order: Order) => void): OrderActions {
  const fail = useStaffError();
  return {
    async advance(order, status) {
      try {
        onUpdated(await updateOrderStatus(order.id, status));
        toast.success(`${order.client.name} · ${STATUS_CONFIG[status].label}`);
      } catch (err) {
        fail(err);
      }
    },
    async setEta(order, minutes) {
      try {
        onUpdated(await updateOrderEta(order.id, minutes));
        toast.success(`${order.client.name} · prête dans ${minutes} min`);
      } catch (err) {
        fail(err);
      }
    },
  };
}
