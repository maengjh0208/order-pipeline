import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OpsDashboardPage } from "./OpsDashboardPage";
import * as api from "../lib/api";
import { MockEventSource } from "../test-utils/mockEventSource";

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OpsDashboardPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("OpsDashboardPage", () => {
  it("shows the hydrated summary counts before any SSE event arrives", async () => {
    vi.spyOn(api, "fetchOpsSummary").mockResolvedValue({
      total_orders: 5,
      retrying_count: 1,
      dlq_count: 2,
      success_rate: 0.6,
    });

    renderPage();

    expect(await screen.findByText("5")).toBeInTheDocument();
  });

  it("adds a new row to the event log when an SSE event arrives", async () => {
    vi.spyOn(api, "fetchOpsSummary").mockResolvedValue({
      total_orders: 0,
      retrying_count: 0,
      dlq_count: 0,
      success_rate: 0,
    });

    renderPage();
    await screen.findByText("총 주문");

    const source = MockEventSource.instances[0];
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

    expect(await screen.findByText("o1")).toBeInTheDocument();
  });
});
