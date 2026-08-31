import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OrderListPage } from "./OrderListPage";
import * as api from "../lib/api";

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("OrderListPage", () => {
  it("renders each order's id and status once loaded", async () => {
    vi.spyOn(api, "fetchOrders").mockResolvedValue([
      { order_id: "o1", current_status: "COMPLETED" } as never,
    ]);

    renderWithProviders(<OrderListPage />);

    expect(await screen.findByText(/o1/)).toBeInTheDocument();
    expect(screen.getByText(/COMPLETED/)).toBeInTheDocument();
  });
});
