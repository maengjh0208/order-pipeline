# order-pipeline

이벤트 기반 비동기 주문 처리 시스템 — Kafka 기반 **Saga Orchestration** 실습 프로젝트.

주문 하나가 재고 예약 → 결제 → 알림을 거쳐 완료되고, 중간에 실패하면 **보상 트랜잭션**으로
이전 단계를 되돌린다. 결제 실패는 최대 3회 재시도하고, 소진되면 DLQ에 적재한 뒤 재고를 복구한다.

## 아키텍처

```
[React 프론트]
   │  REST(주문 생성/조회) + SSE(실시간 상태 구독)
   ▼
[order-saga-orchestrator]  ── commands.* ──▶  [inventory-service]   재고 예약/해제 (PostgreSQL, 원자적 UPDATE)
  FastAPI + PostgreSQL     ◀── events.*  ──   [payment-service]     결제 (PaymentProvider 추상화, mock)
  사가 상태 머신 보유                          [notification-service] 알림 발송
                          ── dlq.payment ─▶  (결제 3회 실패 시 원본 이벤트 적재)
```

- **Orchestration 방식**: 중앙 오케스트레이터가 각 서비스에 커맨드를 보내고 응답 이벤트로 다음 단계를 결정.
  사가 상태가 한 곳에 모여 프론트가 구독할 "단일 상태 소스"가 명확함.
- **database-per-service**: 오케스트레이터와 inventory-service가 각자 별도 PostgreSQL.
- **서비스 간 코드 공유 없음**: 4개 서비스는 서로의 코드를 모른다. Kafka 메시지 스키마는 스펙 문서로만 합의하고
  각자 독립적으로 Pydantic 모델을 정의 (distributed monolith 회피).

상세 설계: [`docs/superpowers/specs/2026-08-18-order-pipeline-design.md`](docs/superpowers/specs/2026-08-18-order-pipeline-design.md)

## 상태 머신

```
CREATED → INVENTORY_RESERVING
  ├─ INVENTORY_RESERVED → PAYMENT_PROCESSING
  │    ├─ PAID → NOTIFYING → COMPLETED
  │    └─ PAYMENT_FAILED → RETRYING_PAYMENT (1/3 → 2/3 → 3/3)
  │         ├─ PAID (재시도 중 성공)
  │         └─ PAYMENT_FAILED_DLQ → COMPENSATING_INVENTORY → CANCELLED
  └─ INVENTORY_FAILED → CANCELLED   (재고부족: 재시도 무의미, 즉시 종결)
```

재고부족과 결제실패를 **비대칭**으로 처리하는 것이 핵심 설계 포인트 — 재고부족은 재시도해도 결과가
같으므로 즉시 취소, 결제실패만 일시적 오류로 보고 재시도 대상.

## 기술 스택

| 영역 | 스택 |
|---|---|
| 메시징 | Apache Kafka (KRaft), confluent-kafka-python |
| 서비스 | FastAPI, SQLAlchemy 2.0 (async), asyncpg, Alembic |
| 프론트 | Vite + React + TypeScript, TanStack Query, SSE (EventSource) |
| 인프라 | Docker Compose |

## 실행

```bash
docker compose up -d --build

# Kafka 토픽이 없으면 (새 볼륨으로 처음 뜰 때) 생성 후 서비스 재시작
for t in commands.inventory events.inventory commands.payment events.payment \
         commands.notification events.notification dlq.payment; do
  docker compose exec kafka /opt/kafka/bin/kafka-topics.sh \
    --bootstrap-server localhost:9092 --create --topic "$t" --partitions 1 --replication-factor 1
done
docker compose restart order-saga-orchestrator inventory-service payment-service notification-service

# 오케스트레이터 DB 마이그레이션
docker compose exec order-saga-orchestrator uv run alembic upgrade head
```

| 주소 | 화면 |
|---|---|
| http://localhost:5173 | 프론트 (주문 목록 / 새 주문 / 주문 상세 / 운영 대시보드) |
| http://localhost:8000 | order-saga-orchestrator (REST + SSE) |
| http://localhost:8001 | inventory-service (`GET /products`) |
| http://localhost:8080 | Kafka UI |

## 데모 시나리오

버튼으로 장애를 트리거하지 않고, 특정 조건으로 주문하면 자연스럽게 실패 흐름이 재현되도록 시드 데이터를 설계.

- **정상 완주**: `기본 티셔츠`(재고 999) 주문 → `COMPLETED`
- **재고부족**: `한정판 스니커즈`(재고 1) 두 번 주문 → 두 번째부터 `INVENTORY_FAILED → CANCELLED`
- **결제 실패 → DLQ → 보상**: 카드번호 `4000000000000002`로 주문 →
  재시도 3회 → `dlq.payment` 적재 → 재고 복구 → `CANCELLED`
- 그 외 카드번호도 10% 확률로 랜덤 실패 (운영 대시보드 통계에 배경 노이즈 누적)

## 알려진 한계 / 실무라면 다르게 할 것

- **at-least-once 미완성**: 컨슈머가 auto-commit(기본값)이라 "처리 후 커밋"이 아님 — 크래시 타이밍에 따라
  재전달 또는 유실. 제대로 하려면 수동 커밋 + 멱등 컨슈머 + 메시지 dedup.
- **손수 만든 워크플로 엔진**: 오케스트레이터가 사가 상태를 PostgreSQL에 들고 Kafka로 구동 — 대규모라면
  Temporal / Camunda 같은 durable workflow 엔진을 검토.
- **SSE 재연결 복구**: mock 서버만 `Last-Event-ID` 재전송 구현. 실제 오케스트레이터는 재연결 시 갭 이벤트 유실.
- **스키마 계약**: 지금은 마크다운 스펙 문서로만 합의. 협업 규모라면 JSON Schema 검증 / Schema Registry /
  컨트랙트 테스트 단계로 강화.
- **운영 대시보드**의 `dlq_count` 등은 `orders` 테이블 집계 + `went_to_dlq` 플래그로 계산. 전이 이력 전체를
  보려면 별도 이력 테이블 필요.
