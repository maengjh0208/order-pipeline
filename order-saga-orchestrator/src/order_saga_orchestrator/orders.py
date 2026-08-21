import uuid
from enum import StrEnum

from pydantic import BaseModel, Field

from order_saga_orchestrator import events


class OrderStatus(StrEnum):
    CREATED = "CREATED"
    INVENTORY_RESERVING = "INVENTORY_RESERVING"
    INVENTORY_RESERVED = "INVENTORY_RESERVED"
    INVENTORY_FAILED = "INVENTORY_FAILED"
    CANCELLED = "CANCELLED"


class Order(BaseModel):
    # Field(default_factory=...)를 쓰는 이유 !
    # id: str = str(uuid.uuid4())) 처럼 쓰면 클래스가 로드되는 시점에 딱 한 번만 UUID가 생성되고 모든 인스턴스가 같은 값을 공유하는 버그가 생긴다.
    # Field(default_factory=...)를 하면 인스턴스 생성마다 새로 호출된다.
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: OrderStatus = OrderStatus.CREATED


_orders: dict[str, Order] = {}


def create_order() -> Order:
    order = Order()
    _orders[order.id] = order
    return order


def get_order(order_id: str) -> Order | None:
    return _orders.get(order_id)


def update_status(order_id: str, status: OrderStatus) -> None:
    order = _orders.get(order_id)
    if order:
        order.status = status
        events.publish({"order_id": order.id, "status": status})
