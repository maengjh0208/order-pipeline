import type { OrderStatus } from "../types/order";

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: "CREATED", label: "주문 생성" },
  { status: "INVENTORY_RESERVING", label: "재고 확인" },
  { status: "PAYMENT_PROCESSING", label: "결제 처리" },
  { status: "NOTIFYING", label: "알림 발송" },
  { status: "COMPLETED", label: "완료" },
];

// 고객에게는 보상 트랜잭션 같은 내부 사가 용어를 노출하지 않는다 (기술적 세부사항은 /ops 대시보드 전용).
// PAYMENT_FAILED는 재시도/DLQ 결정 직전의 찰나의 상태라 배너 없이 "결제 처리" 단계가 계속 활성으로 보이게 둔다.
const FAILURE_LABELS: Partial<Record<OrderStatus, string>> = {
  INVENTORY_FAILED: "재고가 부족합니다",
  RETRYING_PAYMENT: "결제 재시도 중",
  PAYMENT_FAILED_DLQ: "결제에 실패했습니다",
  COMPENSATING_INVENTORY: "주문을 취소 처리하고 있습니다",
  CANCELLED: "주문이 취소되었습니다",
};

type StepState = "done" | "active" | "pending";

// STEPS에 없는 중간/실패 상태(예: INVENTORY_RESERVED, PAID, PAYMENT_FAILED)도
// "실제로는 어느 단계를 지나는 중인지"로 매핑해서, 진행 표시가 순간적으로 뒤로 되돌아가 보이지 않게 한다.
const STAGE_INDEX: Record<OrderStatus, number> = {
  CREATED: 0,
  INVENTORY_RESERVING: 1,
  INVENTORY_RESERVED: 1,
  INVENTORY_FAILED: 1,
  PAYMENT_PROCESSING: 2,
  PAYMENT_FAILED: 2,
  RETRYING_PAYMENT: 2,
  PAYMENT_FAILED_DLQ: 2,
  COMPENSATING_INVENTORY: 2,
  PAID: 2,
  NOTIFYING: 3,
  COMPLETED: 4,
  CANCELLED: 3, // 아래 stepState의 CANCELLED 분기에서 별도 처리하므로 여기 값은 실제로 쓰이지 않음
};

function stepState(stepStatus: OrderStatus, currentStatus: OrderStatus): StepState {
  // 취소된 주문은 "완료"를 거짓으로 활성/완료 표시하지 않는다 — 그 외 단계는 지나온 것으로 보고 실패 배너로 결과를 설명한다.
  if (currentStatus === "CANCELLED") {
    return stepStatus === "COMPLETED" ? "pending" : "done";
  }

  const stepIndex = STAGE_INDEX[stepStatus];
  const currentIndex = STAGE_INDEX[currentStatus];
  if (stepIndex < currentIndex) return "done";
  if (stepIndex === currentIndex) return "active";
  return "pending";
}

export interface OrderTimelineProps {
  currentStatus: OrderStatus;
}

export function OrderTimeline({ currentStatus }: OrderTimelineProps) {
  const failureLabel = FAILURE_LABELS[currentStatus];

  return (
    <ol className="order-timeline">
      {STEPS.map((step) => (
        <li key={step.status} data-state={stepState(step.status, currentStatus)}>
          {step.label}
        </li>
      ))}
      {failureLabel && (
        <li data-state="failure" data-testid="failure-banner">
          {failureLabel}
        </li>
      )}
    </ol>
  );
}
