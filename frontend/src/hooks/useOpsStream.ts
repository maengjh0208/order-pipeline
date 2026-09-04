import { useEffect, useRef, useState } from "react";
import type { OpsSummary, SagaEvent } from "../types/order";
import { API_BASE_URL } from "../lib/api";

export interface OpsStreamState {
  events: SagaEvent[];
  summary: OpsSummary;
}

export function useOpsStream(initialSummary: OpsSummary): OpsStreamState {
  const [events, setEvents] = useState<SagaEvent[]>([]);
  const [summary, setSummary] = useState<OpsSummary>(initialSummary);
  const seenOrderIds = useRef(new Set<string>());
  const finishedCounts = useRef({ completed: 0, cancelled: 0 });
  // initialSummary가 REST 쿼리 완료 후(비동기로) 뒤늦게 도착해도 반영하기 위한 플래그.
  // SSE로 이미 집계가 진행된 뒤에는 뒤늦은 initialSummary가 그걸 덮어쓰지 않게 막는다.
  const hasReceivedEvent = useRef(false);

  useEffect(() => {
    if (!hasReceivedEvent.current) setSummary(initialSummary);
  }, [initialSummary]);

  useEffect(() => {
    const source = new EventSource(`${API_BASE_URL}/sse/ops`);

    source.onmessage = (message) => {
      const event: SagaEvent = JSON.parse(message.data);
      hasReceivedEvent.current = true;
      setEvents((prev) => [...prev, event]);

      const isNewOrder = !seenOrderIds.current.has(event.order_id);
      if (isNewOrder) seenOrderIds.current.add(event.order_id);

      if (event.to_status === "COMPLETED") finishedCounts.current.completed += 1;
      if (event.to_status === "CANCELLED") finishedCounts.current.cancelled += 1;

      setSummary((prev) => {
        const totalFinished = finishedCounts.current.completed + finishedCounts.current.cancelled;
        return {
          total_orders: seenOrderIds.current.size,
          retrying_count:
            prev.retrying_count +
            (event.to_status === "RETRYING_PAYMENT" ? 1 : event.from_status === "RETRYING_PAYMENT" ? -1 : 0),
          dlq_count: prev.dlq_count + (event.to_status === "PAYMENT_FAILED_DLQ" ? 1 : 0),
          success_rate: totalFinished > 0 ? finishedCounts.current.completed / totalFinished : prev.success_rate,
        };
      });
    };

    return () => source.close();
  }, []);

  return { events, summary };
}
