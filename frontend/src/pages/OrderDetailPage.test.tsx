import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OrderDetailPage } from "./OrderDetailPage";
import * as api from "../lib/api";
import { MockEventSource } from "../test-utils/mockEventSource";

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderAtOrder(orderId: string) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/orders/${orderId}`]}>
        <Routes>
          <Route path="/orders/:orderId" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("OrderDetailPage", () => {
  it("renders the timeline at the status fetched from the REST API", async () => {
    vi.spyOn(api, "fetchOrder").mockResolvedValue({
      order_id: "o1",
      current_status: "PAYMENT_PROCESSING",
    } as never);

    renderAtOrder("o1");

    expect(await screen.findByText("결제 처리")).toHaveAttribute("data-state", "active");
  });

  it("updates the timeline when an SSE event arrives", async () => {
    vi.spyOn(api, "fetchOrder").mockResolvedValue({
      order_id: "o1",
      current_status: "PAYMENT_PROCESSING",
    } as never);

    renderAtOrder("o1");
    await screen.findByText("결제 처리");

    const source = MockEventSource.instances[0];
    source.emit({
      event_id: "1",
      order_id: "o1",
      saga_step: "NOTIFICATION",
      from_status: "NOTIFYING",
      to_status: "COMPLETED",
      attempt: 0,
      max_attempts: 0,
      reason: null,
      occurred_at: "2026-08-18T00:00:00Z",
    });

    expect(await screen.findByText("완료")).toHaveAttribute("data-state", "active");
  });
});
