import json
from json import JSONDecodeError

from confluent_kafka import Consumer, Producer

from inventory_service.config import settings
from inventory_service.inventory import reserve, release
from inventory_service.topics import Topic


def handle_commands_inventory(event: dict, producer: Producer) -> None:
    order_id = event["order_id"]
    action = event["action"]
    items = event["items"]

    result = None
    reason = None

    if action == "RESERVE":
        if reserve(items):
            result = "RESERVED"
            reason = None
        else:
            result = "OUT_OF_STOCK"
            reason = "out of stock"
    elif action == "RELEASE":
        release(items)
        result = "RELEASED"
        reason = None
    else:
        return

    producer.produce(
        Topic.EVENTS_INVENTORY,
        key=order_id,
        value=json.dumps({
            "order_id": order_id,
            "action": action,
            "result": result,
            "reason": reason,
        })
    )
    producer.flush()

    print(f"{Topic.EVENTS_INVENTORY} 처리: order_id={order_id}, action={action}, result={result}, reason={reason}")


def main() -> None:
    consumer = Consumer({
        "bootstrap.servers": settings.KAFKA_BOOTSTRAP_SERVERS,
        "group.id": "inventory-service",
        "auto.offset.reset": "earliest",

    })
    consumer.subscribe([Topic.COMMANDS_INVENTORY])

    producer = Producer({"bootstrap.servers": settings.KAFKA_BOOTSTRAP_SERVERS})

    print(f"inventory-service 시작, {Topic.COMMANDS_INVENTORY} 구독 중")

    try:
        while True:
            msg = consumer.poll(timeout=1.0)
            if msg is None:
                continue
            if msg.error():
                print(f"Consumer error: {msg.error()}")
                continue

            print(f"{Topic.COMMANDS_INVENTORY} 수신: {msg.value()}")

            try:
                event = json.loads(msg.value())
            except JSONDecodeError:
                continue

            handle_commands_inventory(event, producer)
    finally:
        consumer.close()


if __name__ == "__main__":
    main()
