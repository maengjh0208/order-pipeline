import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "./server.mjs";

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
