import queue

# queue.Queue는 파이썬 표준 라이브러리가 제공하는 스레드 세이프 큐. (여러 스레드가 동시에 put()과 get()을 해도 내부적으로 lock을 걸어서 데이터가 깨지지 않게 보장해준다.)
_subscribers: list[queue.Queue] = []


def subscribe() -> queue.Queue:
    q = queue.Queue()
    _subscribers.append(q)
    return q


def unsubscribe(q: queue.Queue) -> None:
    _subscribers.remove(q)


def publish(event: dict) -> None:
    # _subscribers를 다시 list로 감싸는 이유 :
    # _subscribers 원본으로 순회하는 중에 subscribe, unsubscribe 으로 원본 리스트의 크기가 바뀔 수 있음.
    # 따라서 순회중에 원본 리스트가 바뀌어도 그 순간에는 독립적으로 영향을 받지 않게 하려고 하는 것임.

    # 필터링 없이 모든 구독자에게 뿌린다.
    for q in list(_subscribers):
        q.put(event)
