import type { SagaEvent } from "../types/order";

export interface EventLogTableProps {
  events: SagaEvent[];
}

export function EventLogTable({ events }: EventLogTableProps) {
  const latestFirst = [...events].reverse();

  return (
    <table>
      <thead>
        <tr>
          <th>시각</th>
          <th>주문 ID</th>
          <th>단계</th>
          <th>상태 전이</th>
        </tr>
      </thead>
      <tbody>
        {latestFirst.map((event) => (
          <tr key={event.event_id}>
            <td>{new Date(event.occurred_at).toLocaleTimeString()}</td>
            <td>{event.order_id}</td>
            <td>{event.saga_step}</td>
            <td>
              {event.from_status} → {event.to_status}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
