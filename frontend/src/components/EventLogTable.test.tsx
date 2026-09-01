import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EventLogTable } from "./EventLogTable";
import type { SagaEvent } from "../types/order";

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

describe("EventLogTable", () => {
  it("renders one row per event, most recent first", () => {
    render(
      <EventLogTable
        events={[makeEvent({ event_id: "1", order_id: "o1" }), makeEvent({ event_id: "2", order_id: "o2" })]}
      />
    );
    const rows = screen.getAllByRole("row").slice(1); // skip header row
    expect(rows[0]).toHaveTextContent("o2");
    expect(rows[1]).toHaveTextContent("o1");
  });

  it("renders an empty table with no rows when there are no events", () => {
    render(<EventLogTable events={[]} />);
    expect(screen.getAllByRole("row")).toHaveLength(1); // header only
  });
});
