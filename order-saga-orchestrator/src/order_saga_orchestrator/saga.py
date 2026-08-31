import asyncio
import json
import threading
from json import JSONDecodeError

from confluent_kafka import Producer, Consumer

from order_saga_orchestrator import orders
from order_saga_orchestrator.config import settings
from order_saga_orchestrator.models import OrderStatus
from order_saga_orchestrator.topics import Topic

stop_consuming = threading.Event()
MAX_PAYMENT_ATTEMPTS = 3


async def handle_events_inventory(event: dict, producer: Producer) -> None:
    order_id = event["order_id"]
    action = event["action"]  # action: 무슨 작업을 요청했는지
    result = event["result"]  # result: 그 작업의 결과가 어떻게 됐는지

    print(f"{Topic.EVENTS_INVENTORY} 수신: order_id={order_id}, action={action}, result={result}")

    if action == "RESERVE" and result == "RESERVED":
        await orders.update_status(order_id, OrderStatus.INVENTORY_RESERVED)
        await orders.update_status(order_id, OrderStatus.PAYMENT_PROCESSING)
        producer.produce(
            Topic.COMMANDS_PAYMENT,
            key=order_id,
            value=json.dumps({
                "order_id": order_id,
                "card_number": "4000000000000002",  # TODO: 일단은 임의 값
                "attempt": 1,
            })
        )
        producer.flush()

        print(f"{Topic.COMMANDS_PAYMENT} 처리")
    elif action == "RESERVE" and result == "OUT_OF_STOCK":
        await orders.update_status(order_id, OrderStatus.INVENTORY_FAILED)
        await orders.update_status(order_id, OrderStatus.CANCELLED)
    elif action == "RELEASE" and result == "RELEASED":
        await orders.update_status(order_id, OrderStatus.CANCELLED)


async def handle_events_payment(event: dict, producer: Producer) -> None:
    order_id = event["order_id"]
    result = event["result"]
    attempt = event["attempt"]

    print(f"{Topic.EVENTS_PAYMENT} 수신: order_id={order_id}, attempt={attempt}, result={result}")

    if result == "PAID":
        await orders.update_status(order_id, OrderStatus.PAID)
        await orders.update_status(order_id, OrderStatus.NOTIFYING)
        producer.produce(
            Topic.COMMANDS_NOTIFICATION,
            key=order_id,
            value=json.dumps({"order_id": order_id})
        )
        producer.flush()
        print(f"{Topic.COMMANDS_NOTIFICATION} 처리")
    elif result == "FAILED":
        await orders.update_status(order_id, OrderStatus.PAYMENT_FAILED)

        if attempt < MAX_PAYMENT_ATTEMPTS:
            await orders.update_status(order_id, OrderStatus.RETRYING_PAYMENT)
            producer.produce(
                Topic.COMMANDS_PAYMENT,
                key=order_id,
                value=json.dumps({
                    "order_id": order_id,
                    "card_number": "4000000000000002",  # TODO: 일단은 임의 값
                    "attempt": attempt + 1,
                })
            )
            producer.flush()
            print(f"{Topic.COMMANDS_PAYMENT} 처리")
        else:
            await orders.update_status(order_id, OrderStatus.PAYMENT_FAILED_DLQ)
            producer.produce(Topic.DLQ_PAYMENT, key=order_id, value=json.dumps(event))
            producer.produce(
                Topic.COMMANDS_INVENTORY,
                key=order_id,
                value=json.dumps({
                    "order_id": order_id,
                    "action": "RELEASE",
                    "items": [],
                })
            )
            producer.flush()
            print(f"{Topic.COMMANDS_INVENTORY} 처리")
            await orders.update_status(order_id, OrderStatus.COMPENSATING_INVENTORY)


async def handle_events_notification(event: dict, producer: Producer) -> None:
    order_id = event["order_id"]
    result = event["result"]

    print(f"{Topic.EVENTS_NOTIFICATION} 수신: order_id={order_id}, result={result}")

    if result == "SENT":
        await orders.update_status(order_id, OrderStatus.COMPLETED)


def consume_events(producer: Producer, loop: asyncio.AbstractEventLoop) -> None:
    consumer = Consumer({
        "bootstrap.servers": settings.KAFKA_BOOTSTRAP_SERVERS,
        "group.id": "order-saga-orchestrator",
        "auto.offset.reset": "earliest",
    })
    consumer.subscribe([Topic.EVENTS_INVENTORY, Topic.EVENTS_PAYMENT, Topic.EVENTS_NOTIFICATION])

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

        if msg.topic() == Topic.EVENTS_INVENTORY:
            coro = handle_events_inventory(event, producer)
        elif msg.topic() == Topic.EVENTS_PAYMENT:
            coro = handle_events_payment(event, producer)
        elif msg.topic() == Topic.EVENTS_NOTIFICATION:
            coro = handle_events_notification(event, producer)
        else:
            continue

        # asyncio.call_soon_threadsafe, asyncio.run_coroutine_threadsafe 둘다 다른 스레드에서 asyncio 이벤트 루프에 안전하게 작업을 예약하기 위한 함수이다.
        # 예약 대상이 다른데, call_soon_threadsafe는 일반 콜백 함수(동기함수), run_coroutine_threadsafe는 코루틴(coroutine).
        # call_soon_threadsafe는 반환값이 없고, 결과를 대기할 수 없는데
        # run_coroutine_threadsafe는 concurrent.futures.Future을 반환하고, future.result()를 사용하면 대기했다가 결과를 받을 수 있다.
        asyncio.run_coroutine_threadsafe(coro, loop).result()  # .result() -> 결과 대기

    consumer.close()  # Consumer 그룹에서 나감.
