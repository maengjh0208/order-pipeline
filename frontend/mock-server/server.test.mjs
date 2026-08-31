import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp, FAILING_CARD_NUMBER, LOW_STOCK_PRODUCT_ID } from "./server.mjs";

describe("POST /orders", () => {
  it("creates an order in CREATED status", async () => {
    const app = createApp({ stepDelayMs: 10 });
    const res = await request(app)
      .post("/orders")
      .send({ items: [{ product_id: "p1", quantity: 1 }], card_number: "4111111111111111" });

    expect(res.status).toBe(201);
    expect(res.body.current_status).toBe("CREATED");
    expect(res.body.order_id).toBeTruthy();
  });

  it("eventually reaches COMPLETED", async () => {
    const app = createApp({ stepDelayMs: 10 });
    const created = await request(app)
      .post("/orders")
      .send({ items: [{ product_id: "p1", quantity: 1 }], card_number: "4111111111111111" });

    // stepDelayMs=10 means the whole saga (5 transitions) finishes well within 200ms.
    await new Promise((resolve) => setTimeout(resolve, 200));

    const res = await request(app).get(`/orders/${created.body.order_id}`);
    expect(res.body.current_status).toBe("COMPLETED");
  });

  it("reaches CANCELLED via INVENTORY_FAILED when stock is exhausted", async () => {
    const app = createApp({ stepDelayMs: 10 });
    // LOW_STOCK_PRODUCT_ID is seeded with stock 1: first order consumes it, second fails.
    await request(app)
      .post("/orders")
      .send({ items: [{ product_id: LOW_STOCK_PRODUCT_ID, quantity: 1 }], card_number: "4111111111111111" });
    const second = await request(app)
      .post("/orders")
      .send({ items: [{ product_id: LOW_STOCK_PRODUCT_ID, quantity: 1 }], card_number: "4111111111111111" });

    await new Promise((resolve) => setTimeout(resolve, 200));

    const res = await request(app).get(`/orders/${second.body.order_id}`);
    expect(res.body.current_status).toBe("CANCELLED");
    expect(res.body.history.some((h) => h.to_status === "INVENTORY_FAILED")).toBe(true);
  });

  it("reaches PAYMENT_FAILED_DLQ then CANCELLED for the failing demo card, retrying twice first", async () => {
    const app = createApp({ stepDelayMs: 10 });
    const created = await request(app)
      .post("/orders")
      .send({ items: [{ product_id: "p1", quantity: 1 }], card_number: FAILING_CARD_NUMBER });

    await new Promise((resolve) => setTimeout(resolve, 400));

    const res = await request(app).get(`/orders/${created.body.order_id}`);
    expect(res.body.current_status).toBe("CANCELLED");
    expect(res.body.history.some((h) => h.to_status === "PAYMENT_FAILED_DLQ")).toBe(true);
    expect(res.body.history.some((h) => h.to_status === "COMPENSATING_INVENTORY")).toBe(true);
    const retryEntries = res.body.history.filter((h) => h.to_status === "RETRYING_PAYMENT");
    expect(retryEntries).toHaveLength(2); // attempt 1/3, 2/3 (3/3 goes straight to DLQ)
  });

  it("restores stock after a payment-failure cancellation (compensating transaction)", async () => {
    const app = createApp({ stepDelayMs: 10 });
    const before = (await request(app).get("/products")).body.find(
      (p) => p.product_id === LOW_STOCK_PRODUCT_ID
    );

    await request(app)
      .post("/orders")
      .send({ items: [{ product_id: LOW_STOCK_PRODUCT_ID, quantity: 1 }], card_number: FAILING_CARD_NUMBER });

    await new Promise((resolve) => setTimeout(resolve, 400));

    const after = (await request(app).get("/products")).body.find(
      (p) => p.product_id === LOW_STOCK_PRODUCT_ID
    );
    expect(after.stock).toBe(before.stock);
  });
});

describe("GET /products", () => {
  it("returns the seeded product list", async () => {
    const app = createApp({ stepDelayMs: 10 });
    const res = await request(app).get("/products");

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty("product_id");
    expect(res.body[0]).toHaveProperty("product_name");
    expect(res.body[0]).toHaveProperty("stock");
  });
});

describe("GET /orders", () => {
  it("returns previously created orders", async () => {
    const app = createApp({ stepDelayMs: 10 });
    const created = await request(app)
      .post("/orders")
      .send({ items: [{ product_id: "p1", quantity: 1 }], card_number: "4111111111111111" });

    const res = await request(app).get("/orders");

    expect(res.status).toBe(200);
    expect(res.body.some((o) => o.order_id === created.body.order_id)).toBe(true);
  });
});

describe("CORS", () => {
  it("allows cross-origin requests from the Vite dev server", async () => {
    const app = createApp({ stepDelayMs: 10 });
    const res = await request(app).get("/orders/anything").set("Origin", "http://localhost:5173");
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });

  it("responds to a CORS preflight OPTIONS request", async () => {
    const app = createApp({ stepDelayMs: 10 });
    const res = await request(app)
      .options("/orders")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST");
    expect(res.status).toBe(204);
  });
});
