from datetime import datetime
from enum import StrEnum

from sqlalchemy import Uuid, JSON, DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class OrderStatus(StrEnum):
    CREATED = "CREATED"
    INVENTORY_RESERVING = "INVENTORY_RESERVING"
    INVENTORY_RESERVED = "INVENTORY_RESERVED"
    INVENTORY_FAILED = "INVENTORY_FAILED"
    CANCELLED = "CANCELLED"
    PAYMENT_PROCESSING = "PAYMENT_PROCESSING"
    PAID = "PAID"
    PAYMENT_FAILED = "PAYMENT_FAILED"  # 결제 시도 하나가 실패한 순간 (일시적)
    RETRYING_PAYMENT = "RETRYING_PAYMENT"  # 결제 재시도 진행중
    PAYMENT_FAILED_DLQ = "PAYMENT_FAILED_DLQ"  # 결제 재시도 3회 소진, 최종 실패
    COMPENSATING_INVENTORY = "COMPENSATING_INVENTORY"  # 결제 실패로 인해 재고 복구중
    NOTIFYING = "NOTIFYING"
    COMPLETED = "COMPLETED"


class Base(DeclarativeBase):
    pass


class OrderModel(Base):
    __tablename__ = "orders"

    # UUID를 문자열로 저장하면 36바이트(하이픈 포함)인데, 네이티브 UUID 타입은 16바이트 고정 바이너리로 저장된다.
    # Uuid 타입에 as_uuid=False 옵션을 주면, DB에는 네이티브 UUID로 저장하면서 Python에는 문자열로 돌려준다.
    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True)
    status: Mapped[str]  # OrderStatus
    items: Mapped[list[dict] | None] = mapped_column(JSON)
    card_number: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), # DateTime(timezone=True): UTC timezone도 함께 기록한다.
                                                 server_default=func.now())  # server_default=func.now(): 값을 DB가 채운다.
    went_to_dlq: Mapped[bool] = mapped_column(server_default="false")
