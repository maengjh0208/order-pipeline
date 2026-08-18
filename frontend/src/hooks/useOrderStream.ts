import { useEffect, useState } from "react";
import type { OrderStatus, SagaEvent } from "../types/order";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export interface OrderStreamState {
  status: OrderStatus | null;
}

export function useOrderStream(orderId: string, initialStatus: OrderStatus | null): OrderStreamState {
  const [status, setStatus] = useState<OrderStatus | null>(initialStatus);

  useEffect(() => {
    if (!orderId) return;

    const source = new EventSource(`${BASE_URL}/sse/orders/${orderId}`);

    source.onmessage = (message) => {
      const event: SagaEvent = JSON.parse(message.data);
      setStatus(event.to_status);
    };

    return () => source.close();
  }, [orderId]);

  return { status };
}
