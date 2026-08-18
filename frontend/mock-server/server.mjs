import express from "express";
import { randomUUID } from "node:crypto";

export function createApp({ stepDelayMs = 500 } = {}) {
  const app = express();
  app.use(express.json());

  const orders = new Map();
  const orderSubscribers = new Map(); // order_id -> Set<res>
  let nextEventId = 1;

  function recordEvent(order, sagaStep, fromStatus, toStatus) {
    const event = {
      event_id: String(nextEventId++),
      order_id: order.order_id,
      saga_step: sagaStep,
      from_status: fromStatus,
      to_status: toStatus,
      attempt: 0,
      max_attempts: 0,
      reason: null,
      occurred_at: new Date().toISOString(),
    };
    order.current_status = toStatus;
    order.updated_at = event.occurred_at;
    order.history.push({
      from_status: fromStatus,
      to_status: toStatus,
      occurred_at: event.occurred_at,
      reason: null,
      attempt: 0,
    });

    const subs = orderSubscribers.get(order.order_id);
    if (subs) {
      for (const res of subs) {
        res.write(`id: ${event.event_id}\n`);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    }
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function runSaga(order) {
    recordEvent(order, "INVENTORY", "CREATED", "INVENTORY_RESERVING");
    await delay(stepDelayMs);

    recordEvent(order, "INVENTORY", "INVENTORY_RESERVING", "INVENTORY_RESERVED");
    recordEvent(order, "INVENTORY", "INVENTORY_RESERVED", "PAYMENT_PROCESSING");
    await delay(stepDelayMs);

    recordEvent(order, "PAYMENT", "PAYMENT_PROCESSING", "PAID");
    await delay(stepDelayMs);

    recordEvent(order, "NOTIFICATION", "PAID", "NOTIFYING");
    await delay(stepDelayMs);

    recordEvent(order, "NOTIFICATION", "NOTIFYING", "COMPLETED");
  }

  app.post("/orders", (req, res) => {
    const { items, card_number } = req.body;
    const now = new Date().toISOString();
    const order = {
      order_id: randomUUID(),
      current_status: "CREATED",
      created_at: now,
      updated_at: now,
      items,
      card_number,
      history: [],
    };
    orders.set(order.order_id, order);
    res.status(201).json(order);
    runSaga(order);
  });

  app.get("/orders/:id", (req, res) => {
    const order = orders.get(req.params.id);
    if (!order) return res.status(404).json({ error: "order not found" });
    res.json(order);
  });

  app.get("/sse/orders/:orderId", (req, res) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();

    const orderId = req.params.orderId;
    if (!orderSubscribers.has(orderId)) orderSubscribers.set(orderId, new Set());
    orderSubscribers.get(orderId).add(res);

    req.on("close", () => {
      orderSubscribers.get(orderId)?.delete(res);
    });
  });

  return app;
}
