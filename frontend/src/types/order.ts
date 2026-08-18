export type OrderStatus =
  | "CREATED"
  | "INVENTORY_RESERVING"
  | "INVENTORY_RESERVED"
  | "INVENTORY_FAILED"
  | "PAYMENT_PROCESSING"
  | "RETRYING_PAYMENT"
  | "PAYMENT_FAILED_DLQ"
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
  attempt: number;
  max_attempts: number;
  reason: string | null;
  occurred_at: string;
}

export interface OrderItem {
  product_id: string;
  product_name: string;
  quantity: number;
}

export interface OrderHistoryEntry {
  from_status: OrderStatus;
  to_status: OrderStatus;
  occurred_at: string;
  reason: string | null;
  attempt: number;
}

export interface Order {
  order_id: string;
  current_status: OrderStatus;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
  card_number: string;
  history: OrderHistoryEntry[];
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
