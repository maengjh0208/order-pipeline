# 주문 파이프라인 프론트엔드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이벤트 기반 주문 처리 시스템의 실시간 프론트엔드(고객용 주문 추적 + 운영용 장애 관찰 대시보드)를 구현한다.

**Architecture:** Vite + React + TypeScript SPA. REST(초기 조회)로 하이드레이션하고 SSE(`EventSource`)로 실시간 갱신하는 두 계층 구조. 실제 오케스트레이터가 없어도 개발/테스트가 가능하도록, 계약을 그대로 구현하는 경량 Node/Express mock 서버를 함께 만든다.

**Tech Stack:** React 18, TypeScript, Vite, react-router-dom, @tanstack/react-query, Vitest, @testing-library/react, Express(mock-server), supertest.

**Spec:** `docs/superpowers/specs/2026-08-18-order-pipeline-design.md`

## Global Constraints

- 프론트는 Kafka에 직접 접근하지 않고 오케스트레이터의 REST/SSE만 소비한다 (스펙 2절, 4절).
- SSE 이벤트 payload는 `event_id, order_id, saga_step, from_status, to_status, attempt, max_attempts, reason, occurred_at` 필드를 가진 고정 스키마다 (스펙 4절).
- 주문 상태값은 `CREATED, INVENTORY_RESERVING, INVENTORY_RESERVED, INVENTORY_FAILED, PAYMENT_PROCESSING, RETRYING_PAYMENT, PAYMENT_FAILED_DLQ, PAID, NOTIFYING, COMPLETED, CANCELLED` 11개로 고정한다 (스펙 3절).
- 전역 상태 라이브러리(Redux 등)는 쓰지 않는다. 서버 데이터는 TanStack Query, SSE 푸시는 React 기본 상태로 관리한다 (스펙 5절).
- 결제 실패 데모 트리거 카드번호는 `4000000000000002`, 재고부족 데모 상품은 재고 1개로 시드한다 (스펙 6절).
- 모든 사용자 대상 문자열(라벨, 버튼, 에러 메시지)은 한국어로 작성한다.

---

## 파일 구조

```
frontend/
  package.json, tsconfig.json, vite.config.ts, vitest.config.ts, index.html
  src/
    main.tsx                       # React 진입점
    App.tsx                        # 라우터 + QueryClientProvider
    types/
      order.ts                     # 공유 타입 + isTerminalStatus/isFailureStatus
      order.test.ts
    lib/
      api.ts                       # REST 클라이언트
      api.test.ts
    test-utils/
      mockEventSource.ts           # 훅 테스트용 EventSource 모킹 클래스
    hooks/
      useOrderStream.ts
      useOrderStream.test.ts
      useOpsStream.ts
      useOpsStream.test.ts
    components/
      OrderTimeline.tsx
      OrderTimeline.test.tsx
      EventLogTable.tsx
      EventLogTable.test.tsx
      MetricTile.tsx
      MetricTile.test.tsx
    pages/
      OrderListPage.tsx
      OrderListPage.test.tsx
      NewOrderPage.tsx
      NewOrderPage.test.tsx
      OrderDetailPage.tsx
      OrderDetailPage.test.tsx
      OpsDashboardPage.tsx
      OpsDashboardPage.test.tsx
  mock-server/
    package.json
    server.mjs                     # createApp() — Express 앱 팩토리
    server.test.mjs                # supertest 기반 계약 테스트
    index.mjs                      # createApp().listen(4000)
```

---

### Task 1: Vite 프로젝트 스캐폴딩

**Files:**
- Create: `frontend/` (Vite `react-ts` 템플릿 전체)

**Interfaces:**
- Produces: `frontend/` 디렉터리, `npm run dev`(포트 5173), `npm run build`, `npm run test` 스크립트 자리(다음 태스크에서 test 스크립트 추가)

- [ ] **Step 1: Vite 프로젝트 생성**

```bash
cd /Users/maengjuhui/workspace/order-pipeline
npm create vite@latest frontend -- --template react-ts
```

- [ ] **Step 2: 의존성 설치**

```bash
cd frontend
npm install
npm install react-router-dom @tanstack/react-query
```

- [ ] **Step 3: 개발 서버가 뜨는지 확인**

Run: `npm run dev -- --port 5173 &` 후 `curl -sf http://localhost:5173 > /dev/null && echo OK`
Expected: `OK` 출력. 확인 후 dev 서버 프로세스 종료.

- [ ] **Step 4: 빌드가 되는지 확인**

Run: `npm run build`
Expected: `dist/` 생성, 에러 없이 종료

- [ ] **Step 5: Commit**

```bash
cd /Users/maengjuhui/workspace/order-pipeline
git add frontend
git commit -m "chore: scaffold vite react-ts frontend project"
```

---

### Task 2: Vitest + React Testing Library 테스트 하네스

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/setupTests.ts`
- Test: `frontend/src/smoke.test.ts`

**Interfaces:**
- Produces: `npm run test` 스크립트, jsdom 환경, `@testing-library/jest-dom` 매처

- [ ] **Step 1: 테스트 의존성 설치**

```bash
cd frontend
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: vitest 설정 작성**

`frontend/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/setupTests.ts",
    globals: true,
  },
});
```

`frontend/src/setupTests.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: package.json에 test 스크립트 추가**

`frontend/package.json`의 `scripts`에 추가:

```json
"test": "vitest run"
```

- [ ] **Step 4: 실패하는 스모크 테스트 작성**

`frontend/src/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("test harness", () => {
  it("adds numbers", () => {
    expect(1 + 1).toBe(3);
  });
});
```

- [ ] **Step 5: 실패 확인**

Run: `npm run test`
Expected: FAIL — `expected 2 to be 3`

- [ ] **Step 6: 테스트 값 수정**

`frontend/src/smoke.test.ts`의 `expect(1 + 1).toBe(3)` → `expect(1 + 1).toBe(2)`

- [ ] **Step 7: 통과 확인**

Run: `npm run test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/package.json frontend/vitest.config.ts frontend/src/setupTests.ts frontend/src/smoke.test.ts frontend/package-lock.json
git commit -m "test: set up vitest and react testing library harness"
```

---

### Task 3: 공유 타입 정의

**Files:**
- Create: `frontend/src/types/order.ts`
- Test: `frontend/src/types/order.test.ts`

**Interfaces:**
- Produces:
  - `type OrderStatus` (11개 값, Global Constraints 참고)
  - `type SagaStep = "INVENTORY" | "PAYMENT" | "NOTIFICATION"`
  - `interface SagaEvent { event_id, order_id, saga_step, from_status, to_status, attempt, max_attempts, reason, occurred_at }`
  - `interface OrderItem { product_id: string; product_name: string; quantity: number }`
  - `interface OrderHistoryEntry { from_status, to_status, occurred_at, reason, attempt }`
  - `interface Order { order_id, current_status, created_at, updated_at, items, card_number, history }`
  - `interface OpsSummary { total_orders, retrying_count, dlq_count, success_rate }`
  - `function isTerminalStatus(status: OrderStatus): boolean`
  - `function isFailureStatus(status: OrderStatus): boolean`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/types/order.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isTerminalStatus, isFailureStatus } from "./order";

describe("isTerminalStatus", () => {
  it("returns true for COMPLETED", () => {
    expect(isTerminalStatus("COMPLETED")).toBe(true);
  });

  it("returns true for CANCELLED", () => {
    expect(isTerminalStatus("CANCELLED")).toBe(true);
  });

  it("returns false for PAYMENT_PROCESSING", () => {
    expect(isTerminalStatus("PAYMENT_PROCESSING")).toBe(false);
  });
});

describe("isFailureStatus", () => {
  it("returns true for CANCELLED", () => {
    expect(isFailureStatus("CANCELLED")).toBe(true);
  });

  it("returns true for PAYMENT_FAILED_DLQ", () => {
    expect(isFailureStatus("PAYMENT_FAILED_DLQ")).toBe(true);
  });

  it("returns false for COMPLETED", () => {
    expect(isFailureStatus("COMPLETED")).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -- order.test.ts`
Expected: FAIL — `Cannot find module './order'`

- [ ] **Step 3: 타입과 구현 작성**

`frontend/src/types/order.ts`:

```ts
export type OrderStatus =
  | "CREATED"
  | "INVENTORY_RESERVING"
  | "INVENTORY_RESERVED"
  | "INVENTORY_FAILED"
  | "PAYMENT_PROCESSING"
  | "RETRYING_PAYMENT"
  | "PAYMENT_FAILED_DLQ"
  | "PAID"
  | "NOTIFYING"
  | "COMPLETED"
  | "CANCELLED";

export type SagaStep = "INVENTORY" | "PAYMENT" | "NOTIFICATION";

export interface SagaEvent {
  event_id: string;
  order_id: string;
  saga_step: SagaStep;
  from_status: OrderStatus;
  to_status: OrderStatus;
  attempt: number;
  max_attempts: number;
  reason: string | null;
  occurred_at: string;
}

export interface OrderItem {
  product_id: string;
  product_name: string;
  quantity: number;
}

export interface OrderHistoryEntry {
  from_status: OrderStatus;
  to_status: OrderStatus;
  occurred_at: string;
  reason: string | null;
  attempt: number;
}

export interface Order {
  order_id: string;
  current_status: OrderStatus;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
  card_number: string;
  history: OrderHistoryEntry[];
}

export interface OpsSummary {
  total_orders: number;
  retrying_count: number;
  dlq_count: number;
  success_rate: number;
}

const TERMINAL_STATUSES: OrderStatus[] = ["COMPLETED", "CANCELLED"];
const FAILURE_STATUSES: OrderStatus[] = [
  "INVENTORY_FAILED",
  "PAYMENT_FAILED_DLQ",
  "CANCELLED",
];

export function isTerminalStatus(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function isFailureStatus(status: OrderStatus): boolean {
  return FAILURE_STATUSES.includes(status);
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test -- order.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types
git commit -m "feat: add shared order/saga event types"
```

---

### Task 4: Mock 서버 — REST + SSE + 사가 시뮬레이션

**Files:**
- Create: `frontend/mock-server/package.json`
- Create: `frontend/mock-server/server.mjs`
- Create: `frontend/mock-server/index.mjs`
- Test: `frontend/mock-server/server.test.mjs`

**Interfaces:**
- Produces:
  - `export function createApp({ stepDelayMs = 500 } = {}): express.Express` — 매 호출마다 인메모리 상태를 새로 초기화
  - `export const FAILING_CARD_NUMBER = "4000000000000002"`
  - `export const LOW_STOCK_PRODUCT_ID = "p2"`
  - REST: `GET /products`, `POST /orders`, `GET /orders`, `GET /orders/:id`, `GET /ops/summary`
  - SSE: `GET /sse/orders/:orderId`, `GET /sse/ops` (스펙 4절 payload 스키마, `Last-Event-ID` 리플레이 지원)

- [ ] **Step 1: mock-server package.json 및 의존성 설치**

```bash
cd /Users/maengjuhui/workspace/order-pipeline/frontend
mkdir -p mock-server
cat > mock-server/package.json <<'EOF'
{
  "name": "order-pipeline-mock-server",
  "type": "module",
  "scripts": {
    "start": "node index.mjs",
    "test": "vitest run"
  }
}
EOF
npm install --prefix mock-server express supertest
npm install -D --prefix mock-server vitest
```

- [ ] **Step 2: 실패하는 계약 테스트 작성**

`frontend/mock-server/server.test.mjs`:

```js
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp, FAILING_CARD_NUMBER, LOW_STOCK_PRODUCT_ID } from "./server.mjs";

describe("GET /products", () => {
  it("lists seeded products including the low-stock demo item", async () => {
    const app = createApp({ stepDelayMs: 10 });
    const res = await request(app).get("/products");
    expect(res.status).toBe(200);
    expect(res.body.some((p) => p.product_id === LOW_STOCK_PRODUCT_ID)).toBe(true);
  });
});

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

  it("eventually reaches COMPLETED for a normal card and in-stock product", async () => {
    const app = createApp({ stepDelayMs: 10 });
    const created = await request(app)
      .post("/orders")
      .send({ items: [{ product_id: "p1", quantity: 1 }], card_number: "4111111111111111" });

    await new Promise((resolve) => setTimeout(resolve, 200));

    const res = await request(app).get(`/orders/${created.body.order_id}`);
    expect(res.body.current_status).toBe("COMPLETED");
  });

  it("reaches CANCELLED via INVENTORY_FAILED when stock is exhausted", async () => {
    const app = createApp({ stepDelayMs: 10 });
    // p2 seeded with stock 1: first order consumes it, second order fails.
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

  it("reaches PAYMENT_FAILED_DLQ then CANCELLED for the failing demo card", async () => {
    const app = createApp({ stepDelayMs: 10 });
    const created = await request(app)
      .post("/orders")
      .send({ items: [{ product_id: "p1", quantity: 1 }], card_number: FAILING_CARD_NUMBER });

    await new Promise((resolve) => setTimeout(resolve, 400));

    const res = await request(app).get(`/orders/${created.body.order_id}`);
    expect(res.body.current_status).toBe("CANCELLED");
    expect(res.body.history.some((h) => h.to_status === "PAYMENT_FAILED_DLQ")).toBe(true);
    const retryEntries = res.body.history.filter((h) => h.to_status === "RETRYING_PAYMENT");
    expect(retryEntries).toHaveLength(2); // attempt 1/3, 2/3 (3/3 goes straight to DLQ)
  });
});

describe("GET /ops/summary", () => {
  it("returns zeroed counters when no orders exist", async () => {
    const app = createApp({ stepDelayMs: 10 });
    const res = await request(app).get("/ops/summary");
    expect(res.body).toEqual({ total_orders: 0, retrying_count: 0, dlq_count: 0, success_rate: 0 });
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `cd frontend/mock-server && npx vitest run`
Expected: FAIL — `Cannot find module './server.mjs'`

- [ ] **Step 4: 서버 구현 작성**

`frontend/mock-server/server.mjs`:

```js
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
  app.use(express.json());

  const products = SEED_PRODUCTS.map((p) => ({ ...p }));
  const orders = new Map();
  const eventLog = []; // 전체 사가 이벤트, /sse/ops 리플레이용
  const orderSubscribers = new Map(); // order_id -> Set<res>
  const opsSubscribers = new Set();
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

    return event;
  }

  function sendEvent(res, event) {
    res.write(`id: ${event.event_id}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
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

      if (attempt < maxAttempts) {
        recordEvent(order, "PAYMENT", fromStatus, "RETRYING_PAYMENT", attempt, maxAttempts, "insufficient_funds");
        fromStatus = "RETRYING_PAYMENT";
      } else {
        recordEvent(order, "PAYMENT", fromStatus, "PAYMENT_FAILED_DLQ", attempt, maxAttempts, "insufficient_funds");
      }
    }

    if (!paid) {
      recordEvent(order, "PAYMENT", "PAYMENT_FAILED_DLQ", "CANCELLED", maxAttempts, maxAttempts, "insufficient_funds");
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
    res.json(Array.from(orders.values()));
  });

  app.get("/orders/:id", (req, res) => {
    const order = orders.get(req.params.id);
    if (!order) return res.status(404).json({ error: "order not found" });
    res.json(order);
  });

  app.get("/ops/summary", (req, res) => {
    const all = Array.from(orders.values());
    const completed = all.filter((o) => o.current_status === "COMPLETED").length;
    const cancelled = all.filter((o) => o.current_status === "CANCELLED").length;
    const finished = completed + cancelled;
    res.json({
      total_orders: all.length,
      retrying_count: all.filter((o) => o.current_status === "RETRYING_PAYMENT").length,
      dlq_count: all.filter((o) =>
        o.history.some((h) => h.to_status === "PAYMENT_FAILED_DLQ")
      ).length,
      success_rate: finished > 0 ? completed / finished : 0,
    });
  });

  app.get("/sse/orders/:orderId", (req, res) => {
    res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.flushHeaders();

    const orderId = req.params.orderId;
    const lastEventId = req.get("Last-Event-ID");
    const missed = replayFrom(lastEventId).filter((e) => e.order_id === orderId);
    for (const event of missed) sendEvent(res, event);

    if (!orderSubscribers.has(orderId)) orderSubscribers.set(orderId, new Set());
    orderSubscribers.get(orderId).add(res);

    req.on("close", () => {
      orderSubscribers.get(orderId)?.delete(res);
    });
  });

  app.get("/sse/ops", (req, res) => {
    res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.flushHeaders();

    const lastEventId = req.get("Last-Event-ID");
    for (const event of replayFrom(lastEventId)) sendEvent(res, event);

    opsSubscribers.add(res);
    req.on("close", () => {
      opsSubscribers.delete(res);
    });
  });

  function replayFrom(lastEventId) {
    if (!lastEventId) return [];
    const index = eventLog.findIndex((e) => e.event_id === lastEventId);
    if (index === -1) return [];
    return eventLog.slice(index + 1);
  }

  return app;
}
```

`frontend/mock-server/index.mjs`:

```js
import { createApp } from "./server.mjs";

const app = createApp();
const port = process.env.PORT ?? 4000;
app.listen(port, () => {
  console.log(`mock-server listening on http://localhost:${port}`);
});
```

- [ ] **Step 5: 통과 확인**

Run: `cd frontend/mock-server && npx vitest run`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
cd /Users/maengjuhui/workspace/order-pipeline
git add frontend/mock-server
git commit -m "feat: add mock backend server implementing the FE-BE contract"
```

---

### Task 5: REST 클라이언트 (`lib/api.ts`)

**Files:**
- Create: `frontend/src/lib/api.ts`
- Test: `frontend/src/lib/api.test.ts`

**Interfaces:**
- Consumes: `Order`, `OpsSummary` (Task 3, `../types/order`)
- Produces:
  - `interface Product { product_id: string; product_name: string; stock: number; demo_note: string | null }`
  - `interface CreateOrderInput { items: { product_id: string; quantity: number }[]; card_number: string }`
  - `function fetchProducts(): Promise<Product[]>`
  - `function fetchOrders(): Promise<Order[]>`
  - `function fetchOrder(orderId: string): Promise<Order>`
  - `function createOrder(input: CreateOrderInput): Promise<Order>`
  - `function fetchOpsSummary(): Promise<OpsSummary>`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/lib/api.test.ts`:

```ts
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

  it("throws with status code when response is not ok", async () => {
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
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npm run test -- api.test.ts`
Expected: FAIL — `Cannot find module './api'`

- [ ] **Step 3: 구현 작성**

`frontend/src/lib/api.ts`:

```ts
import type { Order, OpsSummary } from "../types/order";

export interface Product {
  product_id: string;
  product_name: string;
  stock: number;
  demo_note: string | null;
}

export interface CreateOrderInput {
  items: { product_id: string; quantity: number }[];
  card_number: string;
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

export function fetchProducts(): Promise<Product[]> {
  return getJson<Product[]>("/products");
}

export function fetchOrders(): Promise<Order[]> {
  return getJson<Order[]>("/orders");
}

export function fetchOrder(orderId: string): Promise<Order> {
  return getJson<Order>(`/orders/${orderId}`);
}

export function fetchOpsSummary(): Promise<OpsSummary> {
  return getJson<OpsSummary>("/ops/summary");
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const res = await fetch(`${BASE_URL}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`POST /orders failed: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test -- api.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib
git commit -m "feat: add REST client for orders/products/ops-summary"
```

---

### Task 6: SSE 모킹 유틸 + `useOrderStream` 훅

**Files:**
- Create: `frontend/src/test-utils/mockEventSource.ts`
- Create: `frontend/src/hooks/useOrderStream.ts`
- Test: `frontend/src/hooks/useOrderStream.test.ts`

**Interfaces:**
- Consumes: `SagaEvent`, `OrderStatus` (Task 3)
- Produces:
  - `class MockEventSource` with `static instances: MockEventSource[]`, `onmessage`, `close()`, `emit(data: unknown)` (`frontend/src/test-utils/mockEventSource.ts`)
  - `interface OrderStreamState { status: OrderStatus | null; events: SagaEvent[] }`
  - `function useOrderStream(orderId: string, initialStatus: OrderStatus | null): OrderStreamState`

- [ ] **Step 1: 모킹 유틸 작성 (테스트 대상 아님, 테스트 지원 코드)**

`frontend/src/test-utils/mockEventSource.ts`:

```ts
export class MockEventSource {
  static instances: MockEventSource[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  closed = false;

  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`frontend/src/hooks/useOrderStream.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOrderStream } from "./useOrderStream";
import { MockEventSource } from "../test-utils/mockEventSource";

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useOrderStream", () => {
  it("connects to /sse/orders/:orderId", () => {
    renderHook(() => useOrderStream("o1", "CREATED"));
    expect(MockEventSource.instances[0].url).toContain("/sse/orders/o1");
  });

  it("updates status when a saga event arrives", () => {
    const { result } = renderHook(() => useOrderStream("o1", "CREATED"));
    const source = MockEventSource.instances[0];

    act(() => {
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
    });

    expect(result.current.status).toBe("INVENTORY_RESERVING");
    expect(result.current.events).toHaveLength(1);
  });

  it("closes the EventSource on unmount", () => {
    const { unmount } = renderHook(() => useOrderStream("o1", "CREATED"));
    const source = MockEventSource.instances[0];
    unmount();
    expect(source.closed).toBe(true);
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `npm run test -- useOrderStream.test.ts`
Expected: FAIL — `Cannot find module './useOrderStream'`

- [ ] **Step 4: 구현 작성**

`frontend/src/hooks/useOrderStream.ts`:

```ts
import { useEffect, useState } from "react";
import type { OrderStatus, SagaEvent } from "../types/order";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export interface OrderStreamState {
  status: OrderStatus | null;
  events: SagaEvent[];
}

export function useOrderStream(orderId: string, initialStatus: OrderStatus | null): OrderStreamState {
  const [status, setStatus] = useState<OrderStatus | null>(initialStatus);
  const [events, setEvents] = useState<SagaEvent[]>([]);

  useEffect(() => {
    const source = new EventSource(`${BASE_URL}/sse/orders/${orderId}`);

    source.onmessage = (message) => {
      const event: SagaEvent = JSON.parse(message.data);
      setStatus(event.to_status);
      setEvents((prev) => [...prev, event]);
    };

    return () => source.close();
  }, [orderId]);

  return { status, events };
}
```

- [ ] **Step 5: 통과 확인**

Run: `npm run test -- useOrderStream.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/test-utils frontend/src/hooks/useOrderStream.ts frontend/src/hooks/useOrderStream.test.ts
git commit -m "feat: add useOrderStream hook for per-order SSE subscription"
```

---

### Task 7: `useOpsStream` 훅

**Files:**
- Create: `frontend/src/hooks/useOpsStream.ts`
- Test: `frontend/src/hooks/useOpsStream.test.ts`

**Interfaces:**
- Consumes: `SagaEvent`, `OpsSummary` (Task 3), `MockEventSource` (Task 6, tests only)
- Produces:
  - `interface OpsStreamState { events: SagaEvent[]; summary: OpsSummary }`
  - `function useOpsStream(initialSummary: OpsSummary): OpsStreamState`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/hooks/useOpsStream.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOpsStream } from "./useOpsStream";
import { MockEventSource } from "../test-utils/mockEventSource";
import type { SagaEvent } from "../types/order";

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

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

const emptySummary = { total_orders: 0, retrying_count: 0, dlq_count: 0, success_rate: 0 };

describe("useOpsStream", () => {
  it("counts a new order_id exactly once toward total_orders", () => {
    const { result } = renderHook(() => useOpsStream(emptySummary));
    const source = MockEventSource.instances[0];

    act(() => {
      source.emit(makeEvent({ order_id: "o1", to_status: "INVENTORY_RESERVING" }));
      source.emit(makeEvent({ order_id: "o1", to_status: "COMPLETED" }));
    });

    expect(result.current.summary.total_orders).toBe(1);
    expect(result.current.summary.success_rate).toBe(1);
  });

  it("tracks retrying_count across RETRYING_PAYMENT transitions", () => {
    const { result } = renderHook(() => useOpsStream(emptySummary));
    const source = MockEventSource.instances[0];

    act(() => {
      source.emit(makeEvent({ order_id: "o2", from_status: "PAYMENT_PROCESSING", to_status: "RETRYING_PAYMENT" }));
    });
    expect(result.current.summary.retrying_count).toBe(1);

    act(() => {
      source.emit(makeEvent({ order_id: "o2", from_status: "RETRYING_PAYMENT", to_status: "PAYMENT_FAILED_DLQ" }));
    });
    expect(result.current.summary.retrying_count).toBe(0);
    expect(result.current.summary.dlq_count).toBe(1);
  });

  it("appends every received event to the events list", () => {
    const { result } = renderHook(() => useOpsStream(emptySummary));
    const source = MockEventSource.instances[0];

    act(() => {
      source.emit(makeEvent({ event_id: "1" }));
      source.emit(makeEvent({ event_id: "2" }));
    });

    expect(result.current.events).toHaveLength(2);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -- useOpsStream.test.ts`
Expected: FAIL — `Cannot find module './useOpsStream'`

- [ ] **Step 3: 구현 작성**

`frontend/src/hooks/useOpsStream.ts`:

```ts
import { useEffect, useRef, useState } from "react";
import type { OpsSummary, SagaEvent } from "../types/order";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export interface OpsStreamState {
  events: SagaEvent[];
  summary: OpsSummary;
}

export function useOpsStream(initialSummary: OpsSummary): OpsStreamState {
  const [events, setEvents] = useState<SagaEvent[]>([]);
  const [summary, setSummary] = useState<OpsSummary>(initialSummary);
  const seenOrderIds = useRef(new Set<string>());
  const finishedCounts = useRef({ completed: 0, cancelled: 0 });

  useEffect(() => {
    const source = new EventSource(`${BASE_URL}/sse/ops`);

    source.onmessage = (message) => {
      const event: SagaEvent = JSON.parse(message.data);
      setEvents((prev) => [...prev, event]);

      const isNewOrder = !seenOrderIds.current.has(event.order_id);
      if (isNewOrder) seenOrderIds.current.add(event.order_id);

      if (event.to_status === "COMPLETED") finishedCounts.current.completed += 1;
      if (event.to_status === "CANCELLED") finishedCounts.current.cancelled += 1;

      setSummary((prev) => {
        const totalFinished = finishedCounts.current.completed + finishedCounts.current.cancelled;
        return {
          total_orders: seenOrderIds.current.size,
          retrying_count:
            prev.retrying_count +
            (event.to_status === "RETRYING_PAYMENT" ? 1 : event.from_status === "RETRYING_PAYMENT" ? -1 : 0),
          dlq_count: prev.dlq_count + (event.to_status === "PAYMENT_FAILED_DLQ" ? 1 : 0),
          success_rate: totalFinished > 0 ? finishedCounts.current.completed / totalFinished : prev.success_rate,
        };
      });
    };

    return () => source.close();
  }, []);

  return { events, summary };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test -- useOpsStream.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useOpsStream.ts frontend/src/hooks/useOpsStream.test.ts
git commit -m "feat: add useOpsStream hook for aggregated live ops metrics"
```

---

### Task 8: `OrderTimeline` 컴포넌트

**Files:**
- Create: `frontend/src/components/OrderTimeline.tsx`
- Test: `frontend/src/components/OrderTimeline.test.tsx`

**Interfaces:**
- Consumes: `OrderStatus` (Task 3)
- Produces: `interface OrderTimelineProps { currentStatus: OrderStatus }`, `function OrderTimeline(props: OrderTimelineProps): JSX.Element`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/components/OrderTimeline.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrderTimeline } from "./OrderTimeline";

describe("OrderTimeline", () => {
  it("marks earlier steps done and the current step active", () => {
    render(<OrderTimeline currentStatus="PAYMENT_PROCESSING" />);
    expect(screen.getByText("주문 생성")).toHaveAttribute("data-state", "done");
    expect(screen.getByText("결제 처리")).toHaveAttribute("data-state", "active");
    expect(screen.getByText("완료")).toHaveAttribute("data-state", "pending");
  });

  it("shows a failure banner for RETRYING_PAYMENT", () => {
    render(<OrderTimeline currentStatus="RETRYING_PAYMENT" />);
    expect(screen.getByTestId("failure-banner")).toHaveTextContent("결제 재시도 중");
  });

  it("shows a failure banner for CANCELLED", () => {
    render(<OrderTimeline currentStatus="CANCELLED" />);
    expect(screen.getByTestId("failure-banner")).toHaveTextContent("주문 취소됨");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -- OrderTimeline.test.tsx`
Expected: FAIL — `Cannot find module './OrderTimeline'`

- [ ] **Step 3: 구현 작성**

`frontend/src/components/OrderTimeline.tsx`:

```tsx
import type { OrderStatus } from "../types/order";

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: "CREATED", label: "주문 생성" },
  { status: "INVENTORY_RESERVING", label: "재고 확인" },
  { status: "PAYMENT_PROCESSING", label: "결제 처리" },
  { status: "NOTIFYING", label: "알림 발송" },
  { status: "COMPLETED", label: "완료" },
];

const FAILURE_LABELS: Partial<Record<OrderStatus, string>> = {
  INVENTORY_FAILED: "재고 부족",
  RETRYING_PAYMENT: "결제 재시도 중",
  PAYMENT_FAILED_DLQ: "결제 실패 (DLQ)",
  CANCELLED: "주문 취소됨",
};

type StepState = "done" | "active" | "pending";

function stepState(stepStatus: OrderStatus, currentStatus: OrderStatus): StepState {
  const stepIndex = STEPS.findIndex((s) => s.status === stepStatus);
  const currentIndex = STEPS.findIndex((s) => s.status === currentStatus);
  if (currentIndex === -1) return stepIndex === 0 ? "done" : "pending";
  if (stepIndex < currentIndex) return "done";
  if (stepIndex === currentIndex) return "active";
  return "pending";
}

export interface OrderTimelineProps {
  currentStatus: OrderStatus;
}

export function OrderTimeline({ currentStatus }: OrderTimelineProps) {
  const failureLabel = FAILURE_LABELS[currentStatus];

  return (
    <ol className="order-timeline">
      {STEPS.map((step) => (
        <li key={step.status} data-state={stepState(step.status, currentStatus)}>
          {step.label}
        </li>
      ))}
      {failureLabel && (
        <li data-state="failure" data-testid="failure-banner">
          {failureLabel}
        </li>
      )}
    </ol>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test -- OrderTimeline.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/OrderTimeline.tsx frontend/src/components/OrderTimeline.test.tsx
git commit -m "feat: add OrderTimeline component"
```

---

### Task 9: `EventLogTable` + `MetricTile` 컴포넌트

**Files:**
- Create: `frontend/src/components/EventLogTable.tsx`
- Test: `frontend/src/components/EventLogTable.test.tsx`
- Create: `frontend/src/components/MetricTile.tsx`
- Test: `frontend/src/components/MetricTile.test.tsx`

**Interfaces:**
- Consumes: `SagaEvent` (Task 3)
- Produces:
  - `interface EventLogTableProps { events: SagaEvent[] }`, `function EventLogTable(props): JSX.Element`
  - `interface MetricTileProps { label: string; value: string | number }`, `function MetricTile(props): JSX.Element`

- [ ] **Step 1: 실패하는 EventLogTable 테스트 작성**

`frontend/src/components/EventLogTable.test.tsx`:

```tsx
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
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -- EventLogTable.test.tsx`
Expected: FAIL — `Cannot find module './EventLogTable'`

- [ ] **Step 3: EventLogTable 구현**

`frontend/src/components/EventLogTable.tsx`:

```tsx
import type { SagaEvent } from "../types/order";

export interface EventLogTableProps {
  events: SagaEvent[];
}

export function EventLogTable({ events }: EventLogTableProps) {
  const latestFirst = [...events].reverse();

  return (
    <table>
      <thead>
        <tr>
          <th>시각</th>
          <th>주문 ID</th>
          <th>단계</th>
          <th>상태 전이</th>
        </tr>
      </thead>
      <tbody>
        {latestFirst.map((event) => (
          <tr key={event.event_id}>
            <td>{new Date(event.occurred_at).toLocaleTimeString()}</td>
            <td>{event.order_id}</td>
            <td>{event.saga_step}</td>
            <td>
              {event.from_status} → {event.to_status}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test -- EventLogTable.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: 실패하는 MetricTile 테스트 작성**

`frontend/src/components/MetricTile.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetricTile } from "./MetricTile";

describe("MetricTile", () => {
  it("renders the label and value", () => {
    render(<MetricTile label="총 주문" value={42} />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("총 주문")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: 실패 확인**

Run: `npm run test -- MetricTile.test.tsx`
Expected: FAIL — `Cannot find module './MetricTile'`

- [ ] **Step 7: MetricTile 구현**

`frontend/src/components/MetricTile.tsx`:

```tsx
export interface MetricTileProps {
  label: string;
  value: string | number;
}

export function MetricTile({ label, value }: MetricTileProps) {
  return (
    <div className="metric-tile">
      <span className="metric-tile__value">{value}</span>
      <span className="metric-tile__label">{label}</span>
    </div>
  );
}
```

- [ ] **Step 8: 통과 확인**

Run: `npm run test -- MetricTile.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/EventLogTable.tsx frontend/src/components/EventLogTable.test.tsx frontend/src/components/MetricTile.tsx frontend/src/components/MetricTile.test.tsx
git commit -m "feat: add EventLogTable and MetricTile components"
```

---

### Task 10: `OrderListPage` + `NewOrderPage`

**Files:**
- Create: `frontend/src/pages/OrderListPage.tsx`
- Test: `frontend/src/pages/OrderListPage.test.tsx`
- Create: `frontend/src/pages/NewOrderPage.tsx`
- Test: `frontend/src/pages/NewOrderPage.test.tsx`

**Interfaces:**
- Consumes: `fetchOrders`, `fetchProducts`, `createOrder` (Task 5, mocked via `vi.mock`)
- Produces: `function OrderListPage(): JSX.Element`, `function NewOrderPage(): JSX.Element` (둘 다 default export 아님, named export)

- [ ] **Step 1: 실패하는 OrderListPage 테스트 작성**

`frontend/src/pages/OrderListPage.test.tsx`:

```tsx
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
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -- OrderListPage.test.tsx`
Expected: FAIL — `Cannot find module './OrderListPage'`

- [ ] **Step 3: 의존성 설치 및 구현 작성**

```bash
cd frontend
npm install -D react-router-dom
```

(이미 Task 1에서 설치했다면 생략)

`frontend/src/pages/OrderListPage.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchOrders } from "../lib/api";

export function OrderListPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["orders"], queryFn: fetchOrders });

  if (isLoading) return <p>불러오는 중...</p>;
  if (error) return <p>주문 목록을 불러오지 못했습니다.</p>;

  return (
    <div>
      <h1>내 주문</h1>
      <Link to="/orders/new">새 주문</Link>
      <ul>
        {data!.map((order) => (
          <li key={order.order_id}>
            <Link to={`/orders/${order.order_id}`}>
              {order.order_id} — {order.current_status}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test -- OrderListPage.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: 실패하는 NewOrderPage 테스트 작성**

`frontend/src/pages/NewOrderPage.test.tsx`:

```tsx
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

    expect(createOrderSpy).toHaveBeenCalledWith({
      items: [{ product_id: "p1", quantity: 1 }],
      card_number: "4111111111111111",
    });
  });
});
```

- [ ] **Step 6: 실패 확인**

Run: `npm run test -- NewOrderPage.test.tsx`
Expected: FAIL — `Cannot find module './NewOrderPage'`

- [ ] **Step 7: 구현 작성**

`frontend/src/pages/NewOrderPage.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createOrder, fetchProducts } from "../lib/api";

export function NewOrderPage() {
  const navigate = useNavigate();
  const { data: products } = useQuery({ queryKey: ["products"], queryFn: fetchProducts });
  const [productId, setProductId] = useState("");
  const [cardNumber, setCardNumber] = useState("");

  const mutation = useMutation({
    mutationFn: createOrder,
    onSuccess: (order) => navigate(`/orders/${order.order_id}`),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate({ items: [{ product_id: productId, quantity: 1 }], card_number: cardNumber });
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>새 주문</h1>

      <label htmlFor="product-select">상품</label>
      <select id="product-select" aria-label="상품" value={productId} onChange={(e) => setProductId(e.target.value)} required>
        <option value="">상품 선택</option>
        {products?.map((p) => (
          <option key={p.product_id} value={p.product_id}>
            {p.product_name} {p.demo_note ? `(${p.demo_note})` : ""}
          </option>
        ))}
      </select>

      <label htmlFor="card-input">카드번호</label>
      <input
        id="card-input"
        aria-label="카드번호"
        placeholder="4000000000000002 = 결제 실패 시연용"
        value={cardNumber}
        onChange={(e) => setCardNumber(e.target.value)}
        required
      />

      <button type="submit" disabled={mutation.isPending}>
        주문하기
      </button>
    </form>
  );
}
```

- [ ] **Step 8: 통과 확인**

Run: `npm run test -- NewOrderPage.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/OrderListPage.tsx frontend/src/pages/OrderListPage.test.tsx frontend/src/pages/NewOrderPage.tsx frontend/src/pages/NewOrderPage.test.tsx
git commit -m "feat: add order list and new order pages"
```

---

### Task 11: `OrderDetailPage`

**Files:**
- Create: `frontend/src/pages/OrderDetailPage.tsx`
- Test: `frontend/src/pages/OrderDetailPage.test.tsx`

**Interfaces:**
- Consumes: `fetchOrder` (Task 5), `useOrderStream` (Task 6), `OrderTimeline` (Task 8), `MockEventSource` (test-utils)
- Produces: `function OrderDetailPage(): JSX.Element` — `react-router` 경로 파라미터 `:orderId`를 읽어 사용

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/pages/OrderDetailPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OrderDetailPage } from "./OrderDetailPage";
import * as api from "../lib/api";
import { MockEventSource } from "../test-utils/mockEventSource";

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderAtOrder(orderId: string) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/orders/${orderId}`]}>
        <Routes>
          <Route path="/orders/:orderId" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("OrderDetailPage", () => {
  it("renders the timeline at the status fetched from the REST API", async () => {
    vi.spyOn(api, "fetchOrder").mockResolvedValue({
      order_id: "o1",
      current_status: "PAYMENT_PROCESSING",
    } as never);

    renderAtOrder("o1");

    expect(await screen.findByText("결제 처리")).toHaveAttribute("data-state", "active");
  });

  it("updates the timeline when an SSE event arrives", async () => {
    vi.spyOn(api, "fetchOrder").mockResolvedValue({
      order_id: "o1",
      current_status: "PAYMENT_PROCESSING",
    } as never);

    renderAtOrder("o1");
    await screen.findByText("결제 처리");

    const source = MockEventSource.instances[0];
    source.emit({
      event_id: "1",
      order_id: "o1",
      saga_step: "NOTIFICATION",
      from_status: "NOTIFYING",
      to_status: "COMPLETED",
      attempt: 0,
      max_attempts: 0,
      reason: null,
      occurred_at: "2026-08-18T00:00:00Z",
    });

    expect(await screen.findByText("완료")).toHaveAttribute("data-state", "active");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -- OrderDetailPage.test.tsx`
Expected: FAIL — `Cannot find module './OrderDetailPage'`

- [ ] **Step 3: 구현 작성**

`frontend/src/pages/OrderDetailPage.tsx`:

```tsx
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchOrder } from "../lib/api";
import { useOrderStream } from "../hooks/useOrderStream";
import { OrderTimeline } from "../components/OrderTimeline";

export function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => fetchOrder(orderId!),
    enabled: Boolean(orderId),
  });
  const { status } = useOrderStream(orderId!, data?.current_status ?? null);

  if (isLoading || !status) return <p>불러오는 중...</p>;

  return (
    <div>
      <h1>주문 {orderId}</h1>
      <OrderTimeline currentStatus={status} />
    </div>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test -- OrderDetailPage.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/OrderDetailPage.tsx frontend/src/pages/OrderDetailPage.test.tsx
git commit -m "feat: add order detail page with live SSE-driven timeline"
```

---

### Task 12: `OpsDashboardPage`

**Files:**
- Create: `frontend/src/pages/OpsDashboardPage.tsx`
- Test: `frontend/src/pages/OpsDashboardPage.test.tsx`

**Interfaces:**
- Consumes: `fetchOpsSummary` (Task 5), `useOpsStream` (Task 7), `EventLogTable`, `MetricTile` (Task 9), `MockEventSource` (test-utils)
- Produces: `function OpsDashboardPage(): JSX.Element`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/pages/OpsDashboardPage.test.tsx`:

```tsx
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
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test -- OpsDashboardPage.test.tsx`
Expected: FAIL — `Cannot find module './OpsDashboardPage'`

- [ ] **Step 3: 구현 작성**

`frontend/src/pages/OpsDashboardPage.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { fetchOpsSummary } from "../lib/api";
import { useOpsStream } from "../hooks/useOpsStream";
import { MetricTile } from "../components/MetricTile";
import { EventLogTable } from "../components/EventLogTable";

const EMPTY_SUMMARY = { total_orders: 0, retrying_count: 0, dlq_count: 0, success_rate: 0 };

export function OpsDashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ["ops-summary"], queryFn: fetchOpsSummary });
  const { events, summary } = useOpsStream(data ?? EMPTY_SUMMARY);

  if (isLoading) return <p>불러오는 중...</p>;

  return (
    <div>
      <h1>운영 대시보드</h1>
      <div className="metric-grid">
        <MetricTile label="총 주문" value={summary.total_orders} />
        <MetricTile label="재시도 중" value={summary.retrying_count} />
        <MetricTile label="DLQ" value={summary.dlq_count} />
        <MetricTile label="성공률" value={`${Math.round(summary.success_rate * 100)}%`} />
      </div>
      <EventLogTable events={events} />
    </div>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test -- OpsDashboardPage.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/OpsDashboardPage.tsx frontend/src/pages/OpsDashboardPage.test.tsx
git commit -m "feat: add ops dashboard page with live metrics and event log"
```

---

### Task 13: `App.tsx` 라우팅 통합 + 수동 스모크 테스트

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/main.tsx`

**Interfaces:**
- Consumes: `OrderListPage`, `NewOrderPage`, `OrderDetailPage`, `OpsDashboardPage` (Tasks 10-12)
- Produces: 최상위 라우트 트리 (`/`, `/orders/new`, `/orders/:orderId`, `/ops`)

- [ ] **Step 1: App.tsx 라우팅 작성**

`frontend/src/App.tsx`:

```tsx
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OrderListPage } from "./pages/OrderListPage";
import { NewOrderPage } from "./pages/NewOrderPage";
import { OrderDetailPage } from "./pages/OrderDetailPage";
import { OpsDashboardPage } from "./pages/OpsDashboardPage";

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <nav>
          <Link to="/">주문 목록</Link>
          <Link to="/ops">운영 대시보드</Link>
        </nav>
        <Routes>
          <Route path="/" element={<OrderListPage />} />
          <Route path="/orders/new" element={<NewOrderPage />} />
          <Route path="/orders/:orderId" element={<OrderDetailPage />} />
          <Route path="/ops" element={<OpsDashboardPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

`frontend/src/main.tsx` (기존 Vite 템플릿 내용을 아래로 교체):

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 2: 전체 테스트 스위트 통과 확인**

Run: `cd frontend && npm run test`
Expected: PASS (모든 테스트 스위트)

- [ ] **Step 3: 수동 엔드투엔드 스모크 테스트**

```bash
# 터미널 1
cd frontend/mock-server && npm start

# 터미널 2
cd frontend && npm run dev
```

브라우저로 `http://localhost:5173` 접속해서 확인:
1. "새 주문" 클릭 → 상품 `무선 이어폰` 선택, 카드번호 `4111111111111111` 입력 후 주문 → 상세 페이지로 이동하며 타임라인이 CREATED → ... → COMPLETED로 실시간 진행되는지 확인
2. 다시 새 주문에서 `한정판 스니커즈`를 두 번째로 주문 → `재고 부족` 배너가 뜨는지 확인
3. 카드번호 `4000000000000002`로 주문 → `결제 재시도 중`이 attempt 1/3, 2/3로 올라가다 `결제 실패 (DLQ)`로 종결되는지 확인
4. `/ops` 방문 → 위 시나리오들이 실시간 이벤트 로그와 통계 타일에 반영되는지 확인

Expected: 위 4가지 시나리오가 모두 화면에 반영됨. 문제가 있으면 이 태스크를 완료로 표시하지 않는다.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/main.tsx
git commit -m "feat: wire up routing and app shell"
```

---

## 완료 조건

- `cd frontend && npm run test` 전체 통과
- `cd frontend/mock-server && npx vitest run` 전체 통과
- Task 13 Step 3의 4가지 수동 시나리오가 모두 브라우저에서 재현됨
