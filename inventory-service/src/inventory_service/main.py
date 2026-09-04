import asyncio
import json
import threading
from contextlib import asynccontextmanager
from json import JSONDecodeError

from confluent_kafka import Consumer, Producer
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from inventory_service.config import settings
from inventory_service import inventory
from inventory_service.topics import Topic

stop_consuming = threading.Event()


async def handle_commands_inventory(event: dict, producer: Producer) -> None:
    order_id = event["order_id"]
    action = event["action"]
    items = event["items"]

    result = None
    reason = None

    if action == "RESERVE":
        try:
            await inventory.reserve(items)
            result = "RESERVED"
            reason = None
        except ValueError:
            result = "OUT_OF_STOCK"
            reason = "out of stock"
    elif action == "RELEASE":
        await inventory.release(items)
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


def consume_commands(producer: Producer, loop: asyncio.AbstractEventLoop) -> None:
    consumer = Consumer({
        "bootstrap.servers": settings.KAFKA_BOOTSTRAP_SERVERS,
        "group.id": "inventory-service",
        "auto.offset.reset": "earliest",

    })
    consumer.subscribe([Topic.COMMANDS_INVENTORY])

    print(f"{Topic.COMMANDS_INVENTORY} 구독 중")

    try:
        while not stop_consuming.is_set():
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

            asyncio.run_coroutine_threadsafe(handle_commands_inventory(event, producer), loop).result()
    finally:
        consumer.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    producer = Producer({"bootstrap.servers": settings.KAFKA_BOOTSTRAP_SERVERS})

    loop = asyncio.get_running_loop()

    consumer_thread = threading.Thread(target=consume_commands, args=(producer, loop), daemon=True)
    consumer_thread.start()

    yield

    producer.flush()

    stop_consuming.set()
    consumer_thread.join()


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/products")
async def get_products() -> list[inventory.Product]:
    return await inventory.get_products()
