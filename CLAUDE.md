# order-pipeline

## 프로젝트 개요

이벤트 기반 비동기 이커머스 주문 처리 시스템 — 이직 준비용 포트폴리오 프로젝트.

- 1순위 목표: Kafka 기반 Saga **Orchestration** 설계력 증명 (재시도/DLQ 처리 포함)
- 2순위 목표: 운영/관찰가능성(Observability) 역량 증명 — 실시간 장애 관찰 대시보드
- 설계 스펙: `docs/superpowers/specs/2026-08-18-order-pipeline-design.md`
- 프론트 구현 계획: `docs/superpowers/plans/2026-08-18-order-pipeline-frontend.md`

## 역할 분담

- **프론트엔드** (`frontend/`): Claude Code가 작성. 완전 초심자도 따라올 수 있게 매 작업마다 무엇을/왜 하는지 설명하며 진행
- **백엔드/인프라** (`order-saga-orchestrator`, `inventory-service`, `payment-service`, `notification-service`, Docker Compose 등): 사용자가 직접 작성. Claude Code는 작성된 코드를 리뷰하며 동작 원리와 설계 이유를 설명

## 작업 방식 (사용자 지침, 2026-08-18 확정)

1. 프론트는 Claude Code가 작성하되, 프론트를 전혀 모르는 개발자에게 가르치듯 각 작업의 목적과 흐름을 설명하며 진행한다.
2. 백엔드/인프라는 사용자가 작성하고, Claude Code는 코드와 동작 원리·설계 이유를 상세히 설명해 자연스럽게 습득하도록 돕는다.
3. DRY 원칙을 지킨다.
4. 테스트하기 쉬운 구조를 함께 고민한다.
5. 결합도를 낮추는 방법을 함께 고민한다.
6. **예광탄(Tracer Bullet) 방법론**: 태스크마다 처음부터 완성도를 추구하지 않는다. 먼저 얇게 동작하는 버전을 만들어 확인한 뒤, 점진적으로 살을 붙인다.
7. 사용자가 코드 작성을 완료하면 문법 오류/오타를 점검하고 필요한 피드백을 제공한다.
8. 새 기능을 추가로 구현해야 할 때는 먼저 `docs/superpowers/specs`, `docs/superpowers/plans`에 스펙/계획을 작성한 뒤 진행한다.
9. 현재 진행 상황을 이 파일에 최신 상태로 반영한다.

## 브랜치 전략

- `main`: 문서(spec/plan/CLAUDE.md)만. 구현 코드는 커밋하지 않는다.
- `feature/order-pipeline-frontend`: 프론트엔드 구현 작업 브랜치. 현재 여기서 작업 중.
- 백엔드/인프라 작업을 시작하면 별도 브랜치(예: `feature/order-saga-orchestrator`)를 사용한다.

## 현재 진행 상황 (2026-08-18 기준)

- [x] 아키텍처 브레인스토밍 및 spec 확정 (Orchestration 기반 Saga, 상태 머신, API/SSE 계약)
- [x] 프론트엔드 구현 계획 작성
- [x] Notion에 요구사항/설계 문서 정리 (mermaid 다이어그램 포함)
- [x] 프론트엔드 wave 1 (walking skeleton) 완료 — `feature/order-pipeline-frontend` 브랜치, 브라우저에서 주문 생성 → SSE로 상태가 실시간 갱신되는 것까지 확인함
- [ ] 프론트엔드 wave 2~5 — 아래 "실행 순서" 참고
- [ ] 백엔드(order-saga-orchestrator, inventory/payment/notification-service) — 사용자 작성 예정
- [ ] Docker Compose 통합 및 로컬 시연

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

## 참고

- 백엔드/인프라 코드가 이 저장소에 추가되면(예: `orchestrator/`, `services/`, `docker-compose.yml`), 이 섹션과 진행 상황을 업데이트한다.
