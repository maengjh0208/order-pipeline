# 이벤트 기반 비동기 주문 처리 시스템 — 설계 스펙

## 1. 목표와 범위

**포트폴리오 목표 (우선순위 순)**
1. 이벤트 기반(Kafka) 분산 시스템 설계력 증명 — 특히 Saga 오케스트레이션, 재시도/DLQ 처리
2. 운영/관찰가능성(Observability) 역량 증명 — 장애 발생 시 흐름을 실시간으로 추적/설명할 수 있는 대시보드

**역할 분담**
- 백엔드(FastAPI + Kafka) / 인프라(Docker Compose): 사용자 본인이 직접 구현
- 프론트엔드(React + TypeScript, 실시간 대시보드): Claude Code가 담당하며, 구현 중 React/이벤트 스트리밍 개념을 단계적으로 설명하면서 진행
- 이 문서는 양쪽이 공유하는 계약(이벤트 스키마, 상태 머신, API/SSE 명세)을 포함하며, 프론트엔드 구현 계획의 근거가 된다

**일정/배포 범위**
- 개발 기간: 1~2주
- 배포: 로컬 Docker Compose로 `docker compose up` 후 브라우저로 시연. 클라우드 배포는 범위 밖 (추후 별도 작업)

**의도적으로 범위에서 제외한 것**
- 실제 PG(결제대행사) 연동 — mock payment provider로 대체 (5절, 7절 참고)
- 인증/인가 — 운영 대시보드(`/sse/ops`, `/ops/summary`)는 시연 목적상 인증 없이 오픈. 실제 운영 환경이라면 필요하다는 점을 스펙에 명시
- Choreography(분산 자율 반응) 패턴 — 이번엔 Orchestration만 구현. Choreography는 별도 포트폴리오 프로젝트로 이어가서 두 패턴의 트레이드오프를 실증적으로 비교하는 것을 목표로 함

## 2. 전체 아키텍처

Saga 패턴 중 **Orchestration 방식**을 채택한다. 중앙 `order-saga-orchestrator`가 각 하위 서비스에 커맨드를 보내고, 응답 이벤트를 받아 다음 단계를 결정한다.

```
[Client: React, SSE 구독]
        │
        ├──GET /products (조회 전용)──▶ [inventory-service]
        │
        ▼
[order-saga-orchestrator] ──command──▶ [inventory-service]
   (FastAPI, 상태 보유)   ◀──event───
        │
        ├──command──▶ [payment-service] (재시도 로직 포함, PaymentProvider 추상화)
        │  ◀──event───
        │
        └──command──▶ [notification-service]
           ◀──event───

Kafka 토픽:
  - commands.inventory / events.inventory
  - commands.payment / events.payment
  - commands.notification / events.notification
  - dlq.payment (결제 재시도 3회 소진 시 원본 이벤트 적재)
```

**Orchestration을 선택한 이유** (Choreography 대비)
- 사가 상태가 오케스트레이터 한 곳에 자연스럽게 모여, 프론트가 구독할 "단일 상태 소스"가 명확해짐
- 상태 전이와 보상 트랜잭션 로직이 한 곳에 명시적으로 존재해 추적/설명이 쉬움
- 대가로 오케스트레이터가 SPOF이자 복잡도를 떠안는 컴포넌트가 되지만, 1~2주 범위의 포트폴리오에서는 이 트레이드오프가 적절하다고 판단

각 하위 서비스(inventory/payment/notification)는 커맨드 토픽을 구독해 처리하고 결과를 이벤트 토픽에 발행하는 단순한 워커로, 서로를 직접 알지 못한다.

**예외: `GET /products`는 오케스트레이터를 거치지 않고 프론트가 `inventory-service`에 직접 REST로 조회한다** (2026-09-01 결정). 원래는 오케스트레이터가 정적 시드 데이터를 노출하는 안을 검토했으나, 그러면 실제 재고(DB)와 별개로 움직이는 가짜 스냅샷이 되는 문제가 있었다. `inventory-service`가 이미 재고의 진짜 소스(PostgreSQL)를 갖고 있으므로, 오케스트레이터가 프록시로 한 번 더 감싸는 대신 프론트가 직접 물어보게 했다 — 그 프록시 경로를 넣으면 `inventory-service`가 죽었을 때 오케스트레이터의 멀쩡한 다른 엔드포인트까지 실패 전파 위험이 생기기 때문이다. 이 프로젝트 규모(서비스 4개)에서는 API 게이트웨이로 오케스트레이터를 통일하는 이점보다, 불필요한 홉과 장애 전파 지점을 없애는 이점이 크다고 판단했다. `commands.inventory`/`events.inventory`(쓰기, Kafka 비동기)와 `GET /products`(읽기, REST 동기)가 같은 서비스 안에서 공존하는 것은 CQRS 스타일의 read/write 경로 분리로 볼 수 있다. `inventory-service`는 이 결정으로 순수 Kafka 워커에서 "Kafka 워커 + 조회용 FastAPI 서버"로 역할이 확장된다.

### 2.1 Kafka 메시지 스키마 (백엔드 서비스 간 계약)

**이 스키마는 코드로 공유하지 않는다.** 4개 서비스는 이 문서를 보고 각자 자신의 Pydantic 모델을 독립적으로 정의한다. 공유 Python 패키지를 두면 DRY는 지켜지지만 서비스 배포가 암묵적으로 묶여버려(distributed monolith 위험), 마이크로서비스의 핵심 이점인 독립 배포 가능성을 해친다. 이 프로젝트는 DRY보다 결합도 최소화를 우선한다. (여러 팀이 협업하는 상황을 가정한 더 엄격한 계약 관리 방식—JSON Schema 검증, Schema Registry, 컨트랙트 테스트—은 이후 별도 실습 과제로 남겨둔다.)

**공통 규칙**
- 파티션 키: 모든 토픽에서 `order_id`를 키로 사용한다. Kafka는 파티션 "안에서만" 순서를 보장하므로, 같은 주문의 메시지들이 항상 같은 파티션으로 가게 해 순서를 보장한다.
- 컨슈머 그룹 ID: 서비스 이름과 동일하게 맞춘다 (예: `inventory-service`). 인스턴스를 여러 개로 스케일 아웃해도 같은 메시지가 중복 처리되지 않게 하기 위함.
- 가격/금액 계산은 이 프로젝트 범위 밖이다 (YAGNI) — 결제 커맨드는 실제 결제 금액을 계산하지 않고 성공/실패 시뮬레이션에 필요한 필드만 가진다.

**`commands.inventory`** — 오케스트레이터 → inventory-service: 재고 예약/해제 요청. `action`으로 두 경우를 구분한다 (별도 토픽을 만들지 않고 필드로 구분해 "리소스당 토픽 하나" 스타일을 유지).

```json
{
  "order_id": "uuid",
  "action": "RESERVE | RELEASE",
  "items": [{ "product_id": "p1", "quantity": 1 }]
}
```

- `RESERVE`: 최초 재고 예약 시도
- `RELEASE`: **보상 트랜잭션(compensating transaction)**. 재고는 이미 예약됐지만 이후 단계(결제)가 최종 실패했을 때, 예약을 되돌려서 재고 누수를 막기 위해 발행한다. 3절 상태 머신의 `COMPENSATING_INVENTORY` 단계에서 발행됨.

**`events.inventory`** — inventory-service → 오케스트레이터: 처리 결과

```json
{
  "order_id": "uuid",
  "action": "RESERVE | RELEASE",
  "result": "RESERVED | OUT_OF_STOCK | RELEASED",
  "reason": "out_of_stock | null"
}
```

**`commands.payment`** — 오케스트레이터 → payment-service: 결제 요청 (재시도마다 `attempt`를 올려 재발행)

```json
{
  "order_id": "uuid",
  "card_number": "4111111111111111",
  "attempt": 1
}
```

**`events.payment`** — payment-service → 오케스트레이터: 결제 결과

```json
{
  "order_id": "uuid",
  "attempt": 1,
  "result": "PAID | FAILED",
  "reason": "insufficient_funds | null"
}
```

**`commands.notification`** — 오케스트레이터 → notification-service: 완료 알림 발송 요청

```json
{ "order_id": "uuid" }
```

**`events.notification`** — notification-service → 오케스트레이터: 발송 결과 (실패 경로 없음 — 3절 상태 머신상 `NOTIFYING`은 항상 `COMPLETED`로 이어짐)

```json
{ "order_id": "uuid", "result": "SENT" }
```

**`dlq.payment`** — 결제 재시도 3회(`attempt: 3`) 소진 시, 마지막 `events.payment` 메시지(`result: FAILED`)와 동일한 형태로 이 토픽에 적재한다. 프론트 대시보드뿐 아니라 Kafka 토픽을 직접 조회해서도 실패 건을 확인할 수 있게 하기 위함이다.

## 3. 주문 상태 머신

오케스트레이터가 관리하고, 프론트는 이 상태만 구독하면 된다.

```
CREATED
  → INVENTORY_RESERVING
      → INVENTORY_RESERVED → PAYMENT_PROCESSING
      → INVENTORY_FAILED → CANCELLED  (재고부족: 재시도 의미 없음, 즉시 종결)
  PAYMENT_PROCESSING
      → PAID → NOTIFYING → COMPLETED
      → PAYMENT_FAILED → RETRYING_PAYMENT (attempt 1/3 → 2/3 → 3/3)
          → PAID (재시도 중 성공)
          → PAYMENT_FAILED_DLQ → COMPENSATING_INVENTORY → CANCELLED
```

**설계 포인트 1**: 재고부족과 결제실패를 비대칭으로 처리한다. 재고부족은 재시도해도 결과가 바뀌지 않으므로 즉시 `CANCELLED`로 종결하고, 결제실패만 일시적 오류일 가능성이 있다고 보고 재시도 대상으로 삼는다. 이 구분이 "왜 이렇게 설계했는가"에 대한 핵심 답변 포인트다.

**설계 포인트 2**: `PAYMENT_FAILED_DLQ`에서 바로 `CANCELLED`로 가지 않고 `COMPENSATING_INVENTORY`를 거친다. 결제가 최종 실패한 시점엔 이미 `inventory-service`가 재고를 예약(차감)해둔 상태이므로, 그 예약을 되돌리는 **보상 트랜잭션**(`commands.inventory` action=`RELEASE`)을 실행해야 재고 누수가 없다. Saga 패턴의 핵심이 "각 단계가 실패하면 이전 단계들을 보상 트랜잭션으로 되돌린다"는 것이므로, 이 단계가 빠지면 이름만 Saga이고 실제로는 보상 로직이 없는 반쪽짜리 구현이 된다. `INVENTORY_FAILED → CANCELLED`는 애초에 예약이 성공한 적이 없으므로 보상이 필요 없다.

## 4. API / SSE 계약

오케스트레이터가 구현하고 프론트가 소비하는 인터페이스. 프론트는 Kafka에 직접 접근하지 않는다. **`GET /products`만 예외로 `inventory-service`가 직접 구현한다** (2.1절 "예외" 참고).

**REST (초기 상태 조회 및 생성)**

| Method | Path | 구현 서비스 | 용도 |
|---|---|---|---|
| GET | `/products` | inventory-service | 주문 생성 폼에 표시할 상품 목록 (재고, 데모 트리거 라벨 포함) |
| POST | `/orders` | order-saga-orchestrator | 주문 생성 (요청/응답 스키마·데이터 흐름은 4.1절) |
| GET | `/orders` | order-saga-orchestrator | 주문 목록 (고객 뷰). `items` 포함, `card_number` 제외 |
| GET | `/orders/{id}` | order-saga-orchestrator | 주문 상세 + 상태 전이 히스토리 (SSE 연결 전 초기 하이드레이션). `items` 포함, `card_number` 제외 |
| GET | `/ops/summary` | order-saga-orchestrator | 운영 대시보드 초기 스냅샷 (총 주문수, 재시도 중 건수, DLQ 건수, 성공률) |

### 4.1 `POST /orders` 요청/응답 스키마 및 데이터 흐름 (2026-09-02 확정)

초기 walking skeleton에서는 `POST /orders`가 바디 없이 주문 하나를 만들고, 사가 내부에서 `card_number`와 `items`를 하드코딩했다. 이 절은 실제 주문 데이터(상품/수량/결제수단)가 프론트 → 오케스트레이터 → 하위 서비스로 흐르는 계약을 확정한다.

**요청 바디**

```json
{
  "items": [{ "product_id": "uuid", "quantity": 1 }],
  "card_number": "4111111111111111"
}
```

- `product_id`: 프론트가 `GET /products`(inventory-service)로 이미 조회한 값을 그대로 담는다. 오케스트레이터는 이 UUID를 자체적으로 알아낼 필요가 없다.
- `items`는 최소 1개, 각 `quantity >= 1` — 신뢰 경계이므로 오케스트레이터가 요청 스키마(Pydantic)로 검증하고, 위반 시 `422`를 반환한다.
- `card_number`: 결제 시뮬레이션 트리거(6절). 형식 검증은 하지 않는다(mock provider가 규칙 기반으로 성공/실패만 판단).

**응답 바디** — 생성된 주문. `card_number`는 응답에 포함하지 않는다 (아래 "결제수단 저장" 참고). `GET /orders`, `GET /orders/{id}`도 동일하게 `items`는 노출하고 `card_number`는 제외한다.

```json
{ "id": "uuid", "status": "INVENTORY_RESERVING", "items": [{ "product_id": "uuid", "quantity": 1 }] }
```

**오케스트레이터는 상품 존재 여부/재고를 미리 검증하지 않는다.** 요청의 `items`를 그대로 `commands.inventory`(`action: RESERVE`)에 실어보내고, 판정은 전적으로 inventory-service에 맡긴다.

- 재고 부족: 원자적 `UPDATE ... WHERE stock >= quantity`의 `rowcount == 0` → `events.inventory` `result: OUT_OF_STOCK`
- 존재하지 않는 `product_id`: 매칭되는 행이 없어 역시 `rowcount == 0` → 동일하게 `OUT_OF_STOCK`으로 처리된다 (별도의 "상품 없음" 결과값은 두지 않는다 — 사가 관점에서 둘 다 "예약 불가"로 같게 취급하면 충분하다)

이렇게 하는 이유는 2절의 원칙과 같다: 오케스트레이터에서 inventory-service로 가는 동기 REST 홉(재고 조회용)을 새로 만들면, inventory-service 장애가 주문 생성 경로까지 전파되는 지점이 생긴다. 재고 판정은 어차피 Kafka 커맨드/이벤트 왕복으로 한 번 하므로, 그 앞에 검증용 홉을 덧대지 않는다.

**`items`·`card_number`는 주문에 영속화한다.** 사가는 최초 생성 이후 단계에서도 이 값들이 필요하다:

- `card_number`: 결제 재시도 시 `saga.py`가 `commands.payment`를 `attempt`만 올려 재발행한다 → 매 재시도마다 카드번호가 필요하다.
- `items`: 결제 최종 실패 시 보상 트랜잭션(`commands.inventory` `action: RELEASE`)으로 **예약했던 그 수량 그대로** 되돌려야 한다 → `COMPENSATING_INVENTORY` 단계에서 필요하다.

따라서 두 값을 주문 레코드에 저장하고, `saga.py`의 핸들러들이 `order_id`로 주문을 다시 읽어 사용한다 (현재의 하드코딩 상수를 대체).

**결제수단 저장 — 보안 주석.** 이 프로젝트는 mock 결제이고 카드번호는 Stripe 테스트 카드 컨벤션을 차용한 시연용 값이라, 주문 레코드에 평문으로 저장한다. **실제 운영 시스템이라면** 카드번호(PAN)를 자사 DB에 저장하지 않는다 — PG(결제대행사) 경계에서 토큰화하고 그 토큰만 보관하며, 재시도도 토큰으로 한다(PCI-DSS). 이 스펙은 그 경계 설계를 실제로 구현하지는 않되, 저장하고 있다는 사실과 실제 환경에서의 처리 방식을 명시해 둔다.

**SSE (실시간 갱신)**

- `GET /sse/orders/{order_id}` — 특정 주문만 구독 (서버가 order_id로 필터링해 다른 고객 주문 노출 방지)
- `GET /sse/ops` — 전체 사가 이벤트 스트림 구독 (운영자용)

**이벤트 payload 스키마** (두 스트림이 공통 포맷 사용)

```json
{
  "event_id": "uuid",
  "order_id": "uuid",
  "saga_step": "INVENTORY | PAYMENT | NOTIFICATION",
  "from_status": "PAYMENT_PROCESSING",
  "to_status": "RETRYING_PAYMENT",
  "attempt": 1,
  "max_attempts": 3,
  "reason": "insufficient_funds | out_of_stock | null",
  "occurred_at": "2026-08-18T10:00:00Z"
}
```

**재연결 복구**: SSE `id:` 필드에 `event_id`를 실어 보낸다. 브라우저가 재연결 시 자동으로 보내는 `Last-Event-ID` 헤더를 오케스트레이터가 받아, 그 이후 발생한 이벤트를 재전송하도록 설계한다. Kafka의 at-least-once 전달 보장을 프론트 계층까지 이어지게 하는 지점이며, 인터뷰에서 설명 가치가 높다.

운영 대시보드는 `/ops/summary`로 초기 스냅샷을 하이드레이션한 뒤 `/sse/ops` 스트림을 누적 반영해 클라이언트에서 통계를 갱신한다. 별도 폴링 엔드포인트는 두지 않는다.

### 4.2 실제 구현 시 결정 사항 (2026-09-03, 프로젝트 마감 스코프)

`SagaEvent` 전체 스키마 중 오케스트레이터의 `update_status()`가 이벤트를 발행하는 시점에 **비용 없이 채울 수 있는 필드만** 우선 구현한다:

- `event_id`(신규 UUID), `order_id`, `from_status`(전이 직전 값), `to_status`, `occurred_at`(발행 시각)
- `saga_step`: `to_status` → 단계 매핑 순수 함수로 유도 (`INVENTORY_*` → `INVENTORY`, `PAYMENT_*`/`PAID` → `PAYMENT`, `NOTIFYING` → `NOTIFICATION`)
- **`attempt` / `max_attempts` / `reason`은 생략** — 이 값들은 `update_status()`가 아니라 사가 컨텍스트(어느 재시도인지, 왜 실패했는지)에 있어서, 넘기려면 모든 `update_status` 호출부에 인자를 추가해야 한다. 운영 대시보드의 이벤트 로그 테이블은 이 세 필드를 렌더링하지 않으므로 지금은 불필요. 나중에 필요해지면 그때 사가 → `update_status` 인자 전달로 확장.

`/ops/summary`의 `dlq_count`("이 주문이 한 번이라도 DLQ를 거쳤는가"):

- 상태 스냅샷으로는 판단 불가 — 주문이 `PAYMENT_FAILED_DLQ`를 잠깐 거쳐 `CANCELLED`로 끝나므로 현재 `status`만 봐선 놓친다.
- **`OrderModel`에 `went_to_dlq: bool` 컬럼 하나** 추가하고, 사가의 DLQ 분기에서 `True`로 세팅. 전이 이력 테이블(`order_events`)은 만들지 않는다 — 그건 위에서 생략한 `attempt`/`reason` 이력과 함께 "rich 이벤트" 확장 과제로 미룬다. `dlq_count` 하나 때문에 이력 테이블을 도입하는 건 과설계.

`/ops/summary` 나머지 지표는 `orders` 테이블 집계로 즉시 계산: `total_orders`(전체), `retrying_count`(`status = RETRYING_PAYMENT`), `success_rate`(`COMPLETED / (COMPLETED + CANCELLED)`, 종결 주문이 0이면 0).

**SSE `id:` 라인 + Last-Event-ID 재전송**: 실제 오케스트레이터에는 아직 구현하지 않는다(mock 서버만 구현). `EventSource`가 끊기면 자동 재연결하되 그 사이 이벤트는 유실 — 로컬 시연 규모에서 허용. 서버측 재전송 버퍼는 rich 이벤트 확장과 함께.

## 5. 프론트엔드 구조

**스택**: Vite + React + TypeScript, `react-router`(라우팅), TanStack Query(REST fetch/cache) + React 기본 상태(`useState`/`useReducer`)로 SSE 푸시를 캐시에 merge. Redux 등 전역 상태 라이브러리는 이 규모에는 과설계이므로 사용하지 않는다.

**페이지 구성**

| 경로 | 화면 | 핵심 기능 |
|---|---|---|
| `/` | 주문 목록 (고객뷰) | 주문 리스트 + "새 주문" 버튼 |
| `/orders/new` | 새 주문 | 상품/결제수단 선택 폼. 데모 트리거 옵션에 라벨 표시("품절 시연용", "결제 실패 시연용") |
| `/orders/:id` | 주문 상세 (고객뷰) | 상태 머신을 세로 타임라인(Stepper)으로 시각화, `/sse/orders/:id` 구독 |
| `/ops` | 운영 대시보드 | 통계 타일(총 주문/재시도중/DLQ/성공률) + 실시간 이벤트 로그 테이블, `/sse/ops` 구독 |

**핵심 모듈**

- `lib/api.ts` — REST 호출 함수 모음
- `hooks/useOrderStream.ts` — `EventSource` 연결/재연결/Last-Event-ID 처리 캡슐화, 상태 업데이트를 콜백으로 노출
- `hooks/useOpsStream.ts` — 전체 이벤트 누적 + 통계 집계
- `components/OrderTimeline.tsx` — 상태 머신을 단계별 아이콘/색상으로 시각화 (성공=초록, 재시도=노랑 pulse, DLQ/실패=빨강)
- `components/EventLogTable.tsx` — 신규 이벤트 유입 시 하이라이트되는 실시간 로그 테이블

**테스트**: Vitest + React Testing Library. `OrderTimeline`의 상태별 렌더링, `useOrderStream`의 재연결 로직 정도로 범위를 한정한다 (SSE 연결 관리처럼 버그가 나기 쉬운 부분에 집중, 전체 커버리지는 목표하지 않음).

**개발용 mock 서버**: 실제 오케스트레이터가 준비되기 전에 프론트를 독립적으로 개발/테스트할 수 있도록, 4절의 계약을 그대로 구현하는 경량 Node/Express mock 서버(`frontend/mock-server/`)를 둔다. 인메모리 상태로 6절의 시드 데이터와 상태 머신 전이를 타이머로 시뮬레이션하며, 전이 지연 시간을 설정 가능하게 만들어 테스트에서는 짧게 조정한다. 이 mock 서버는 계약의 실행 가능한 문서 역할도 겸하며, 실제 오케스트레이터 완성 후에도 프론트 단독 개발/CI용으로 유지한다.

## 6. 데모 실패 시나리오 시드 데이터

버튼으로 장애를 트리거하는 대신, 특정 조건으로 주문하면 자연스럽게 실패 흐름이 재현되도록 시드 데이터를 설계한다.

**재고부족**: 시드 상품 중 하나를 `한정판 스니커즈 (재고 1개)`처럼 재고 1개로 등록. 한 번 성공 주문하고 나면 그다음부터는 자연히 `INVENTORY_FAILED`가 재현된다.

**결제실패**
- 결정론적 트리거: 카드번호 `4000-0000-0000-0002`(Stripe 테스트 카드 컨벤션 차용)로 주문하면 mock payment provider가 항상 실패 반환 — 시연 중 100% 재현 가능
- 배경 노이즈용 랜덤 실패: 그 외 카드번호는 낮은 확률(예: 10%)로 랜덤 실패하도록 구성해, 운영 대시보드의 성공률/재시도 통계가 시연 중에도 자연스럽게 누적되도록 함

프론트 폼에는 이 트리거 카드번호/상품에 툴팁으로 설명을 노출해, 시연자가 "이 상품 주문하면 재고부족 흐름을 보여드릴게요"처럼 자연스럽게 유도할 수 있게 한다.

## 7. 확장 지점: 실제 PG 연동으로의 전환

`payment-service` 내부에 `PaymentProvider` 인터페이스(추상화)를 두고, 현재는 `MockPaymentProvider`(카드번호 규칙 기반 성공/실패)를 사용한다. 추후 `StripePaymentProvider` 같은 실제 구현체로 교체 가능하도록 설계한다 (Strategy/Adapter 패턴).

이 교체는 `payment-service` 내부 구현 디테일이며, `payment.completed` / `payment.failed` 이벤트 포맷이 동일하게 유지되는 한 오케스트레이터와 프론트엔드는 변경할 필요가 없다. 이벤트 기반 설계 덕분에 결제 구현체를 교체해도 나머지 시스템이 영향받지 않는다는 것을 보여주는 사례로 삼는다.

**현재 구현 범위에는 포함하지 않음** — 백엔드 담당(사용자 본인)이 인터페이스 경계만 설계에 반영하고, 실제 PG 연동 구현은 이후 과제로 남긴다.

## 8. 다음 단계

이 스펙을 근거로 **프론트엔드 구현 계획**만 별도로 수립한다 (writing-plans 스킬 사용). 백엔드/인프라 구현 계획은 이 문서의 계약을 참고해 사용자 본인이 별도로 진행한다.
