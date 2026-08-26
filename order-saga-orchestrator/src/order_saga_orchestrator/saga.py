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


def handle_events_inventory(event: dict, producer: Producer) -> None:
    order_id = event["order_id"]
    action = event["action"]  # action: 무슨 작업을 요청했는지
    result = event["result"]  # result: 그 작업의 결과가 어떻게 됐는지

    if action == "RESERVE" and result == "RESERVED":
        orders.update_status(order_id, OrderStatus.INVENTORY_RESERVED)
        orders.update_status(order_id, OrderStatus.PAYMENT_PROCESSING)
        producer.produce(
            Topic.COMMANDS_PAYMENT,
            key=order_id,
            value=json.dumps({
                "order_id": order_id,
                "card_number": "4111111111111111",  # TODO: 일단은 임의 값
                "attempt": 1,
            })
        )
        producer.flush()
    elif action == "RESERVE" and result == "OUT_OF_STOCK":
        orders.update_status(order_id, OrderStatus.INVENTORY_FAILED)
        orders.update_status(order_id, OrderStatus.CANCELLED)
    elif action == "RELEASE" and result == "RELEASED":
        orders.update_status(order_id, OrderStatus.CANCELLED)

    print(f"{Topic.EVENTS_INVENTORY} 수신: order_id={order_id}, action={action}, result={result}")


def handle_events_payment(event: dict, producer: Producer) -> None:
    order_id = event["order_id"]
    result = event["result"]
    attempt = event["attempt"]

    if result == "PAID":
        orders.update_status(order_id, OrderStatus.PAID)
        orders.update_status(order_id, OrderStatus.NOTIFYING)
        producer.produce(
            Topic.COMMANDS_NOTIFICATION,
            key=order_id,
            value=json.dumps({"order_id": order_id})
        )
        producer.flush()
    elif result == "FAILED":
        orders.update_status(order_id, OrderStatus.PAYMENT_FAILED)

        if attempt < MAX_PAYMENT_ATTEMPTS:
            orders.update_status(order_id, OrderStatus.RETRYING_PAYMENT)
            producer.produce(
                Topic.COMMANDS_PAYMENT,
                key=order_id,
                value=json.dumps({
                    "order_id": order_id,
                    "card_number": "4111111111111111",  # TODO: 일단은 임의 값
                    "attempt": attempt + 1,
                })
            )
            producer.flush()
        else:
            orders.update_status(order_id, OrderStatus.PAYMENT_FAILED_DLQ)
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
            orders.update_status(order_id, OrderStatus.COMPENSATING_INVENTORY)

    print(f"{Topic.EVENTS_PAYMENT} 수신: order_id={order_id}, attempt={attempt}, result={result}")


def handle_events_notification(event: dict, producer: Producer) -> None:
    order_id = event["order_id"]
    result = event["result"]

    if result == "SENT":
        orders.update_status(order_id, OrderStatus.COMPLETED)

    print(f"{Topic.EVENTS_NOTIFICATION} 수신: order_id={order_id}, result={result}")


def consume_events(producer: Producer) -> None:
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
            handle_events_inventory(event, producer)
        elif msg.topic() == Topic.EVENTS_PAYMENT:
            handle_events_payment(event, producer)
        elif msg.topic() == Topic.EVENTS_NOTIFICATION:
            handle_events_notification(event, producer)

    consumer.close()  # Consumer 그룹에서 나감.
