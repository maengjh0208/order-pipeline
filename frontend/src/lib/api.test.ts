import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchOrder, createOrder, fetchProducts } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchOrder", () => {
  it("returns the parsed order on success", async () => {
    const mockOrder = { order_id: "o1", current_status: "CREATED" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => mockOrder }));

    const result = await fetchOrder("o1");

    expect(result).toEqual(mockOrder);
  });

  it("throws with the status code when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(fetchOrder("missing")).rejects.toThrow("404");
  });
});

describe("createOrder", () => {
  it("POSTs items and card_number and returns the created order", async () => {
    const mockOrder = { order_id: "o2", current_status: "CREATED" };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => mockOrder });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createOrder({ items: [{ product_id: "p1", quantity: 1 }], card_number: "4111" });

    expect(result).toEqual(mockOrder);
    const [, options] = fetchMock.mock.calls[0];
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({
      items: [{ product_id: "p1", quantity: 1 }],
      card_number: "4111",
    });
  });
});

describe("fetchProducts", () => {
  it("returns the product list", async () => {
    const mockProducts = [{ product_id: "p1", product_name: "이어폰", stock: 10, demo_note: null }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => mockProducts }));

    const result = await fetchProducts();

    expect(result).toEqual(mockProducts);
  });
});
