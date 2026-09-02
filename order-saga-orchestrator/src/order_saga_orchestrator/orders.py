import uuid

from pydantic import BaseModel, Field
from sqlalchemy import select

from order_saga_orchestrator import events
from order_saga_orchestrator.db import get_session
from order_saga_orchestrator.models import OrderStatus, OrderModel


class Order(BaseModel):
    # Field(default_factory=...)를 쓰는 이유 !
    # id: str = str(uuid.uuid4())) 처럼 쓰면 클래스가 로드되는 시점에 딱 한 번만 UUID가 생성되고 모든 인스턴스가 같은 값을 공유하는 버그가 생긴다.
    # Field(default_factory=...)를 하면 인스턴스 생성마다 새로 호출된다.
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: OrderStatus = OrderStatus.CREATED


async def create_order() -> Order:
    order = Order()

    async with get_session() as session:
        session.add(OrderModel(id=order.id, status=order.status))

    return order


async def get_order(order_id: str) -> Order | None:
    async with get_session() as session:
        order_model = await session.get(OrderModel, order_id)

        if order_model is None:
            return None

        return Order(id=order_model.id, status=order_model.status)


async def get_orders() -> list[Order]:
    async with get_session() as session:
        result = await session.execute(select(OrderModel))
        rows = result.scalars().all()

        return [Order(id=row.id, status=row.status) for row in rows]


async def update_status(order_id: str, status: OrderStatus) -> None:
    async with get_session() as session:
        order_model = await session.get(OrderModel, order_id)

        if order_model is None:
            return None

        order_model.status = status

    events.publish({"order_id": order_model.id, "status": status})
