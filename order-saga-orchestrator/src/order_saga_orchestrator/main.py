from contextlib import asynccontextmanager

from confluent_kafka import Producer
from fastapi import FastAPI

from order_saga_orchestrator.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # app.state vs request.state 비교!
    # - app.state : app 객체 자체는 서버가 켜져있는 동안 딱 하나 존재한다. app.state에 넣은 건 모든 요청, 모든 사용자가 공유하는 값이다.
    # - request.state : FastAPI는 요청이 들어올 때마다 새로운 Request 객체를 만든다. 그 객체가 갖고 있는 .state는 그 요청 하나에만 스코프된다.
    #                   인증 미들에어가 '이 요청을 보낸 사람은 누구다'를 request.state.user = ... 로 심어두고
    #                   그 요청을 처리하는 핸들러가 나중에 request.state.user로 꺼내 쓰는 식이다.
    #                   요청마다 독립적이라 다른 사람 정보가 섞일 일이 없다.
    app.state.producer = Producer({"bootstrap.servers": settings.KAFKA_BOOTSTRAP_SERVERS})

    yield

    # produce()는 비동기라서 호출하는 순간 메시지가 로컬 버퍼에 쌓이기만 하고 아직 브로커에게 전송되지 않았을 수도 있다.
    # 앱이 종료될 때 이 버퍼에 아직 안 보낸 메시지가 남아있으면, 그냥 프로세스가 죽어버리면서 그 메시지들이 조용히 유실된다.
    # flush()는 '커넥션을 정리한다'는 의미가 아니라, '버퍼에 남은 메시지들을 모두 실제로 보낼 떄까지 기다린다'는 의미이다.
    app.state.producer.flush()


app = FastAPI(lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/_debug/produce")
def debug_produce():
    def on_delivery(err, msg):
        if err is not None:
            print(f"전송 실패: {err}")
        else:
            print(f"전송 성공: topic={msg.topic()}, partition={msg.partition()}")

    app.state.producer.produce(
        "commands.inventory",
        key="debug-order-id",
        value='{"order_id": "debug-order-id", "action": "RESERVE", "items": []}',
        callback=on_delivery,
    )
    app.state.producer.flush()
    return {"status": "produced"}
