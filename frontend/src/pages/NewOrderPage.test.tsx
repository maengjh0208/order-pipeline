import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NewOrderPage } from "./NewOrderPage";
import * as api from "../lib/api";

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("NewOrderPage", () => {
  it("lists fetched products as options, including their demo note", async () => {
    vi.spyOn(api, "fetchProducts").mockResolvedValue([
      { product_id: "p2", product_name: "한정판 스니커즈", stock: 1, demo_note: "재고 1개" } as never,
    ]);

    renderWithProviders(<NewOrderPage />);

    expect(await screen.findByText(/한정판 스니커즈/)).toBeInTheDocument();
    expect(screen.getByText(/재고 1개/)).toBeInTheDocument();
  });

  it("submits the selected product and card number via createOrder", async () => {
    vi.spyOn(api, "fetchProducts").mockResolvedValue([
      { product_id: "p1", product_name: "무선 이어폰", stock: 10, demo_note: null } as never,
    ]);
    const createOrderSpy = vi
      .spyOn(api, "createOrder")
      .mockResolvedValue({ order_id: "o1", current_status: "CREATED" } as never);

    renderWithProviders(<NewOrderPage />);

    await screen.findByText(/무선 이어폰/);
    await userEvent.selectOptions(screen.getByLabelText("상품"), "p1");
    await userEvent.type(screen.getByLabelText("카드번호"), "4111111111111111");
    await userEvent.click(screen.getByRole("button", { name: "주문하기" }));

    // mutationFn은 실제 인자 외에 tanstack-query 내부 컨텍스트 객체를 두 번째 인자로 같이 받는다 (v5.101+).
    // 라이브러리 내부 구현 세부사항에 테스트가 얽매이지 않도록 두 번째 인자는 느슨하게 확인한다.
    expect(createOrderSpy).toHaveBeenCalledWith(
      {
        items: [{ product_id: "p1", quantity: 1 }],
        card_number: "4111111111111111",
      },
      expect.anything()
    );
  });
});
