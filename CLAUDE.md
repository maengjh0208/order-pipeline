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
10. **커밋은 사용자가 직접 한다** (2026-08-19 변경). Claude Code는 `git add`/`git commit`을 실행하지 않고, 변경 사항이 준비되면 커밋 메시지만 추천한다.

## 브랜치 전략 (2026-08-19 변경)

- **그냥 `main` 하나로 작업한다.** feature 브랜치를 새로 만들지 않는다.
- (이전엔 `feature/order-pipeline-frontend`, `feature/order-saga-orchestrator`로 나눠 작업했었음 — 브랜치 전환이 혼란스러워서 단순화함. 두 브랜치 모두 이미 main에 병합 완료, 로컬에 남은 브랜치 자체는 안 지워도 무해함.)

## 현재 진행 상황

- [x] 아키텍처 브레인스토밍 및 spec 확정 (Orchestration 기반 Saga, 상태 머신, API/SSE 계약)
- [x] 프론트엔드 구현 계획 작성
- [x] Notion에 요구사항/설계 문서 정리 (mermaid 다이어그램 포함)
- [x] 프론트엔드 wave 1 (walking skeleton) 완료 — `feature/order-pipeline-frontend` 브랜치, 브라우저에서 주문 생성 → SSE로 상태가 실시간 갱신되는 것까지 확인함
- [ ] 프론트엔드 wave 2~5 — 아래 "실행 순서" 참고
- [x] `order-saga-orchestrator` 백엔드 wave 1 (walking skeleton) 완료 — FastAPI `/health` 엔드포인트, uv(src 레이아웃), Dockerfile + `docker-compose.yaml`(src 볼륨 마운트로 핫리로드).
- [x] `order-saga-orchestrator` 백엔드 wave 2 (Kafka 연결 증명) 완료 — 아래 "wave 2 상세" 참고. producer/consumer 둘 다 컨테이너 안 FastAPI 앱에서 직접 동작 확인함.
- [x] `order-saga-orchestrator` 백엔드 wave 3 (핵심 사가 로직) 완료 — 아래 "wave 3 상세" 참고. 주문 생성 → 재고 예약 → 결제(성공/실패) → 재시도(최대 3회) → DLQ 적재 → 재고 보상 트랜잭션 → 취소, 전체 사가가 SSE로 실시간 관측되는 것까지 end-to-end 확인함. `/_debug/produce`는 삭제함.
  - [x] `POST /orders`, `GET /orders/{id}` — 스펙 4절 계약대로
  - [x] `GET /sse/orders/{order_id}` — 스펙 4절 계약대로
  - [ ] `GET /orders`(목록), `GET /products`, `GET /ops/summary`, `GET /sse/ops` — 아직 미구현
  - [x] 주문/사가 상태를 들고 있는 저장소 (인메모리, `orders.py`)
  - [x] 컨슈머가 `events.inventory` + `events.payment`를 함께 구독, 받은 이벤트로 실제 상태 머신(스펙 3절)을 진행시키는 로직 (`saga.py`)
- [x] 알림(`commands.notification`/`events.notification`, `PAID` → `NOTIFYING` → `COMPLETED`) 완료 — 스펙 3절 상태 머신이 이제 전부 구현됨 (`CREATED`부터 `COMPLETED`/`CANCELLED`까지 모든 경로)
- [ ] `inventory-service`, `payment-service`, `notification-service` — 아직 시작 안 함. 이 워커 서비스들은 REST/FastAPI가 필요 없음 — Kafka `commands.*` 구독 + `events.*` 발행만 하는 단순 Python 프로세스로 충분 (스펙 2절: 서로 직접 모르고 커맨드/이벤트로만 소통). 지금까지는 이 서비스들이 없어서 Kafka UI로 응답 이벤트를 수동 발행해 오케스트레이터 로직을 검증해왔음
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

### 프론트엔드 실행 순서 (예광탄 방식 적용)

`docs/superpowers/plans/2026-08-18-order-pipeline-frontend.md`의 태스크 내용/코드는 그대로 목표로 유지하되, 실행 순서는 "가장 얇은 end-to-end 흐름부터"로 진행한다:

1. **1차 (walking skeleton) — 완료**: 주문 생성 → SSE로 상태 텍스트가 실시간으로 바뀌는 것까지만. 재고부족/결제실패/재시도/DLQ/운영 대시보드/스타일링/라우팅 없음. 산출물: `src/types/order.ts`, `mock-server/`(성공 경로만, CORS 포함), `src/lib/api.ts`(fetchOrder/createOrder만), `src/hooks/useOrderStream.ts`(status만), `src/App.tsx`
2. **2차**: 상태 머신 시각화(`OrderTimeline`), 주문 목록/생성 페이지, 라우팅(react-router) 정식 구현
3. **3차**: mock 서버에 재고부족·결제실패·재시도·DLQ 시뮬레이션 추가
4. **4차**: 운영 대시보드(`useOpsStream`, `EventLogTable`, `MetricTile`)
5. **5차**: SSE 재연결(Last-Event-ID) 복구, 테스트 보강, 마무리

### wave 1에서 계획 문서와 달라진 점 (참고용)

- `useOrderStream`은 계획의 `events: SagaEvent[]`를 아직 반환하지 않음 (현재 상태만 필요해서 생략, 필요해지면 추가)
- mock 서버에 계획에 없던 CORS 미들웨어 추가 필요 — 브라우저 fetch/EventSource가 다른 origin(5173 ↔ 4000)이라 막혔던 걸 발견하고 수정함
- 루트 `.gitignore`의 Python용 `lib/` 규칙이 `frontend/src/lib/`을 오탐지해서 예외 처리 추가함

### wave 3 시작 전 처리할 것

- 스펙 3절에 `PAYMENT_FAILED_DLQ → COMPENSATING_INVENTORY → CANCELLED`로 보상 트랜잭션 단계가 추가됨(재고 예약 해제). `docs/superpowers/plans/2026-08-18-order-pipeline-frontend.md`의 `OrderStatus` 타입(현재 11개로 기술됨)에 `COMPENSATING_INVENTORY`를 12번째로 추가해야 함 — Task 3 코드 블록, Global Constraints, `OrderTimeline`의 실패 라벨 매핑까지 같이 반영. mock 서버(Task 4)의 DLQ 시뮬레이션 로직도 이 단계를 거치도록 수정 필요.

## 백엔드 설계 결정

- **서비스 간 이벤트 스키마는 공유 패키지로 묶지 않는다.** 4개 서비스(`order-saga-orchestrator`, `inventory-service`, `payment-service`, `notification-service`)는 서로의 코드를 전혀 모른다. Kafka 토픽별 메시지 스키마는 spec 문서에 문서화하고, 각 서비스가 그 문서를 보고 각자 Pydantic 모델을 독립적으로 정의한다.
  - **이유**: 공유 라이브러리는 DRY는 지키지만, 서비스 간 배포를 암묵적으로 묶어버려서(distributed monolith 위험) 마이크로서비스의 핵심 이점(독립 배포 가능성)을 해친다. 이 프로젝트는 DRY보다 결합도 최소화를 우선한다.
  - **적용 범위**: Python 코드(Pydantic 모델, 공용 함수 등) 공유 금지. 문서(마크다운 스펙)는 당연히 공유해야 함 — 공유하면 안 되는 건 "코드", 공유해야 하는 건 "계약에 대한 합의".
- **결제 최종 실패 시 재고를 보상 트랜잭션으로 되돌린다.** `commands.inventory`에 `action: RESERVE | RELEASE` 필드를 추가(스펙 2.1절). 원래 스펙엔 없다가, "왜 orchestrator에 saga라는 이름이 붙었나" 논의 중 발견한 누락 — Saga 패턴의 핵심인 보상 트랜잭션이 빠져있으면 재고 누수 버그가 생김.
- **`order-saga-orchestrator`의 주문 저장소를 인메모리 → PostgreSQL로 전환 (2026-08-26 결정, 진행 중).** 실제 상용 환경을 염두에 둔 실습을 원해서, DB 없이 가는 원래 방향(YAGNI)에서 전환함. 스택: PostgreSQL + SQLAlchemy 2.0(async) + asyncpg + Alembic(마이그레이션) — FastAPI+Postgres 조합의 실무 표준. `SQLModel`도 후보였으나 SQLAlchemy+Alembic이 더 널리 쓰이는 조합이라 이쪽으로 결정.
  - **"DB가 스키마를 주도"(database-first, `sqlacodegen`으로 모델 역생성) 방식도 검토했으나 기각.** 그 방식은 여러 언어/팀이 하나의 DB를 공유할 때 유효한데, 이 프로젝트는 DB를 오케스트레이터 하나만 쓰는 database-per-service라 근거가 약함. Alembic(코드가 스키마를 주도) 쪽이 실무 표준이자 이 프로젝트 원칙과 일관됨.
  - **스코프**: 이번엔 오케스트레이터의 주문 저장소만 DB로 옮김. `inventory-service`(아직 미구현)의 재고는 당분간 인메모리로 시작하고, 필요해지면 database-per-service 원칙대로 자기만의 별도 DB를 갖는 방향으로 나중에 확장.
  - **예광탄 순서**: (1) `docker-compose.yaml`에 `postgres`(healthcheck 포함) 추가 + 연결 증명 — 완료 → (2) SQLAlchemy async 엔진/세션(`db.py`) + Alembic 초기 마이그레이션(`orders` 테이블, `models.py`) — 완료 → (3) `orders.py`의 저장소 함수를 실제 쿼리로 교체(`async def`로 전환) → (4) `main.py` 라우트도 `async def` + DB 세션 의존성 주입으로 전환 → (5) 컨테이너 재시작 후에도 주문이 조회되는지 확인 (첫 영속성 증명)
  - **모델링 세부 결정**: `OrderStatus` enum은 순환참조 방지를 위해 `orders.py`가 아니라 `models.py`에 정의(`orders.py`가 이걸 import). `OrderModel.status`는 SQLAlchemy 네이티브 Enum이 아니라 그냥 `Mapped[str]`로 — 상태값을 자주 추가해온 프로젝트라(재시도/DLQ/알림 단계 등), 네이티브 ENUM이면 값 추가마다 `ALTER TYPE` 마이그레이션이 필요해서 부담됨. `OrderModel.id`는 `Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True)` — DB엔 네이티브 UUID로 저장(공간 효율/형식 검증)하면서 Python 쪽엔 여전히 `str`로 받아서 기존 코드 변경 없음.
  - **Alembic 관련 실전 팁**: `alembic init -t async <dir>`을 로컬(호스트, `uv` 있으면)에서 실행 — DB 접속이 필요 없는 순수 스캐폴딩이라 Docker와 무관하게 처리 가능하고 `-t async`면 비동기 엔진용 `env.py`가 이미 마련됨. 생성된 `alembic.ini`/`alembic/`은 `docker-compose.yaml`에 마운트 추가해서 컨테이너(`docker compose exec`)가 보게 함 — `postgres` 같은 도커 네트워크 전용 호스트명 때문에 실제 마이그레이션 생성/적용 명령 자체는 컨테이너 안에서 실행해야 함. 마이그레이션을 앱 시작 시 자동 실행하게 하지 않음(여러 인스턴스 동시 기동 시 경합 위험) — `docker compose exec`로 수동 실행하는 별도 단계로 분리.

## 백로그 (나중에 실습해볼 것)

- **Kafka 스키마 계약을 더 엄격하게 관리하는 방법 실습**. 지금은 스펙 문서(마크다운)에 메시지 스키마를 적어두고 각 서비스가 독립적으로 구현하는 1단계 방식만 쓴다. 여러 사람이 협업하는 상황을 가정하면 실무에선 더 엄격한 단계들이 있고, 이걸 프로젝트 후반부에 선택적으로 실습해보고 싶어함:
  1. 문서만 (현재 방식)
  2. 리포에 JSON Schema/Avro 같은 **기계가 읽는 스키마 파일**을 커밋하고, 각 서비스가 런타임에 메시지를 그 스키마로 검증
  3. **Confluent Schema Registry** 같은 중앙 스키마 레지스트리 — producer/consumer가 스키마를 자동으로 등록/검증하고, 하위·상위 호환성을 깨는 배포를 자동으로 막아줌
  4. **컨트랙트 테스트** (Pact 등) — 컨슈머가 "나는 이런 메시지를 기대한다"는 테스트를 작성해두고 CI에서 프로듀서 쪽 변경이 이를 깨는지 자동 검증
  - **진행 방식**: 이건 MVP 범위가 아니라 나중에 시간 남으면 하는 선택적 확장. 실습할 때가 되면 지침 8번대로 먼저 `docs/superpowers/specs`에 작은 스펙을 쓰고 시작한다.
