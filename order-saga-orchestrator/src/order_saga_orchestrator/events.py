import asyncio

_subscribers: list[asyncio.Queue] = []
_loop: asyncio.AbstractEventLoop | None = None


def set_event_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _loop
    _loop = loop


def subscribe() -> asyncio.Queue:
    q = asyncio.Queue()
    _subscribers.append(q)
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    _subscribers.remove(q)


def publish(event: dict) -> None:
    # _subscribers를 다시 list로 감싸는 이유 :
    # _subscribers 원본으로 순회하는 중에 subscribe, unsubscribe 으로 원본 리스트의 크기가 바뀔 수 있음.
    # 따라서 순회중에 원본 리스트가 바뀌어도 그 순간에는 독립적으로 영향을 받지 않게 하려고 하는 것임.

    # 필터링 없이 모든 구독자에게 뿌린다.
    for q in list(_subscribers):
        _loop.call_soon_threadsafe(q.put_nowait, event)
