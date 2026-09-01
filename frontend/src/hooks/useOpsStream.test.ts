import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useOpsStream } from "./useOpsStream";
import { MockEventSource } from "../test-utils/mockEventSource";
import type { OpsSummary, SagaEvent } from "../types/order";

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeEvent(overrides: Partial<SagaEvent>): SagaEvent {
  return {
    event_id: "1",
    order_id: "o1",
    saga_step: "PAYMENT",
    from_status: "PAYMENT_PROCESSING",
    to_status: "PAID",
    attempt: 0,
    max_attempts: 3,
    reason: null,
    occurred_at: "2026-08-18T00:00:00Z",
    ...overrides,
  };
}

const emptySummary: OpsSummary = { total_orders: 0, retrying_count: 0, dlq_count: 0, success_rate: 0 };

describe("useOpsStream", () => {
  it("counts a new order_id exactly once toward total_orders", () => {
    const { result } = renderHook(() => useOpsStream(emptySummary));
    const source = MockEventSource.instances[0];

    act(() => {
      source.emit(makeEvent({ order_id: "o1", to_status: "INVENTORY_RESERVING" }));
      source.emit(makeEvent({ order_id: "o1", to_status: "COMPLETED" }));
    });

    expect(result.current.summary.total_orders).toBe(1);
    expect(result.current.summary.success_rate).toBe(1);
  });

  it("tracks retrying_count across RETRYING_PAYMENT transitions", () => {
    const { result } = renderHook(() => useOpsStream(emptySummary));
    const source = MockEventSource.instances[0];

    act(() => {
      source.emit(makeEvent({ order_id: "o2", from_status: "PAYMENT_PROCESSING", to_status: "RETRYING_PAYMENT" }));
    });
    expect(result.current.summary.retrying_count).toBe(1);

    act(() => {
      source.emit(makeEvent({ order_id: "o2", from_status: "RETRYING_PAYMENT", to_status: "PAYMENT_FAILED_DLQ" }));
    });
    expect(result.current.summary.retrying_count).toBe(0);
    expect(result.current.summary.dlq_count).toBe(1);
  });

  it("appends every received event to the events list", () => {
    const { result } = renderHook(() => useOpsStream(emptySummary));
    const source = MockEventSource.instances[0];

    act(() => {
      source.emit(makeEvent({ event_id: "1" }));
      source.emit(makeEvent({ event_id: "2" }));
    });

    expect(result.current.events).toHaveLength(2);
  });

  it("adopts initialSummary once it arrives after mount, before any SSE event", async () => {
    const { result, rerender } = renderHook(({ initialSummary }) => useOpsStream(initialSummary), {
      initialProps: { initialSummary: emptySummary },
    });

    const hydrated: OpsSummary = { total_orders: 5, retrying_count: 1, dlq_count: 2, success_rate: 0.6 };
    rerender({ initialSummary: hydrated });

    await waitFor(() => expect(result.current.summary).toEqual(hydrated));
  });

  it("does not let a late initialSummary override counts already advanced by SSE", () => {
    const { result, rerender } = renderHook(({ initialSummary }) => useOpsStream(initialSummary), {
      initialProps: { initialSummary: emptySummary },
    });
    const source = MockEventSource.instances[0];

    act(() => {
      source.emit(makeEvent({ order_id: "o1", to_status: "COMPLETED" }));
    });
    expect(result.current.summary.total_orders).toBe(1);

    rerender({ initialSummary: { total_orders: 999, retrying_count: 0, dlq_count: 0, success_rate: 0 } });

    expect(result.current.summary.total_orders).toBe(1);
  });
});
