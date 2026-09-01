import { describe, it, expect } from "vitest";
import request from "supertest";
import http from "node:http";
import { createApp, FAILING_CARD_NUMBER, LOW_STOCK_PRODUCT_ID } from "./server.mjs";

// SSE는 연결을 계속 열어두는 스트림이라 supertest의 "응답 끝날 때까지 기다리기" 방식으로는
// 테스트하기 어렵다. 실제 포트에 잠깐 붙었다가 정해진 시간 뒤 연결을 끊고,
// 그동안 받은 원시 텍스트를 그대로 돌려주는 헬퍼로 검증한다.
function collectSSE(app, path, headers, durationMs) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const req = http.get({ port, path, headers }, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        setTimeout(() => {
          req.destroy();
          server.close();
          resolve(data);
        }, durationMs);
      });
    });
  });
}

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

describe("SSE reconnection (Last-Event-ID replay)", () => {
  it("replays events missed while disconnected, on /sse/orders/:orderId", async () => {
    const app = createApp({ stepDelayMs: 30 });
    const created = await request(app)
      .post("/orders")
      .send({ items: [{ product_id: "p1", quantity: 1 }], card_number: "4111111111111111" });
    const orderId = created.body.order_id;

    // 사가가 진행되는 동안 잠깐 붙어서 이벤트 몇 개만 받고 끊는다 (재연결 시나리오 흉내).
    const firstChunk = await collectSSE(app, `/sse/orders/${orderId}`, {}, 40);
    const firstIds = [...firstChunk.matchAll(/^id: (\d+)$/gm)].map((m) => m[1]);
    expect(firstIds.length).toBeGreaterThan(0);
    const lastSeenId = firstIds[firstIds.length - 1];

    // 사가가 완전히 끝날 때까지 기다린 뒤, Last-Event-ID를 실어 재연결한다.
    // 이 시점엔 새로 발생하는 이벤트가 없으므로, 뭔가 받는다면 그건 리플레이가 동작한다는 뜻이다.
    await new Promise((resolve) => setTimeout(resolve, 200));
    const replayChunk = await collectSSE(
      app,
      `/sse/orders/${orderId}`,
      { "Last-Event-ID": lastSeenId },
      40
    );

    expect(replayChunk.length).toBeGreaterThan(0);
    expect(replayChunk).not.toContain(`id: ${lastSeenId}\n`); // 이미 받은 것 자체는 다시 안 옴
  });
});

describe("GET /ops/summary", () => {
  it("returns zeroed counters when no orders exist", async () => {
    const app = createApp({ stepDelayMs: 10 });
    const res = await request(app).get("/ops/summary");
    expect(res.body).toEqual({ total_orders: 0, retrying_count: 0, dlq_count: 0, success_rate: 0 });
  });

  it("reflects a completed order", async () => {
    const app = createApp({ stepDelayMs: 10 });
    await request(app)
      .post("/orders")
      .send({ items: [{ product_id: "p1", quantity: 1 }], card_number: "4111111111111111" });

    await new Promise((resolve) => setTimeout(resolve, 200));

    const res = await request(app).get("/ops/summary");
    expect(res.body).toEqual({ total_orders: 1, retrying_count: 0, dlq_count: 0, success_rate: 1 });
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
