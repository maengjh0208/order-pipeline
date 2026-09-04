import asyncio
import json
import threading
from contextlib import asynccontextmanager

from confluent_kafka import Producer
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import Field, BaseModel
from sqlalchemy import text
from starlette.middleware.cors import CORSMiddleware

from order_saga_orchestrator import orders, events
from order_saga_orchestrator.db import engine
from order_saga_orchestrator.models import OrderStatus
from order_saga_orchestrator.orders import Order
from order_saga_orchestrator.config import settings
from order_saga_orchestrator.saga import consume_events, stop_consuming
from order_saga_orchestrator.topics import Topic


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("========== FastAPI 시작 ==========")

    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT 1"))
        print(f"Postgres 연결 확인: {result.scalar()}")
        print("----------------------------------")

    # app.state vs request.state 비교!
    # - app.state : app 객체 자체는 서버가 켜져있는 동안 딱 하나 존재한다. app.state에 넣은 건 모든 요청, 모든 사용자가 공유하는 값이다.
    # - request.state : FastAPI는 요청이 들어올 때마다 새로운 Request 객체를 만든다. 그 객체가 갖고 있는 .state는 그 요청 하나에만 스코프된다.
    #                   인증 미들에어가 '이 요청을 보낸 사람은 누구다'를 request.state.user = ... 로 심어두고
    #                   그 요청을 처리하는 핸들러가 나중에 request.state.user로 꺼내 쓰는 식이다.
    #                   요청마다 독립적이라 다른 사람 정보가 섞일 일이 없다.
    app.state.producer = Producer({"bootstrap.servers": settings.KAFKA_BOOTSTRAP_SERVERS})

    # consumer_thread가 시작되기 전에 events의 _loop가 세팅되어 있어야 한다.
    loop = asyncio.get_running_loop()
    events.set_event_loop(loop)

    # daemon=True -> 비정상 종료시 이 스레드 떄문에 프로세스가 안죽고 걸려있는 걸 방지한다.
    consumer_thread = threading.Thread(target=consume_events, args=(app.state.producer, loop), daemon=True)
    consumer_thread.start()

    print("Kafka Producer/Consumer 연결 완료")
    print("----------------------------------")

    yield

    app.state.producer.flush()

    stop_consuming.set()
    consumer_thread.join()  # 정상 종료인 경우 .join()을 하면 메인 스레드가 기다려준다.

    await engine.dispose()

    print("========== FastAPI 종료 ==========")


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class CreateOrderRequest(BaseModel):
    items: list[orders.OrderItem] = Field(min_length=1)
    card_number: str


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/orders")
async def create_order(body: CreateOrderRequest) -> Order:
    order = await orders.create_order(body.items, body.card_number)
    await orders.update_status(order.id, OrderStatus.INVENTORY_RESERVING)
    order.status = OrderStatus.INVENTORY_RESERVING

    app.state.producer.produce(
        Topic.COMMANDS_INVENTORY,
        key=order.id,
        value=json.dumps(  # value로 bytes나 str만 받는다.
            {"order_id": order.id, "action": "RESERVE", "items": [item.model_dump() for item in order.items], }),
    )
    # TODO: flush()를 매번 호출하면 브로커에 실제로 전달될 때까지 응답이 지연됨 (처리량 손해) -- 지금은 데모 규모라 '확실히 전달됐나'를 중요하게 봐서 이렇게 진행.
    app.state.producer.flush()

    return order


@app.get("/orders")
async def get_orders() -> list[Order]:
    return await orders.get_orders()


@app.get("/orders/{order_id}")
async def get_order(order_id: str) -> Order:
    order = await orders.get_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    return order


@app.get("/sse/ops")
async def sse_ops():
    async def event_generator():
        q = events.subscribe()
        try:
            while True:
                event = await q.get()
                yield f"data: {json.dumps(event)}\n\n"
        finally:
            events.unsubscribe(q)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/sse/orders/{order_id}")
async def sse_order(order_id: str):
    async def event_generator():
        q = events.subscribe()
        try:
            while True:
                event = await q.get()
                if event.get("order_id") != order_id:
                    continue

                yield f"data: {json.dumps(event)}\n\n"
        finally:
            events.unsubscribe(q)

    # 첫번째 인자로 제너레이터(generator 또는 async generator)를 받는다.
    # 언제 사용하나? 대용량 파일 다운로드, 실시간 데이터 스트리밍, SSE(Server-Sent Events), 처리 시간이 긴 응답
    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/ops/summary")
async def ops_summary() -> orders.OpsSummary:
    return await orders.get_ops_summary()
