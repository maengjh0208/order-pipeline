import { useEffect, useState } from "react";
import type { OrderStatus, SagaEvent } from "../types/order";
import { API_BASE_URL } from "../lib/api";

export interface OrderStreamState {
  status: OrderStatus | null;
}

export function useOrderStream(orderId: string, initialStatus: OrderStatus | null): OrderStreamState {
  const [status, setStatus] = useState<OrderStatus | null>(initialStatus);

  // initialStatus는 REST 쿼리가 비동기로 완료된 뒤에야 실제 값을 갖는 경우가 많아,
  // useState의 초기값만으로는 마운트 이후 도착하는 값을 반영하지 못한다.
  // 아직 SSE로 아무 이벤트도 못 받았을 때(status가 null일 때)만 initialStatus로 채운다 —
  // SSE가 이미 더 최신 상태를 알려줬다면 그걸 덮어쓰지 않는다.
  useEffect(() => {
    setStatus((prev) => prev ?? initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    if (!orderId) return;

    const source = new EventSource(`${API_BASE_URL}/sse/orders/${orderId}`);

    source.onmessage = (message) => {
      const event: SagaEvent = JSON.parse(message.data);
      setStatus(event.to_status);
    };

    return () => source.close();
  }, [orderId]);

  return { status };
}
