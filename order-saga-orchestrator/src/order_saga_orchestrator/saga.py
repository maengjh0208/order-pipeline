import json
import threading
from json import JSONDecodeError

from confluent_kafka import Producer, Consumer

from order_saga_orchestrator import orders
from order_saga_orchestrator.config import settings
from order_saga_orchestrator.orders import OrderStatus
from order_saga_orchestrator.topics import Topic

stop_consuming = threading.Event()


def handle_events_inventory(event: dict, producer: Producer) -> None:
    order_id = event["order_id"]
    result = event["result"]

    if result == "RESERVED":
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
    elif result == "OUT_OF_STOCK":
        orders.update_status(order_id, OrderStatus.INVENTORY_FAILED)

    print(f"{Topic.EVENTS_INVENTORY} 수신: order_id={order_id}, result={result}")


def handle_events_payment(event: dict, producer: Producer) -> None:
    order_id = event["order_id"]
    result = event["result"]

    if result == "PAID":
        orders.update_status(order_id, OrderStatus.PAID)

    print(f"{Topic.EVENTS_PAYMENT} 수신: order_id={order_id}, result={result}")


def consume_events(producer: Producer) -> None:
    consumer = Consumer({
        "bootstrap.servers": settings.KAFKA_BOOTSTRAP_SERVERS,
        "group.id": "order-saga-orchestrator",
        "auto.offset.reset": "earliest",
    })
    consumer.subscribe([Topic.EVENTS_INVENTORY, Topic.EVENTS_PAYMENT])

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

    consumer.close()  # Consumer 그룹에서 나감.