from confluent_kafka import Producer, Consumer

BOOTSTRAP_SERVICES = "localhost:9092"
TOPIC = "smoke_test"


def produce_one():
    producer = Producer({"bootstrap.servers": BOOTSTRAP_SERVICES})

    def on_delivery(err, msg):
        if err is not None:
            print(f"전송 실패: {err}")
        else:
            print(f"전송 성공: topic={msg.topic()} partition={msg.partition()}")

    # producer.produce(...)는 비동기다. 호출하는 순간 바로 전송되는 게 아니라, 내부 버퍼에 쌓인다. flush()를 해야 실제로 나가고, 결과(성공/실패)가 on_delivery 콜백으로 들어온다.
    # key = 파티션 키 / value = 실제 메시지 내용
    producer.produce(TOPIC, key="hello", value="world", callback=on_delivery)
    print("=== flush 전 ===")
    producer.flush()
    print("=== flush 후 ===")


def consume_one():
    consumer = Consumer({
        "bootstrap.servers": BOOTSTRAP_SERVICES,
        # Consumer는 꼭 그룹에 속해야 한다. 같은 Consumer Group 안에서는 하나의 Partition을 동시에 여러 Consumer가 처리하지 않는다.
        "group.id": "smoke-test-consumer",
        "auto.offset.reset": "earliest",
    })

    consumer.subscribe([TOPIC])

    msg = consumer.poll(timeout=10.0)
    if msg is None:
        print("10초 안에 메시지 못 받음")
    elif msg.error():
        print(f"에러: {msg.error()}")
    else:
        print(f"메시지 받음: key={msg.key()}, value={msg.value()}, topic={msg.topic()}, partition={msg.partition()}")

    consumer.close()


if __name__ == "__main__":
    produce_one()
    consume_one()
