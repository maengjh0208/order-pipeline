import express from "express";
import { randomUUID } from "node:crypto";

export const FAILING_CARD_NUMBER = "4000000000000002";
export const LOW_STOCK_PRODUCT_ID = "p2";

const SEED_PRODUCTS = [
  { product_id: "p1", product_name: "무선 이어폰", stock: 50, demo_note: null },
  {
    product_id: LOW_STOCK_PRODUCT_ID,
    product_name: "한정판 스니커즈",
    stock: 1,
    demo_note: "재고 1개 — 두 번째 주문부터 품절 시연",
  },
];

export function createApp({ stepDelayMs = 500 } = {}) {
  const app = express();

  // The frontend (localhost:5173) and this mock server (localhost:4000) are
  // different origins, so the browser blocks fetch()/EventSource unless the
  // response says the origin is allowed. A real orchestrator needs this too.
  app.use((req, res, next) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json());

  const products = SEED_PRODUCTS.map((p) => ({ ...p }));
  const orders = new Map();
  const orderSubscribers = new Map(); // order_id -> Set<res>
  const opsSubscribers = new Set(); // /sse/ops 구독자 (전체 이벤트를 필터링 없이 흘려보냄)
  const eventLog = []; // 지금까지 발생한 전체 이벤트 — 재연결 시 Last-Event-ID 리플레이용
  let nextEventId = 1;

  function findProduct(productId) {
    return products.find((p) => p.product_id === productId);
  }

  function recordEvent(order, sagaStep, fromStatus, toStatus, attempt, maxAttempts, reason) {
    const event = {
      event_id: String(nextEventId++),
      order_id: order.order_id,
      saga_step: sagaStep,
      from_status: fromStatus,
      to_status: toStatus,
      attempt,
      max_attempts: maxAttempts,
      reason,
      occurred_at: new Date().toISOString(),
    };
    order.current_status = toStatus;
    order.updated_at = event.occurred_at;
    order.history.push({
      from_status: fromStatus,
      to_status: toStatus,
      occurred_at: event.occurred_at,
      reason,
      attempt,
    });

    eventLog.push(event);

    const subs = orderSubscribers.get(order.order_id);
    if (subs) for (const res of subs) sendEvent(res, event);
    for (const res of opsSubscribers) sendEvent(res, event);
  }

  function sendEvent(res, event) {
    res.write(`id: ${event.event_id}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  // 브라우저의 EventSource는 재연결할 때 마지막으로 받은 이벤트 id를 Last-Event-ID
  // 헤더에 자동으로 실어 보낸다 (별도 프론트 코드 없이 네이티브로 동작). 서버는 그 id
  // 이후에 발생한 이벤트만 골라 즉시 다시 보내주면, 끊긴 동안의 공백이 메워진다.
  function replayFrom(lastEventId) {
    if (!lastEventId) return [];
    const index = eventLog.findIndex((e) => e.event_id === lastEventId);
    if (index === -1) return [];
    return eventLog.slice(index + 1);
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function runSaga(order) {
    // 1. 재고 확인
    recordEvent(order, "INVENTORY", "CREATED", "INVENTORY_RESERVING", 0, 0, null);
    await delay(stepDelayMs);

    const item = order.items[0];
    const product = findProduct(item.product_id);
    if (product.stock < item.quantity) {
      recordEvent(order, "INVENTORY", "INVENTORY_RESERVING", "INVENTORY_FAILED", 0, 0, "out_of_stock");
      // INVENTORY_FAILED 배너("재고가 부족합니다")가 화면에 그려질 시간을 주고 나서 최종 취소로 넘어간다.
      // delay 없이 바로 이어지면 SSE 이벤트 두 개가 거의 동시에 도착해 배너가 안 보이고 CANCELLED로 건너뛰어 보인다.
      await delay(stepDelayMs);
      recordEvent(order, "INVENTORY", "INVENTORY_FAILED", "CANCELLED", 0, 0, "out_of_stock");
      return;
    }
    product.stock -= item.quantity;
    recordEvent(order, "INVENTORY", "INVENTORY_RESERVING", "INVENTORY_RESERVED", 0, 0, null);
    recordEvent(order, "INVENTORY", "INVENTORY_RESERVED", "PAYMENT_PROCESSING", 0, 0, null);

    // 2. 결제 (최대 3회 시도)
    const maxAttempts = 3;
    let fromStatus = "PAYMENT_PROCESSING";
    let paid = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await delay(stepDelayMs);
      const shouldFail = order.card_number === FAILING_CARD_NUMBER || Math.random() < 0.1;

      if (!shouldFail) {
        recordEvent(order, "PAYMENT", fromStatus, "PAID", attempt, maxAttempts, null);
        paid = true;
        break;
      }

      recordEvent(order, "PAYMENT", fromStatus, "PAYMENT_FAILED", attempt, maxAttempts, "insufficient_funds");

      if (attempt < maxAttempts) {
        recordEvent(order, "PAYMENT", "PAYMENT_FAILED", "RETRYING_PAYMENT", attempt, maxAttempts, "insufficient_funds");
        fromStatus = "RETRYING_PAYMENT";
      } else {
        recordEvent(order, "PAYMENT", "PAYMENT_FAILED", "PAYMENT_FAILED_DLQ", attempt, maxAttempts, "insufficient_funds");
      }
    }

    if (!paid) {
      recordEvent(order, "PAYMENT", "PAYMENT_FAILED_DLQ", "COMPENSATING_INVENTORY", maxAttempts, maxAttempts, "insufficient_funds");
      await delay(stepDelayMs);
      // 보상 트랜잭션: 실제 백엔드의 commands.inventory(action=RELEASE)에 해당 — 예약해뒀던 재고를 되돌린다.
      product.stock += item.quantity;
      recordEvent(order, "INVENTORY", "COMPENSATING_INVENTORY", "CANCELLED", 0, 0, "insufficient_funds");
      return;
    }

    // 3. 알림
    await delay(stepDelayMs);
    recordEvent(order, "NOTIFICATION", "PAID", "NOTIFYING", 0, 0, null);
    await delay(stepDelayMs);
    recordEvent(order, "NOTIFICATION", "NOTIFYING", "COMPLETED", 0, 0, null);
  }

  app.get("/products", (req, res) => {
    res.json(products);
  });

  app.post("/orders", (req, res) => {
    const { items, card_number } = req.body;
    const now = new Date().toISOString();
    const order = {
      order_id: randomUUID(),
      current_status: "CREATED",
      created_at: now,
      updated_at: now,
      items: items.map((i) => ({
        product_id: i.product_id,
        product_name: findProduct(i.product_id)?.product_name ?? i.product_id,
        quantity: i.quantity,
      })),
      card_number,
      history: [],
    };
    orders.set(order.order_id, order);
    res.status(201).json(order);
    runSaga(order);
  });

  app.get("/orders", (req, res) => {
    res.json([...orders.values()]);
  });

  app.get("/orders/:id", (req, res) => {
    const order = orders.get(req.params.id);
    if (!order) return res.status(404).json({ error: "order not found" });
    res.json(order);
  });

  app.get("/ops/summary", (req, res) => {
    const all = [...orders.values()];
    const completed = all.filter((o) => o.current_status === "COMPLETED").length;
    const cancelled = all.filter((o) => o.current_status === "CANCELLED").length;
    const finished = completed + cancelled;
    res.json({
      total_orders: all.length,
      retrying_count: all.filter((o) => o.current_status === "RETRYING_PAYMENT").length,
      dlq_count: all.filter((o) => o.history.some((h) => h.to_status === "PAYMENT_FAILED_DLQ")).length,
      success_rate: finished > 0 ? completed / finished : 0,
    });
  });

  app.get("/sse/orders/:orderId", (req, res) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();

    const orderId = req.params.orderId;
    const missed = replayFrom(req.get("Last-Event-ID")).filter((e) => e.order_id === orderId);
    for (const event of missed) sendEvent(res, event);

    if (!orderSubscribers.has(orderId)) orderSubscribers.set(orderId, new Set());
    orderSubscribers.get(orderId).add(res);

    req.on("close", () => {
      orderSubscribers.get(orderId)?.delete(res);
    });
  });

  app.get("/sse/ops", (req, res) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();

    for (const event of replayFrom(req.get("Last-Event-ID"))) sendEvent(res, event);

    opsSubscribers.add(res);
    req.on("close", () => {
      opsSubscribers.delete(res);
    });
  });

  return app;
}
