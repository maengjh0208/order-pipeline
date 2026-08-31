# 인메모리 재고 딕셔너리와 예약/해제 함수
from sqlalchemy import update

from inventory_service.db import get_session
from inventory_service.models import ProductModel


# 재고 차감할 때 두 단계(SELECT 후 UPDATE)로 하지 않고, "UDPATE ... WHERE stock >= 수량" 한번으로 묶는다.
# 이유는 조회 및 차감을 원자적으로 하기 위함인데, inventory-service 인스턴스가 2개 이상인 경우 race condition에 걸릴 수 있기 때문이다.
async def reserve(items: list[dict]) -> bool:
    sorted_items = sorted(items, key=lambda x: x["product_id"])

    async with get_session() as session:
        for item in sorted_items:
            query = (
                update(ProductModel)
                .where(
                    ProductModel.id == item["product_id"],
                    ProductModel.stock >= item["quantity"],
                )
                .values(stock=ProductModel.stock - item["quantity"])
            )

            result = await session.execute(query)
            if result.rowcount == 0:
                raise ValueError("out of stock")

    return True


async def release(items: list[dict]) -> None:
    sorted_items = sorted(items, key=lambda x: x["product_id"])

    async with get_session() as session:
        for item in sorted_items:
            query = (
                update(ProductModel)
                .where(ProductModel.id == item["product_id"])
                .values(stock=ProductModel.stock + item["quantity"])
            )

            await session.execute(query)
