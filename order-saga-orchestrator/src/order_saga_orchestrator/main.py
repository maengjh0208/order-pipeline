import json
import threading
from contextlib import asynccontextmanager
from json import JSONDecodeError

from confluent_kafka import Producer, Consumer
from fastapi import FastAPI, HTTPException

from order_saga_orchestrator import orders
from order_saga_orchestrator.orders import OrderStatus, Order
from order_saga_orchestrator.config import settings
from order_saga_orchestrator.topics import Topic

stop_consuming = threading.Event()


def consume_events_inventory():
    consumer = Consumer({
        "bootstrap.servers": settings.KAFKA_BOOTSTRAP_SERVERS,
        "group.id": "order-saga-orchestrator",
        "auto.offset.reset": "earliest",
    })
    consumer.subscribe([Topic.EVENTS_INVENTORY])

    while not stop_consuming.is_set():
        msg = consumer.poll(timeout=1.0)
        if msg is None:
            continue
        if msg.error():
            print(f"Consumer Error: {msg.error()}")
            continue

        try:
            event = json.loads(msg.value())
        except JSONDecodeError:
            continue

        order_id = event["order_id"]
        result = event["result"]

        if result == "RESERVED":
            orders.update_status(order_id, OrderStatus.INVENTORY_RESERVED)
        elif result == "OUT_OF_STOCK":
            orders.update_status(order_id, OrderStatus.INVENTORY_FAILED)

        print(f"{Topic.EVENTS_INVENTORY} 수신: order_id={order_id}, result={result}")

    # Consumer Group에서 나간다.
    consumer.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # app.state vs request.state 비교!
    # - app.state : app 객체 자체는 서버가 켜져있는 동안 딱 하나 존재한다. app.state에 넣은 건 모든 요청, 모든 사용자가 공유하는 값이다.
    # - request.state : FastAPI는 요청이 들어올 때마다 새로운 Request 객체를 만든다. 그 객체가 갖고 있는 .state는 그 요청 하나에만 스코프된다.
    #                   인증 미들에어가 '이 요청을 보낸 사람은 누구다'를 request.state.user = ... 로 심어두고
    #                   그 요청을 처리하는 핸들러가 나중에 request.state.user로 꺼내 쓰는 식이다.
    #                   요청마다 독립적이라 다른 사람 정보가 섞일 일이 없다.
    app.state.producer = Producer({"bootstrap.servers": settings.KAFKA_BOOTSTRAP_SERVERS})

    # daemon=True : 앱이 비정상 종료될 때, 이 스레드 때문에 프로세스가 안 죽고 걸려있는 걸 방지하는 안전장치.
    # 정상 종료는 join()으로 확실하게 기다린다.
    consumer_thread = threading.Thread(target=consume_events_inventory, daemon=True)
    consumer_thread.start()

    yield

    # produce()는 비동기라서 호출하는 순간 메시지가 로컬 버퍼에 쌓이기만 하고 아직 브로커에게 전송되지 않았을 수도 있다.
    # 앱이 종료될 때 이 버퍼에 아직 안 보낸 메시지가 남아있으면, 그냥 프로세스가 죽어버리면서 그 메시지들이 조용히 유실된다.
    # flush()는 '커넥션을 정리한다'는 의미가 아니라, '버퍼에 남은 메시지들을 모두 실제로 보낼 떄까지 기다린다'는 의미이다.
    app.state.producer.flush()

    stop_consuming.set()
    consumer_thread.join()  # 메인 스레드가 기다려줌.


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
