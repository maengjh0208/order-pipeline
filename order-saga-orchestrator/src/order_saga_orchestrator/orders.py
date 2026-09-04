import uuid
from datetime import datetime, UTC

from pydantic import BaseModel, Field
from sqlalchemy import select, func

from order_saga_orchestrator import events
from order_saga_orchestrator.db import get_session
from order_saga_orchestrator.models import OrderStatus, OrderModel


class OrderItem(BaseModel):
    product_id: str
    quantity: int = Field(gt=0)


class Order(BaseModel):
    # Field(default_factory=...)를 쓰는 이유 !
    # id: str = str(uuid.uuid4())) 처럼 쓰면 클래스가 로드되는 시점에 딱 한 번만 UUID가 생성되고 모든 인스턴스가 같은 값을 공유하는 버그가 생긴다.
    # Field(default_factory=...)를 하면 인스턴스 생성마다 새로 호출된다.
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), serialization_alias="order_id")
    status: OrderStatus = Field(default=OrderStatus.CREATED, serialization_alias="current_status")
    items: list[OrderItem] = Field(default_factory=list)


class OpsSummary(BaseModel):
    total_orders: int
    retrying_count: int
    dlq_count: int
    success_rate: float


async def create_order(items: list[OrderItem], card_number: str) -> Order:
    order = Order(items=items)
    stored_items = [item.model_dump() for item in items]

    async with get_session() as session:
        session.add(OrderModel(
            id=order.id,
            status=order.status,
            items=stored_items,
            card_number=card_number,
        ))

    return order


async def get_order(order_id: str) -> Order | None:
    async with get_session() as session:
        result = await session.get(OrderModel, order_id)

        if result is None:
            return None

        return Order(
            id=result.id,
            status=result.status,
            items=result.items or [],
        )


async def get_orders() -> list[Order]:
    async with get_session() as session:
        result = await session.execute(select(OrderModel).order_by(OrderModel.created_at.desc()))
        rows = result.scalars().all()

        return [
            Order(
                id=row.id,
                status=row.status,
                items=row.items or [],
            ) for row in rows
        ]


async def get_saga_context(order_id: str) -> tuple[list[dict], str] | None:
    """saga.py 전용: 결제 재발행 / RELEASE에 필요한 items, cared_number 원본"""
    async with get_session() as session:
        result = await session.get(OrderModel, order_id)

        if result is None:
            return None

        return result.items or [], result.card_number


async def update_status(order_id: str, status: OrderStatus) -> None:
    async with get_session() as session:
        result = await session.get(OrderModel, order_id)

        if result is None:
            return None

        from_status = result.status
        result.status = status

        if status == OrderStatus.PAYMENT_FAILED_DLQ:
            result.went_to_dlq = True

    events.publish({
        "event_id": str(uuid.uuid4()),
        "order_id": result.id,
        "saga_step": saga_step_for(status),
        "from_status": from_status,
        "to_status": status,
        "occurred_at": datetime.now(UTC).isoformat(),
    })


async def get_ops_summary() -> OpsSummary:
    async with get_session() as session:
        # func.count()만 있으면 어느 테이블을 보는지 모르니까 select_from으로 명시해줄 수 있다.
        total = await session.scalar(select(func.count()).select_from(OrderModel))
        completed = await session.scalar(
            select(func.count()).select_from(OrderModel).where(OrderModel.status == OrderStatus.COMPLETED)
        )
        cancelled = await session.scalar(
            select(func.count()).select_from(OrderModel).where(OrderModel.status == OrderStatus.CANCELLED)
        )
        retrying = await session.scalar(
            select(func.count()).select_from(OrderModel).where(OrderModel.status == OrderStatus.RETRYING_PAYMENT)
        )
        dlq = await session.scalar(
            select(func.count()).select_from(OrderModel).where(OrderModel.went_to_dlq.is_(True))
        )

        finished = completed + cancelled
        return OpsSummary(
            total_orders=total,
            retrying_count=retrying,
            dlq_count=dlq,
            success_rate=(completed / finished) if finished else 0.0,
        )


def saga_step_for(status: OrderStatus) -> str:
    if status in (OrderStatus.INVENTORY_RESERVING, OrderStatus.INVENTORY_RESERVED, OrderStatus.INVENTORY_FAILED,
                  OrderStatus.COMPENSATING_INVENTORY):
        return "INVENTORY"

    if status in (OrderStatus.PAYMENT_PROCESSING, OrderStatus.PAID, OrderStatus.PAYMENT_FAILED,
                  OrderStatus.RETRYING_PAYMENT, OrderStatus.PAYMENT_FAILED_DLQ):
        return "PAYMENT"

    if status == OrderStatus.NOTIFYING:
        return "NOTIFICATION"

    return "PAYMENT"
