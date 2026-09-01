# order-pipeline

## 프로젝트 개요

이벤트 기반 비동기 이커머스 주문 처리 시스템 — 이직 준비용 포트폴리오 프로젝트.

- 1순위 목표: Kafka 기반 Saga **Orchestration** 설계력 증명 (재시도/DLQ 처리 포함)
- 2순위 목표: 운영/관찰가능성(Observability) 역량 증명 — 실시간 장애 관찰 대시보드
- 설계 스펙: `docs/superpowers/specs/2026-08-18-order-pipeline-design.md`
- 프론트 구현 계획: `docs/superpowers/plans/2026-08-18-order-pipeline-frontend.md`

## 역할 분담

- **프론트엔드** (`frontend/`): Claude Code가 작성
- **백엔드/인프라** (`order-saga-orchestrator`, `inventory-service`, `payment-service`, `notification-service`, Docker Compose 등): 사용자가 직접 타이핑. 상세 규칙은 아래 "작업 방식" 2번 참고

## 작업 방식 (사용자 지침, 2026-08-18 확정)

1. 프론트는 Claude Code가 작성하되, 프론트를 전혀 모르는 개발자에게 가르치듯 각 작업의 목적과 흐름을 설명하며 진행한다.
2. 백엔드/인프라는 사용자가 직접 타이핑한다 — Claude Code는 이 영역의 파일을 절대 직접 Write/Edit하지 않는다. 사후 코드 리뷰가 아니라, 타이핑 전에 무엇을·왜·어떻게 쓸지 먼저 설명하고 실시간으로 옆에서 안내하며 실습을 돕는다.
3. DRY 원칙을 지킨다.
4. 테스트하기 쉬운 구조를 함께 고민한다.
5. 결합도를 낮추는 방법을 함께 고민한다.
6. **예광탄(Tracer Bullet) 방법론**: 태스크마다 처음부터 완성도를 추구하지 않는다. 먼저 얇게 동작하는 버전을 만들어 확인한 뒤, 점진적으로 살을 붙인다.
7. 사용자가 코드 작성을 완료하면 문법 오류/오타를 점검하고 필요한 피드백을 제공한다.
8. 새 기능을 추가로 구현해야 할 때는 먼저 `docs/superpowers/specs`, `docs/superpowers/plans`에 스펙/계획을 작성한 뒤 진행한다.
9. 현재 진행 상황을 이 파일에 최신 상태로 반영한다.
10. **커밋 책임은 역할 분담(1/2번)을 따른다** (2026-08-19 변경, 2026-08-31 프론트 예외 추가). 기본은 사용자가 직접 커밋하고 Claude Code는 메시지만 추천하지만, **프론트엔드(`frontend/`)는 Claude Code가 작성하므로 커밋도 Claude Code가 직접 한다** ("프론트는 너가 작성했으니까 너가 커밋해"). 백엔드/인프라 파일은 계속 사용자가 직접 커밋 — Claude Code는 여전히 그 영역에 git add/commit을 실행하지 않는다.

## 브랜치 전략 (2026-08-19 변경)

- **그냥 `main` 하나로 작업한다.** feature 브랜치를 새로 만들지 않는다.
- (이전엔 `feature/order-pipeline-frontend`, `feature/order-saga-orchestrator`로 나눠 작업했었음 — 브랜치 전환이 혼란스러워서 단순화함. 두 브랜치 모두 이미 main에 병합 완료, 로컬에 남은 브랜치 자체는 안 지워도 무해함.)

## 현재 진행 상황

- [x] 아키텍처 브레인스토밍 및 spec 확정 (Orchestration 기반 Saga, 상태 머신, API/SSE 계약)
- [x] 프론트엔드 구현 계획 작성
- [x] Notion에 요구사항/설계 문서 정리 (mermaid 다이어그램 포함)
- [x] 프론트엔드 wave 1 (walking skeleton) 완료 — `feature/order-pipeline-frontend` 브랜치, 브라우저에서 주문 생성 → SSE로 상태가 실시간 갱신되는 것까지 확인함
- [x] 프론트엔드 wave 2(상태 머신 시각화, 주문 목록/생성/상세 페이지, 라우팅) 완료 — 아래 "wave 2 상세" 참고. 브라우저에서 주문 생성 → 상세 페이지 타임라인이 실시간으로 CREATED~COMPLETED까지 진행되는 것, 목록 페이지 반영까지 확인함
- [ ] 프론트엔드 wave 3~5 — 아래 "실행 순서" 참고
- [x] `order-saga-orchestrator` 백엔드 wave 1 (walking skeleton) 완료 — FastAPI `/health` 엔드포인트, uv(src 레이아웃), Dockerfile + `docker-compose.yaml`(src 볼륨 마운트로 핫리로드).
- [x] `order-saga-orchestrator` 백엔드 wave 2 (Kafka 연결 증명) 완료 — 아래 "wave 2 상세" 참고. producer/consumer 둘 다 컨테이너 안 FastAPI 앱에서 직접 동작 확인함.
- [x] `order-saga-orchestrator` 백엔드 wave 3 (핵심 사가 로직) 완료 — 아래 "wave 3 상세" 참고. 주문 생성 → 재고 예약 → 결제(성공/실패) → 재시도(최대 3회) → DLQ 적재 → 재고 보상 트랜잭션 → 취소, 전체 사가가 SSE로 실시간 관측되는 것까지 end-to-end 확인함. `/_debug/produce`는 삭제함.
  - [x] `POST /orders`, `GET /orders/{id}` — 스펙 4절 계약대로
  - [x] `GET /sse/orders/{order_id}` — 스펙 4절 계약대로
  - [ ] `GET /orders`(목록), `GET /products`, `GET /ops/summary`, `GET /sse/ops` — 아직 미구현. **다음에 이어갈 순서(2026-09-01 확정)**: (1) `GET /orders` 목록 먼저 — 이미 있는 `orders` 테이블 조회만 하면 됨, 가장 쉬움. (2) `GET /sse/ops` — `events.py`의 pub/sub이 이미 필터링 없이 전체 브로드캐스트하니 `/sse/orders/{id}`처럼 필터링만 안 하면 됨. (3) `GET /products`, `GET /ops/summary`는 설계 결정이 더 필요해서 순서상 뒤로 미룸 — `GET /products`는 "오케스트레이터가 상품 데이터를 어디서 가져오나"(예전에 정적 시드 데이터로 하기로 했던 논의 재확인 필요), `GET /ops/summary`는 지금 `orders` 테이블에 `id`/`status`만 있고 **상태 전이 이력이 전혀 없어서** `dlq_count`("이 주문이 한 번이라도 DLQ를 거쳤는가") 판단이 불가능함 — 새 테이블/컬럼이 필요한 설계 결정. mock 서버(`frontend/mock-server/server.mjs`)엔 이 4개 엔드포인트가 이미 다 구현되어 있으니 계약 참고용으로 쓸 것.
  - [x] 주문/사가 상태를 들고 있는 저장소 (인메모리, `orders.py`)
  - [x] 컨슈머가 `events.inventory` + `events.payment`를 함께 구독, 받은 이벤트로 실제 상태 머신(스펙 3절)을 진행시키는 로직 (`saga.py`)
- [x] 알림(`commands.notification`/`events.notification`, `PAID` → `NOTIFYING` → `COMPLETED`) 완료 — 스펙 3절 상태 머신이 이제 전부 구현됨 (`CREATED`부터 `COMPLETED`/`CANCELLED`까지 모든 경로)
- [x] `inventory-service` wave 1 (Kafka 연결 증명) 완료 — `commands.inventory` 구독해서 수신 로그 찍는 것까지 확인함
- [x] `inventory-service` wave 2 (재고 로직 + PostgreSQL) 완료 — 아래 "inventory-service 상세" 참고. `RESERVE`/`RELEASE` 커맨드를 실제로 처리해 `events.inventory` 응답을 자동 발행, 오케스트레이터의 전체 사가를 Kafka UI 수동 개입 없이 실제 서비스 두 개만으로 end-to-end 검증함. 재고 저장소는 처음부터 PostgreSQL로(인메모리 단계 생략) — 원자적 UPDATE 설계 실습이 목적이었음
- [x] `payment-service` 완료 — `PaymentProvider` 추상화(`MockPaymentProvider`: 고정 카드번호 `4000000000000002`는 항상 실패, 그 외 10% 랜덤 실패) 구현, `commands.payment` 처리해 `events.payment` 자동 발행 확인. DB 없음(무상태 서비스라 database-per-service 판단 결과 불필요) — 컨슈머 루프도 완전 동기(async 불필요, `inventory-service`와 달리 `asyncio.run` 자체가 없음)
- [x] `notification-service` 완료 — `commands.notification` 받으면 항상 `events.notification`(`SENT`)로 응답 (스펙대로 실패 경로 없음, 분기 자체가 없는 가장 단순한 서비스). DB 없음, 완전 동기.
- **4개 서비스(오케스트레이터+inventory+payment+notification) 전부 갖춰짐 — `POST /orders` 한 번으로 Kafka UI 수동 개입 없이 `CREATED`부터 `COMPLETED`(또는 결제 실패 시 `CANCELLED`)까지 완전 자동 완주하는 것 확인함.** 이 프로젝트 1순위 목표(Saga Orchestration)가 실제 마이크로서비스로 end-to-end 증명된 마일스톤.
  - 겪은 문제: 새 컨테이너/볼륨으로 처음 뜰 때 `events.payment`처럼 그 시점까지 한 번도 안 쓰인 토픽을 오케스트레이터가 구독 시도하면 다시 `UNKNOWN_TOPIC_OR_PART` 이슈 발생 (wave 2 상세 참고) — `payment-service`가 나중에 그 토픽에 처음 발행해 토픽이 생겨도 오케스트레이터는 5분간 재확인을 안 하므로, `docker compose restart order-saga-orchestrator`로 재구독해야 함. 여러 서비스를 한꺼번에 새로 띄울 때 반복될 수 있는 패턴이니 기억해둘 것.
- [x] `order-saga-orchestrator` 주문 저장소 인메모리 → PostgreSQL 전환 완료 (아래 "백엔드 설계 결정" 참고) — `orders.py`/`main.py`/`saga.py` 전부 async DB 세션 기반으로 전환, 컨테이너 재시작 후에도 주문 상태가 유지되는 것 확인함 (첫 영속성 증명)
- [ ] Docker Compose 전체 통합(모든 서비스 + Kafka) 및 로컬 시연

### wave 2 상세 (Kafka 연결 증명, 2026-08-19~20)

FastAPI 앱 안에서 Kafka producer/consumer가 실제로 동작하는 것까지 증명 완료:
- `lifespan`에서 `Producer`를 앱 시작 시 한 번만 만들어 `app.state.producer`에 저장, 종료 시 `flush()`
- 백그라운드 `threading.Thread`로 `events.inventory`를 구독하는 컨슈머를 돌림 (`threading.Event`로 협조적 종료)
- `pydantic-settings`로 `KAFKA_BOOTSTRAP_SERVERS` 등 설정 관리 (`config.py`)
- `Topic` StrEnum으로 토픽 이름 관리 (`topics.py`) — 스펙 2.1절 토픽 전부 미리 정의해둠
- 로컬(호스트)에서 Kafka 상태를 직접 찔러보는 `scripts/kafka_smoke_test.py` (일회성 진단 스크립트, `localhost:9092` 사용 — 컨테이너 안 앱은 `kafka:19092` 사용)

**겪었던 문제와 해결 (다음에 또 겪을 수 있어서 기록):**
- Bitnami Kafka 이미지가 태그 정책 바뀌어서 `bitnami/kafka:3.9` 못 씀 → 공식 `apache/kafka:latest`로 전환, KRaft 모드, 리스너 2개(`localhost:9092`=호스트용, `kafka:19092`=컨테이너 네트워크용)로 구성
- `depends_on`은 "컨테이너 시작 순서"만 보장하고 "서비스 준비 완료"는 보장 안 함 → Kafka 뜨기 전에 orchestrator가 먼저 연결 시도해서 일시적 `Connection refused` 발생 (librdkafka가 자동 재시도해서 결국 붙음, 지금은 그냥 넘어감 — 나중에 `healthcheck` + `condition: service_healthy`로 근본 해결 가능)
- 존재하지 않는 토픽을 구독하면 `UNKNOWN_TOPIC_OR_PART` 에러가 나고, librdkafka가 그 토픽에 대한 재확인 주기를 5분으로 늦춰버림 → 토픽이 나중에 생기면 컨슈머 재시작해서 새로 구독해야 바로 반영됨
- Python `print()`가 Docker 로그에 바로 안 보임 (stdout이 파이프로 리다이렉트되면 블록 버퍼링됨) → `docker-compose.yaml`에 `PYTHONUNBUFFERED: "1"` 추가로 해결

### wave 3 상세 (핵심 사가 로직, 2026-08-20~22)

`order-saga-orchestrator/src/order_saga_orchestrator/` 구성 (package by feature — 기술적 종류가 아니라 관심사로 파일 분리):
- `orders.py`: `OrderStatus`(StrEnum, 스펙 3절 상태 전부), `Order`(pydantic 모델), 인메모리 저장소(`_orders: dict[str, Order]`) + `create_order`/`get_order`/`update_status`. `update_status`가 상태를 바꿀 때마다 `events.publish()`도 같이 호출 — 호출하는 쪽이 매번 publish를 안 잊어도 되게
- `events.py`: SSE용 pub/sub. `asyncio.Queue`를 구독자마다 하나씩 발급, `publish()`는 모든 구독자에게 필터링 없이 브로드캐스트(구독자가 알아서 걸러 씀 — `/sse/orders/{id}`는 필터링, 나중에 만들 `/sse/ops`는 그대로 다 흘려보내면 됨). 컨슈머 스레드(별도 OS 스레드)에서 이벤트 루프로 안전하게 넘기기 위해 `loop.call_soon_threadsafe(q.put_nowait, event)` 사용 — `asyncio.Queue`는 스레드 세이프가 아니라서. (처음엔 `queue.Queue` + `asyncio.to_thread`로 구현했다가, "동시 접속자가 스레드풀 크기(기본 ~32개)를 넘으면 어떻게 되나"라는 질문 계기로 스레드를 전혀 안 쓰는 이 방식으로 리팩터링함)
- `saga.py`: Kafka 컨슈머(`consume_events(producer)`, `producer`를 인자로 받아서 `main.py`/FastAPI를 몰라도 되게— 순환참조 방지 + 테스트 용이성)와 실제 오케스트레이션 로직(`handle_events_inventory`, `handle_events_payment`). 컨슈머 하나가 `events.inventory`+`events.payment`를 함께 구독하고 `msg.topic()`으로 분기(토픽마다 스레드를 새로 만들지 않음 — 사가는 어차피 순차 조율이라 컨슈머 하나로 충분). 결제 실패 시 `attempt < 3`이면 재시도(`RETRYING_PAYMENT` + `commands.payment` 재발행), 3회 소진 시 `dlq.payment`에 원본 실패 이벤트 그대로 적재 + `commands.inventory`에 `action: RELEASE` 발행(보상 트랜잭션) + `COMPENSATING_INVENTORY`로 전이, 이후 `events.inventory`의 `RELEASED` 응답을 받으면 `CANCELLED`로 최종 종결
- `main.py`: FastAPI 배선만 담당 (lifespan, 라우트). `POST /orders`, `GET /orders/{id}`, `GET /sse/orders/{order_id}`
- `docker-compose.yaml`에 `kafka-ui`(`kafbat/kafka-ui`, `localhost:8080`) 추가 — 토픽/메시지를 브라우저에서 보고, `inventory-service`/`payment-service`가 아직 없는 지금은 이걸로 응답 이벤트를 수동 발행해서 오케스트레이터 로직을 검증하는 용도로 씀

**검증한 전체 시나리오**: `POST /orders` → (Kafka UI로 `events.inventory` RESERVED 발행) → `PAYMENT_PROCESSING` → (`events.payment` FAILED × 3, attempt 1→2→3) → `RETRYING_PAYMENT` 반복 → `PAYMENT_FAILED_DLQ` → `dlq.payment` 적재 확인 + `commands.inventory` RELEASE 발행 확인 → `COMPENSATING_INVENTORY` → (Kafka UI로 `events.inventory` RELEASED 발행) → `CANCELLED`. 전체 과정을 `GET /sse/orders/{id}`로 실시간 스트리밍되는 것까지 curl -N으로 확인함.

**참고 (다음에 이어갈 때)**:
- `card_number`는 `POST /orders`가 아직 입력을 안 받아서 `saga.py`에 하드코딩(`"4111111111111111"`)되어 있음 — 나중에 실제 주문 폼이 생기면 `Order`에 필드 추가하고 여기로 넘겨받게 바뀔 것
- `commands.inventory`의 `items`도 항상 빈 배열(`[]`)로 하드코딩 — 같은 이유
- 순수 Python 코드 변경은 `docker compose up --build` 없이도 반영됨 — `./order-saga-orchestrator/src/`가 볼륨 마운트되어 있고 `uvicorn --reload`라서 자동 재시작됨. 리빌드는 `pyproject.toml`/`uv.lock`(의존성)이나 `Dockerfile`이 바뀔 때만 필요
- `events.notification`처럼 **한 번도 안 쓰인 새 토픽**을 처음 구독할 때, 컨슈머가 뜬 시점에 토픽이 아직 없으면 `UNKNOWN_TOPIC_OR_PART` 이슈(wave 2 상세 참고)가 또 발생함 — Kafka UI로 메시지 발행해서 토픽 만든 뒤 `docker compose restart order-saga-orchestrator`로 재구독하면 해결

### inventory-service 상세 (2026-08-27~31)

`order-saga-orchestrator`와 달리 REST/FastAPI가 없는 순수 Kafka 워커 — `main()`이 메인 스레드에서 그냥 `while True` 폴링 루프를 도는 동기 스크립트라, 스레드↔이벤트루프 다리(`run_coroutine_threadsafe`)가 필요 없음. async DB 함수를 호출할 때는 메시지 하나당 `asyncio.run(handle_commands_inventory(...))`으로 그때그때 새 이벤트 루프를 만들었다 닫는 것으로 충분.

- **database-per-service**: 오케스트레이터의 `order-postgres`와 완전히 별도인 `inventory-postgres` 컨테이너/볼륨 사용. 서비스 이름도 `postgres`(오케스트레이터) → `order-postgres`로, 신규는 `inventory-postgres`로 명확히 구분.
- **`ProductModel`**: `id`는 UUID(`Uuid(as_uuid=False)`, `orders.py`의 `Order.id`와 같은 패턴), 식별자와 사람이 읽는 이름을 분리하기 위해 `product_name` 필드를 별도로 둠. 초기엔 `id`를 `"p1"`/`"p2"` 같은 짧은 문자열로 하려다, "식별자가 이름 역할까지 겸하는 건 안 좋다"는 논의로 UUID+이름 분리로 변경.
  - 시드 데이터(`한정판 스니커즈` 재고 1개=품절 시연용, `기본 티셔츠` 재고 999개)는 스키마가 아니라 데이터라 Alembic 마이그레이션 파일 안에 `op.bulk_insert()`로 넣음.
- **재고 예약/해제는 원자적 `UPDATE ... WHERE stock >= quantity`로 처리** (`inventory.py`). SELECT 후 UPDATE 두 단계로 하지 않고 한 문장으로 묶어서, 인스턴스가 여러 개여도 "둘 다 재고 있다고 착각"하는 lost-update를 원천 차단. `rowcount == 0`이면 재고 부족으로 판단해 `ValueError` 발생 → `get_session()`의 롤백이 트랜잭션 전체(이미 성공했던 다른 상품 차감분 포함)를 되돌림.
  - **데드락 방지**: 여러 상품(`items`)을 처리할 때 `product_id` 기준으로 항상 정렬 후 순회. 이유: 트랜잭션 A가 `[p1, p2]` 순서로, 트랜잭션 B가 `[p2, p1]` 순서로 동시에 락을 걸면 서로가 서로의 완료를 기다리는 순환 대기(진짜 데드락, 언젠간 풀리는 단순 블로킹이 아님)가 생김 — Postgres가 감지해서 한쪽을 강제 실패시킴. 항상 같은 순서로 락을 걸면 이 순환 자체가 원천적으로 불가능해짐. `reserve`/`release` 둘 다 적용(액션 종류와 무관하게 같은 테이블 행에 락을 거는 이상 동일하게 필요).
- **현재 한계**: `commands.inventory`의 `items`가 오케스트레이터에서 항상 빈 배열로 하드코딩되어 있어서(`saga.py` 참고), 지금은 `RESERVE`가 항상 성공(`RESERVED`)함 — `OUT_OF_STOCK` 경로는 아직 실증 못 함. 나중에 오케스트레이터가 실제 `product_id`/수량을 채워 보내려면, 그 UUID를 오케스트레이터가 어디서 알아내는지(재고 조회를 오케스트레이터가 대신 서빙할지, inventory-service에 직접 물어볼지)를 정해야 함 — `GET /products` 설계와 맞물린 열린 질문.
- **볼륨 이름 변경 주의사항**: `postgres` 서비스를 `order-postgres`로 리네이밍하면서 볼륨명도 `postgres_data` → `order_postgres_data`로 바뀜 → Docker는 이름이 다르면 완전히 새 볼륨으로 취급해서, 기존 `orders` 테이블이 있던 데이터가 안 보이는 문제 발생(`UndefinedTableError`). 서비스/볼륨 이름을 바꾸면 새 볼륨에 마이그레이션을 다시 적용해야 함. 안 쓰는 옛 볼륨(`docker volume ls`로 확인)은 정리 필요.

### 프론트엔드 실행 순서 (예광탄 방식 적용)

`docs/superpowers/plans/2026-08-18-order-pipeline-frontend.md`의 태스크 내용/코드는 그대로 목표로 유지하되, 실행 순서는 "가장 얇은 end-to-end 흐름부터"로 진행한다:

1. **1차 (walking skeleton) — 완료**: 주문 생성 → SSE로 상태 텍스트가 실시간으로 바뀌는 것까지만. 재고부족/결제실패/재시도/DLQ/운영 대시보드/스타일링/라우팅 없음. 산출물: `src/types/order.ts`, `mock-server/`(성공 경로만, CORS 포함), `src/lib/api.ts`(fetchOrder/createOrder만), `src/hooks/useOrderStream.ts`(status만), `src/App.tsx`
2. **2차 — 완료**: 상태 머신 시각화(`OrderTimeline`), 주문 목록/생성 페이지, 라우팅(react-router) 정식 구현. 아래 "wave 2 상세" 참고
3. **3차 — 완료**: mock 서버에 재고부족·결제실패·재시도·DLQ 시뮬레이션 추가. 아래 "wave 3 상세" 참고
4. **4차 — 완료**: 운영 대시보드(`useOpsStream`, `EventLogTable`, `MetricTile`). 아래 "wave 4 상세" 참고
5. **5차 — 완료**: SSE 재연결(Last-Event-ID) 복구. 아래 "wave 5 상세" 참고. lint(`oxlint`)/빌드/전체 테스트(51개) 통과 확인 — 계획된 프론트엔드 5개 wave 전부 완료

### wave 1에서 계획 문서와 달라진 점 (참고용)

- `useOrderStream`은 계획의 `events: SagaEvent[]`를 아직 반환하지 않음 (현재 상태만 필요해서 생략, 필요해지면 추가)
- mock 서버에 계획에 없던 CORS 미들웨어 추가 필요 — 브라우저 fetch/EventSource가 다른 origin(5173 ↔ 4000)이라 막혔던 걸 발견하고 수정함
- 루트 `.gitignore`의 Python용 `lib/` 규칙이 `frontend/src/lib/`을 오탐지해서 예외 처리 추가함

### wave 2 상세 (상태 시각화 + 페이지 + 라우팅, 2026-08-31)

wave 1이 각 파일을 얇게(상태값만, 성공 경로만) 구현해뒀던 걸, 계획 문서의 Task 3/5/6/8/10/11/13 범위로 완성함. Task 4(mock 서버 전체 실패 시뮬레이션)·7/9/12(운영 대시보드)는 계획대로 wave 3~4로 계속 미룸.

- **`types/order.ts`**: wave 1엔 `OrderStatus`(11개)만 있었는데, 실제론 이미 `SagaEvent`/`OrderItem`/`OrderHistoryEntry`/`Order`/`OpsSummary`/`isTerminalStatus`/`isFailureStatus`까지 다 구현되어 있었음 (계획 대비 가장 적게 남은 파일이었음). `PAYMENT_FAILED`, `COMPENSATING_INVENTORY` 두 값만 추가해 13개로 완성.
- **`lib/api.ts`**: `fetchProducts`, `fetchOrders`, `fetchOpsSummary` 추가 (`fetchOrder`/`createOrder`는 wave 1 그대로).
- **`useOrderStream` 버그 수정**: `initialStatus`를 `useState`의 초기값으로만 받다 보니, `OrderDetailPage`처럼 REST 쿼리(`fetchOrder`)가 비동기로 나중에 완료되는 경우 그 값을 훅이 영영 못 받아 "불러오는 중..."에서 멈추는 문제 발견. `useEffect`로 `initialStatus`가 바뀔 때 `status`가 아직 `null`이면(=SSE로 아직 아무 이벤트도 못 받았으면) 그 값을 채우도록 수정 — SSE가 이미 더 앞서갔으면 덮어쓰지 않음.
- **`OrderTimeline` 버그 수정**: 원래 계획 코드의 `stepState`가 `STEPS`(핵심 5단계)에 없는 중간 상태(`INVENTORY_RESERVED`, `PAID`, `PAYMENT_FAILED` 등)를 만나면 진행 표시가 순간적으로 뒤로 되돌아가 보이는 문제가 있어서, 전체 13개 상태를 단계 번호로 매핑하는 `STAGE_INDEX`를 추가해 해결. `CANCELLED`는 별도 분기로 "완료"만 `pending`, 나머지는 전부 `done`으로 처리(완료를 거짓으로 활성 표시하지 않기 위함).
- **고객용 `FAILURE_LABELS` 문구**: 브레인스토밍에서 "고객에게 내부 사가 용어를 보여줄 필요 없다"는 논의 끝에, `COMPENSATING_INVENTORY`를 "재고 복구 중"이 아니라 "주문을 취소 처리하고 있습니다"로, `PAYMENT_FAILED`는 배너 자체를 생략(재시도/DLQ 결정 직전 찰나라 깜빡임 방지)하기로 결정. 이 매핑은 `/ops`(기술적 세부사항 그대로 노출)와 고객용 화면의 표시 방식이 의도적으로 다르다는 설계 원칙의 실제 적용 사례.
- **`NewOrderPage`의 `createOrder` 테스트**: `@tanstack/react-query` v5.101+에서 `mutationFn`이 실제 인자 외에 내부 컨텍스트 객체를 두 번째 인자로 같이 넘기도록 바뀜(계획 작성 시점엔 없던 동작) — 테스트의 `toHaveBeenCalledWith` 두 번째 인자를 `expect.anything()`으로 완화해서 라이브러리 내부 구현 세부사항에 안 얽매이게 함.
- **`/ops` 라우트는 얇은 스텁**(`OpsDashboardPage` — "준비 중입니다")으로 먼저 걸어 라우팅 트리를 완성, 실제 로직은 wave 4에서 채움.
- **mock 서버에 `GET /products`, `GET /orders`(목록) 추가** — wave 1엔 `POST /orders`/`GET /orders/:id`/SSE만 있어서 새로 만든 `OrderListPage`/`NewOrderPage`가 실제로 못 돌아갔음. 재시도/DLQ 시뮬레이션(Task 4 전체)은 여전히 wave 3으로 미루고, 지금 두 페이지가 필요로 하는 최소 엔드포인트만 추가. 상품 시드는 스펙 6절 데모 시나리오 그대로(`한정판 스니커즈` 재고 1개).
- **브라우저로 직접 확인**: `POST /orders` → 상세 페이지 타임라인이 실시간으로 CREATED~COMPLETED까지 진행, 목록 페이지에 반영되는 것까지 확인함.

### wave 3 상세 (mock 서버 실패 시뮬레이션, 2026-08-31)

계획 문서 Task 4의 재고/결제 시뮬레이션 로직을 `mock-server/server.mjs`에 반영. `GET /ops/summary`, `GET /sse/ops`, Last-Event-ID 리플레이는 Task 4에 같이 있지만 실제로 소비하는 코드(운영 대시보드)가 아직 없어서 계속 wave 4/5로 미룸 — 지금 만든 건 재고부족/결제실패/재시도/DLQ/보상 트랜잭션 경로뿐.

- **`FAILING_CARD_NUMBER`/`LOW_STOCK_PRODUCT_ID` export**, 상품 시드를 스펙 6절 그대로(`p1` 재고 50, `p2`=`한정판 스니커즈` 재고 1) 정리.
- **결제 재시도 로직**: 매 시도마다 `card_number === FAILING_CARD_NUMBER`(결정론적 100% 실패) 또는 10% 랜덤 실패로 판정. 실패 시 `PAYMENT_FAILED` → (`attempt < 3`이면 `RETRYING_PAYMENT`, `attempt === 3`이면 바로 `PAYMENT_FAILED_DLQ`) — 오케스트레이터 `saga.py`와 동일한 분기 구조.
- **계획 코드에 있던 버그 발견 및 수정 (보상 트랜잭션 미실행)**: 원래 계획의 `runSaga`는 `COMPENSATING_INVENTORY` 단계로 전이만 시킬 뿐 실제로 `product.stock`을 되돌리는 코드가 없었음 — 결제 실패 데모를 반복할수록 mock 재고가 영구히 줄어드는 버그. `PAYMENT_FAILED_DLQ → COMPENSATING_INVENTORY` 전이 시 `product.stock += item.quantity`를 실행하도록 추가해 실제 백엔드의 `RELEASE` 커맨드와 동일한 의미를 갖게 함 (테스트로 재고가 원상복구되는 것 검증).
- **계획 코드에 있던 타이밍 버그 발견 및 수정 (재고부족 배너가 안 보임)**: `INVENTORY_FAILED`와 곧바로 이어지는 `CANCELLED` 사이에 `delay`가 없어서 두 SSE 이벤트가 거의 동시에 도착 — 브라우저에서 "재고가 부족합니다" 배너가 그려질 틈도 없이 "주문이 취소되었습니다"로 건너뛰어 보이는 문제를 사용자가 직접 발견함. 두 이벤트 사이에 `stepDelayMs`만큼 `delay` 추가로 해결.
- **브라우저로 직접 확인**: 정상 완주, 랜덤 10% 재시도 후 성공(정상 카드로도 가끔 재시도 배너가 떴다 사라지는 게 스펙 6절의 의도된 "배경 노이즈"임을 확인), 재고부족(`재고가 부족합니다` → `주문이 취소되었습니다`), 결정론적 결제 실패 카드로 재시도 2회 → DLQ → 보상 트랜잭션 → 취소까지 전체 체인 전부 확인함.

### 프론트엔드 계획 문서를 실제 백엔드(13개 상태)에 맞춰 보정 (2026-08-31)

프론트 wave 2 시작 전, 계획 문서의 `OrderStatus`가 11개로 기술되어 있어 실제 백엔드(13개 — `PAYMENT_FAILED`, `COMPENSATING_INVENTORY` 누락)와 어긋나 있던 걸 발견해 수정함:
- Global Constraints, `types/order.ts`의 `OrderStatus` 타입에 13개 값 모두 반영
- mock 서버 DLQ 시뮬레이션이 `PAYMENT_FAILED`/`COMPENSATING_INVENTORY` 중간 단계 없이 곧장 다음 상태로 건너뛰던 걸, 실제 백엔드처럼 두 단계를 거치도록 수정
- **고객용 `OrderTimeline`과 운영 대시보드는 상태를 보여주는 방식이 다르다**는 설계 결정을 명시적으로 문서화함: `/ops`는 13개 상태를 있는 그대로 노출(observability 목적)하지만, 고객용 타임라인은 정상 흐름 4단계(재고 확인/결제 처리/알림 발송/완료)를 항상 유지하고, 예외 상태만 순화된 배너 문구로 추가 노출 — `COMPENSATING_INVENTORY`("주문을 취소 처리하고 있습니다")처럼 내부 사가 용어(보상 트랜잭션 등)를 고객에게 그대로 노출하지 않음. `PAYMENT_FAILED`는 재시도/DLQ 결정 직전의 찰나의 상태라 배너 자체를 생략(깜빡임 방지).
- `isFailureStatus`/`FAILURE_STATUSES`는 계획 문서 어디에서도 실제로 소비되지 않는 미사용 유틸임을 확인 — 운영 대시보드 통계(`useOpsStream`)는 이 함수를 안 쓰고 특정 상태값을 직접 비교해서 집계함. 지금은 그대로 두고, 나중에 이 유틸을 실제로 쓰는 코드가 생길 때 그 맥락에서 어떤 상태를 "실패"로 볼지 결정하기로 함.

### wave 4 상세 (운영 대시보드, 2026-09-01)

계획 문서 Task 7(`useOpsStream`)/9(`EventLogTable`+`MetricTile`)/12(`OpsDashboardPage`) 완성 + mock 서버에 `GET /ops/summary`, `GET /sse/ops` 추가. Last-Event-ID 리플레이(재연결 복구)는 여전히 wave 5로 미룸.

- **`useOpsStream` 버그를 구현 전에 미리 발견하고 수정**: 계획 코드가 `OpsDashboardPage`에서 `useOpsStream(data ?? EMPTY_SUMMARY)`처럼 비동기 REST 쿼리 결과를 넘기는데, 훅 내부가 `useState(initialSummary)`로만 받아서 `OrderDetailPage` 때와 똑같은 버그(REST 응답이 늦게 도착하면 훅이 영영 못 받음)가 날 걸 미리 알아채 수정함. `hasReceivedEvent` ref로 "SSE가 이미 집계를 진행시켰는지"를 추적해서, 진행 중이면 뒤늦은 `initialSummary`가 덮어쓰지 않게 방어(useOrderStream의 `prev ?? initialStatus` 패턴과 같은 목적이지만, summary는 객체라 항상 truthy라 그 패턴을 못 쓰고 별도 플래그로 구현).
- **mock 서버**: `recordEvent`가 주문별 구독자(`orderSubscribers`)뿐 아니라 전체 구독자(`opsSubscribers`)에게도 필터링 없이 브로드캐스트하도록 확장 (`sendEvent` 헬퍼로 중복 제거). `GET /ops/summary`는 현재 주문 스냅샷을 집계해서 반환.
- **브라우저로 직접 확인**: `/ops` 초기 진입 시 통계 0으로 하이드레이션, 주문 생성/실패 시나리오가 실시간으로 통계 타일과 이벤트 로그에 반영되는 것까지 확인함.

### wave 5 상세 (SSE 재연결, 2026-09-01)

- **프론트엔드 쪽엔 재연결 코드가 필요 없음**: 브라우저 `EventSource`는 연결이 끊기면 자동 재시도하고, 서버가 `id:` 필드를 보낸 이벤트를 받은 적 있으면 재연결 시 `Last-Event-ID` 헤더를 자동으로 실어 보냄 (네이티브 스펙 동작). 우리 서버는 처음부터 `id: ${event_id}`를 보내고 있었으니, 서버가 그 헤더를 읽어서 놓친 이벤트를 되돌려주기만 하면 됨.
- **mock 서버**: 전체 이벤트를 순서대로 담아두는 `eventLog` 배열 추가, `replayFrom(lastEventId)`로 그 이후 이벤트만 골라내는 함수 구현. `/sse/orders/:orderId`(주문별로 필터링), `/sse/ops`(필터링 없이 전체) 둘 다 연결 직후 `req.get("Last-Event-ID")`를 확인해 놓친 이벤트를 즉시 재전송하도록 연결.
- **테스트 방법이 특이함**: SSE는 응답이 끝나지 않는 스트림이라, `supertest`의 "응답 완료까지 기다렸다가 검증" 방식이 안 맞음. `http.get()`으로 실제 임시 포트에 붙어서 일정 시간만 받고 연결을 끊는 `collectSSE` 헬퍼를 만들어, "사가 진행 중 잠깐 붙었다 끊기 → 완주할 때까지 대기 → Last-Event-ID로 재연결" 시나리오를 검증함.
- 이걸로 계획된 프론트엔드 5개 wave(walking skeleton → 상태 시각화/페이지/라우팅 → 실패 시뮬레이션 → 운영 대시보드 → 재연결)가 전부 끝남. lint/빌드/전체 테스트(13개 파일, 51개 테스트) 통과 확인.

## 백엔드 설계 결정

- **서비스 간 이벤트 스키마는 공유 패키지로 묶지 않는다.** 4개 서비스(`order-saga-orchestrator`, `inventory-service`, `payment-service`, `notification-service`)는 서로의 코드를 전혀 모른다. Kafka 토픽별 메시지 스키마는 spec 문서에 문서화하고, 각 서비스가 그 문서를 보고 각자 Pydantic 모델을 독립적으로 정의한다.
  - **이유**: 공유 라이브러리는 DRY는 지키지만, 서비스 간 배포를 암묵적으로 묶어버려서(distributed monolith 위험) 마이크로서비스의 핵심 이점(독립 배포 가능성)을 해친다. 이 프로젝트는 DRY보다 결합도 최소화를 우선한다.
  - **적용 범위**: Python 코드(Pydantic 모델, 공용 함수 등) 공유 금지. 문서(마크다운 스펙)는 당연히 공유해야 함 — 공유하면 안 되는 건 "코드", 공유해야 하는 건 "계약에 대한 합의".
- **결제 최종 실패 시 재고를 보상 트랜잭션으로 되돌린다.** `commands.inventory`에 `action: RESERVE | RELEASE` 필드를 추가(스펙 2.1절). 원래 스펙엔 없다가, "왜 orchestrator에 saga라는 이름이 붙었나" 논의 중 발견한 누락 — Saga 패턴의 핵심인 보상 트랜잭션이 빠져있으면 재고 누수 버그가 생김.
- **`order-saga-orchestrator`의 주문 저장소를 인메모리 → PostgreSQL로 전환 완료 (2026-08-26~29).** 실제 상용 환경을 염두에 둔 실습을 원해서, DB 없이 가는 원래 방향(YAGNI)에서 전환함. 스택: PostgreSQL + SQLAlchemy 2.0(async) + asyncpg + Alembic(마이그레이션) — FastAPI+Postgres 조합의 실무 표준. `SQLModel`도 후보였으나 SQLAlchemy+Alembic이 더 널리 쓰이는 조합이라 이쪽으로 결정.
  - **"DB가 스키마를 주도"(database-first, `sqlacodegen`으로 모델 역생성) 방식도 검토했으나 기각.** 그 방식은 여러 언어/팀이 하나의 DB를 공유할 때 유효한데, 이 프로젝트는 DB를 오케스트레이터 하나만 쓰는 database-per-service라 근거가 약함. Alembic(코드가 스키마를 주도) 쪽이 실무 표준이자 이 프로젝트 원칙과 일관됨.
  - **스코프**: 이번엔 오케스트레이터의 주문 저장소만 DB로 옮김. `inventory-service`(아직 미구현)의 재고는 당분간 인메모리로 시작하고, 필요해지면 database-per-service 원칙대로 자기만의 별도 DB를 갖는 방향으로 나중에 확장.
  - **모델링 세부 결정**: `OrderStatus` enum은 순환참조 방지를 위해 `orders.py`가 아니라 `models.py`에 정의(`orders.py`가 이걸 import). `OrderModel.status`는 SQLAlchemy 네이티브 Enum이 아니라 그냥 `Mapped[str]`로 — 상태값을 자주 추가해온 프로젝트라(재시도/DLQ/알림 단계 등), 네이티브 ENUM이면 값 추가마다 `ALTER TYPE` 마이그레이션이 필요해서 부담됨. `OrderModel.id`는 `Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True)` — DB엔 네이티브 UUID로 저장(공간 효율/형식 검증)하면서 Python 쪽엔 여전히 `str`로 받아서 기존 코드 변경 없음.
  - **Alembic 관련 실전 팁**: `alembic init -t async <dir>`을 로컬(호스트, `uv` 있으면)에서 실행 — DB 접속이 필요 없는 순수 스캐폴딩이라 Docker와 무관하게 처리 가능하고 `-t async`면 비동기 엔진용 `env.py`가 이미 마련됨. 생성된 `alembic.ini`/`alembic/`은 `docker-compose.yaml`에 마운트 추가해서 컨테이너(`docker compose exec`)가 보게 함 — `postgres` 같은 도커 네트워크 전용 호스트명 때문에 실제 마이그레이션 생성/적용 명령 자체는 컨테이너 안에서 실행해야 함. 마이그레이션을 앱 시작 시 자동 실행하게 하지 않음(여러 인스턴스 동시 기동 시 경합 위험) — `docker compose exec`로 수동 실행하는 별도 단계로 분리.
  - **세션 관리는 `db.py`의 `get_session()`(`@asynccontextmanager`)이 전담** — "Unit of Work" 패턴. 정상 종료 시 `commit()`, 예외 시 `rollback()` 후 재발생. `orders.py`의 각 함수(`create_order`/`get_order`/`update_status`)가 이걸로 자기 세션을 직접 열고 닫아서, 호출부(`main.py`, `saga.py`)는 세션 존재 자체를 몰라도 됨 — FastAPI `Depends()` 기반 요청별 세션 주입 대신 택한 더 단순한 방식(이 프로젝트 규모엔 이 정도로 충분).
  - **백그라운드 컨슈머 스레드에서 async DB 함수를 호출하는 문제**: `saga.py`의 Kafka 컨슈머는 동기 스레드에서 도는데, `orders.update_status()` 등은 이제 `async def`라 직접 호출 불가. `asyncio.run_coroutine_threadsafe(coro, loop).result()`로 해결 — 코루틴을 메인 이벤트 루프에 맡기고 끝날 때까지 블로킹 대기(결과/예외를 그대로 돌려받아야 해서, "결과 신경 안 씀"용인 `call_soon_threadsafe`(SSE pub/sub에서 씀)와는 다른 도구). 이벤트 루프 참조(`loop`)는 `producer`처럼 `main.py`의 `lifespan`에서 `consume_events`에 인자로 명시적으로 전달.
  - **컨테이너 재시작 후에도 주문 상태가 유지되는 것 확인 완료** — 이번 전환의 핵심 목표(영속성)가 처음으로 증명됨.

## 백로그 (나중에 실습해볼 것)

- **Kafka 스키마 계약을 더 엄격하게 관리하는 방법 실습**. 지금은 스펙 문서(마크다운)에 메시지 스키마를 적어두고 각 서비스가 독립적으로 구현하는 1단계 방식만 쓴다. 여러 사람이 협업하는 상황을 가정하면 실무에선 더 엄격한 단계들이 있고, 이걸 프로젝트 후반부에 선택적으로 실습해보고 싶어함:
  1. 문서만 (현재 방식)
  2. 리포에 JSON Schema/Avro 같은 **기계가 읽는 스키마 파일**을 커밋하고, 각 서비스가 런타임에 메시지를 그 스키마로 검증
  3. **Confluent Schema Registry** 같은 중앙 스키마 레지스트리 — producer/consumer가 스키마를 자동으로 등록/검증하고, 하위·상위 호환성을 깨는 배포를 자동으로 막아줌
  4. **컨트랙트 테스트** (Pact 등) — 컨슈머가 "나는 이런 메시지를 기대한다"는 테스트를 작성해두고 CI에서 프로듀서 쪽 변경이 이를 깨는지 자동 검증
  - **진행 방식**: 이건 MVP 범위가 아니라 나중에 시간 남으면 하는 선택적 확장. 실습할 때가 되면 지침 8번대로 먼저 `docs/superpowers/specs`에 작은 스펙을 쓰고 시작한다.
