import asyncio
import json
import threading
from contextlib import asynccontextmanager

from confluent_kafka import Producer
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import text

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
    events.set_event_loop(asyncio.get_running_loop())

    # daemon=True : 앱이 비정상 종료될 때, 이 스레드 때문에 프로세스가 안 죽고 걸려있는 걸 방지하는 안전장치.
    # 정상 종료는 join()으로 확실하게 기다린다.
    consumer_thread = threading.Thread(target=consume_events, args=(app.state.producer,), daemon=True)
    consumer_thread.start()
    print("Kafka Producer/Consumer 연결 완료")
    print("----------------------------------")

    yield

    app.state.producer.flush()

    stop_consuming.set()
    consumer_thread.join()  # 메인 스레드가 기다려줌.

    await engine.dispose()

    print("========== FastAPI 종료 ==========")


app = FastAPI(lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/orders")
def create_order() -> Order:
    order = orders.create_order()
    orders.update_status(order.id, OrderStatus.INVENTORY_RESERVING)

    app.state.producer.produce(
        Topic.COMMANDS_INVENTORY,
        key=order.id,
        value=json.dumps({"order_id": order.id, "action": "RESERVE", "items": []}),  # value로 bytes나 str만 받는다.
    )
    # TODO: flush()를 매번 호출하면 브로커에 실제로 전달될 때까지 응답이 지연됨 (처리량 손해) -- 지금은 데모 규모라 '확실히 전달됐나'를 중요하게 봐서 이렇게 진행.
    app.state.producer.flush()

    return order


@app.get("/orders/{order_id}")
def get_order(order_id: str) -> Order:
    order = orders.get_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    return order


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

    return StreamingResponse(event_generator(), media_type="text/event-stream")
