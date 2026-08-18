import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOrderStream } from "./useOrderStream";
import { MockEventSource } from "../test-utils/mockEventSource";

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useOrderStream", () => {
  it("connects to /sse/orders/:orderId", () => {
    renderHook(() => useOrderStream("o1", "CREATED"));
    expect(MockEventSource.instances[0].url).toContain("/sse/orders/o1");
  });

  it("does not connect when orderId is empty", () => {
    renderHook(() => useOrderStream("", null));
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("updates status when a saga event arrives", () => {
    const { result } = renderHook(() => useOrderStream("o1", "CREATED"));
    const source = MockEventSource.instances[0];

    act(() => {
      source.emit({
        event_id: "1",
        order_id: "o1",
        saga_step: "INVENTORY",
        from_status: "CREATED",
        to_status: "INVENTORY_RESERVING",
        attempt: 0,
        max_attempts: 0,
        reason: null,
        occurred_at: "2026-08-18T00:00:00Z",
      });
    });

    expect(result.current.status).toBe("INVENTORY_RESERVING");
  });

  it("closes the EventSource on unmount", () => {
    const { unmount } = renderHook(() => useOrderStream("o1", "CREATED"));
    const source = MockEventSource.instances[0];
    unmount();
    expect(source.closed).toBe(true);
  });
});
