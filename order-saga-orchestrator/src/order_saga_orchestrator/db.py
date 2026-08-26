from contextlib import asynccontextmanager
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from order_saga_orchestrator.config import settings

# engine : connection pool을 관리할 객체
engine = create_async_engine(settings.DATABASE_URL)

# 매 요청/작업마다 새 세션을 만들어주는 팩토리
async_session_factory = async_sessionmaker(
    engine,
    # expire_on_commit : SQLAlchemy 세션은 기본적으로 expire_on_commit=True로, commit()을 호출하면 세션이 추적하던 모든 객체를 expire(만료) 상태로 만든다.
    # 만료된 객체의 속성에 접근하면 SQLAlchemy는 최신 데이터를 다시 가져오기 위해 자동으로 DB에 SELECT쿼리를 다시 날린다.
    expire_on_commit=False,
)


@asynccontextmanager
async def get_session() -> AsyncIterator[AsyncSession]:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
