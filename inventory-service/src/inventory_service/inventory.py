# 인메모리 재고 딕셔너리와 예약/해제 함수

_stock: dict[str, int] = {
    "p1": 1,  # 재고 1개 (품절 시연용)
    "p2": 999,
}


def reserve(items: list[dict]) -> bool:
    for item in items:
        if _stock.get(item["product_id"], 0) < item["quantity"]:
            return False

    for item in items:
        _stock[item["product_id"]] -= item["quantity"]

    return True


def release(items: list[dict]) -> None:
    for item in items:
        _stock[item["product_id"]] += item["quantity"]
