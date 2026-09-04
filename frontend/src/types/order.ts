export type OrderStatus =
  | "CREATED"
  | "INVENTORY_RESERVING"
  | "INVENTORY_RESERVED"
  | "INVENTORY_FAILED"
  | "PAYMENT_PROCESSING"
  | "PAYMENT_FAILED"
  | "RETRYING_PAYMENT"
  | "PAYMENT_FAILED_DLQ"
  | "COMPENSATING_INVENTORY"
  | "PAID"
  | "NOTIFYING"
  | "COMPLETED"
  | "CANCELLED";

export type SagaStep = "INVENTORY" | "PAYMENT" | "NOTIFICATION";

export interface SagaEvent {
  event_id: string;
  order_id: string;
  saga_step: SagaStep;
  from_status: OrderStatus;
  to_status: OrderStatus;
  occurred_at: string;
  // 실제 오케스트레이터는 update_status 시점에 이 3개를 채우지 않는다 (스펙 4.2절).
  // mock 서버는 채워 보내므로 optional로 둔다. 이벤트 로그 테이블은 렌더링하지 않음.
  attempt?: number;
  max_attempts?: number;
  reason?: string | null;
}

export interface Order {
  order_id: string;
  current_status: OrderStatus;
  items: { product_id: string; quantity: number }[];
}

export interface OpsSummary {
  total_orders: number;
  retrying_count: number;
  dlq_count: number;
  success_rate: number;
}

const TERMINAL_STATUSES: OrderStatus[] = ["COMPLETED", "CANCELLED"];
const FAILURE_STATUSES: OrderStatus[] = [
  "INVENTORY_FAILED",
  "PAYMENT_FAILED_DLQ",
  "CANCELLED",
];

export function isTerminalStatus(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function isFailureStatus(status: OrderStatus): boolean {
  return FAILURE_STATUSES.includes(status);
}
