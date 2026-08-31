import json
from json import JSONDecodeError

from confluent_kafka import Consumer, Producer

from notification_service.config import settings
from notification_service.topics import Topic


def handle_commands_notification(event: dict, producer: Producer) -> None:
    order_id = event["order_id"]

    print(f"주문 {order_id} 알림 발송")

    producer.produce(
        Topic.EVENTS_NOTIFICATION,
        key=order_id,
        value=json.dumps({
            "order_id": order_id,
            "result": "SENT",
        })
    )
    producer.flush()

    print(f"{Topic.EVENTS_NOTIFICATION} 처리: order_id={order_id}, result=SENT")


def main() -> None:
    consumer = Consumer({
        "bootstrap.servers": settings.KAFKA_BOOTSTRAP_SERVERS,
        "group.id": "notification-service",
        "auto.offset.reset": "earliest",
    })
    consumer.subscribe([Topic.COMMANDS_NOTIFICATION])

    producer = Producer({"bootstrap.servers": settings.KAFKA_BOOTSTRAP_SERVERS})

    print(f"notification-service 시작, {Topic.COMMANDS_NOTIFICATION} 구독 중")

    try:
        while True:
            msg = consumer.poll(timeout=1.0)
            if msg is None:
                continue
            if msg.error():
                print(f"Consumer error: {msg.error()}")
                continue

            try:
                event = json.loads(msg.value())
            except JSONDecodeError:
                continue

            handle_commands_notification(event, producer)
    finally:
        consumer.close()


if __name__ == "__main__":
    main()
