from confluent_kafka import Consumer

from inventory_service.config import settings
from inventory_service.topics import Topic


def main() -> None:
    consumer = Consumer({
        "bootstrap.servers": settings.KAFKA_BOOTSTRAP_SERVERS,
        "group.id": "inventory-service",
        "auto.offset.reset": "earliest",

    })
    consumer.subscribe([Topic.COMMANDS_INVENTORY])

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
    finally:
        consumer.close()


if __name__ == "__main__":
    main()
