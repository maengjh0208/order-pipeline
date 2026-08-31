import json
from json import JSONDecodeError

from confluent_kafka import Producer, Consumer

from payment_service.config import settings
from payment_service.payment_provider import PaymentProvider, MockPaymentProvider
from payment_service.topics import Topic


def handle_commands_payment(event: dict, producer: Producer, provider: PaymentProvider) -> None:
    order_id = event["order_id"]
    card_number = event["card_number"]
    attempt = event["attempt"]

    result = None
    reason = None

    if provider.charge(card_number):
        result = "PAID"
        reason = None
    else:
        result = "FAILED"
        reason = "insufficient_funds"

    producer.produce(
        Topic.EVENTS_PAYMENT,
        key=order_id,
        value=json.dumps({
            "order_id": order_id,
            "result": result,
            "attempt": attempt,
            "reason": reason,
        })
    )
    producer.flush()

    print(f"{Topic.EVENTS_PAYMENT} 처리: order_id={order_id}, result={result}, attempt={attempt}, reason={reason}")


def main() -> None:
    consumer = Consumer({
        "bootstrap.servers": settings.KAFKA_BOOTSTRAP_SERVERS,
        "group.id": "payment-service",
        "auto.offset.reset": "earliest",
    })
    consumer.subscribe([Topic.COMMANDS_PAYMENT])

    producer = Producer({"bootstrap.servers": settings.KAFKA_BOOTSTRAP_SERVERS})
    provider = MockPaymentProvider()

    print(f"payment-service 시작, {Topic.COMMANDS_PAYMENT} 구독 중")

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

            handle_commands_payment(event, producer, provider)
    finally:
        consumer.close()


if __name__ == "__main__":
    main()
