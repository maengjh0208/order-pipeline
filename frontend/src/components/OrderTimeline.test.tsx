import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrderTimeline } from "./OrderTimeline";

describe("OrderTimeline", () => {
  it("marks earlier steps done and the current step active", () => {
    render(<OrderTimeline currentStatus="PAYMENT_PROCESSING" />);
    expect(screen.getByText("주문 생성")).toHaveAttribute("data-state", "done");
    expect(screen.getByText("결제 처리")).toHaveAttribute("data-state", "active");
    expect(screen.getByText("완료")).toHaveAttribute("data-state", "pending");
  });

  it("shows a failure banner for RETRYING_PAYMENT", () => {
    render(<OrderTimeline currentStatus="RETRYING_PAYMENT" />);
    expect(screen.getByTestId("failure-banner")).toHaveTextContent("결제 재시도 중");
  });

  it("shows a failure banner for CANCELLED", () => {
    render(<OrderTimeline currentStatus="CANCELLED" />);
    expect(screen.getByTestId("failure-banner")).toHaveTextContent("주문이 취소되었습니다");
  });

  it("shows a failure banner for COMPENSATING_INVENTORY without leaking internal saga terms", () => {
    render(<OrderTimeline currentStatus="COMPENSATING_INVENTORY" />);
    expect(screen.getByTestId("failure-banner")).toHaveTextContent("주문을 취소 처리하고 있습니다");
  });

  it("shows no failure banner for the transient PAYMENT_FAILED state", () => {
    render(<OrderTimeline currentStatus="PAYMENT_FAILED" />);
    expect(screen.queryByTestId("failure-banner")).not.toBeInTheDocument();
  });

  it("does not regress progress for pass-through statuses not in STEPS", () => {
    render(<OrderTimeline currentStatus="INVENTORY_RESERVED" />);
    expect(screen.getByText("주문 생성")).toHaveAttribute("data-state", "done");
    expect(screen.getByText("재고 확인")).toHaveAttribute("data-state", "active");
    expect(screen.getByText("결제 처리")).toHaveAttribute("data-state", "pending");
  });

  it("marks every step done except 완료 when CANCELLED", () => {
    render(<OrderTimeline currentStatus="CANCELLED" />);
    expect(screen.getByText("주문 생성")).toHaveAttribute("data-state", "done");
    expect(screen.getByText("결제 처리")).toHaveAttribute("data-state", "done");
    expect(screen.getByText("완료")).toHaveAttribute("data-state", "pending");
  });
});
