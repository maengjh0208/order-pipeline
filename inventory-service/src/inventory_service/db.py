from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from inventory_service.config import settings

engine = create_async_engine(settings.DATABASE_URL)

async_session_factory = async_sessionmaker(
    engine,
    expire_on_commit=False,
)


@asynccontextmanager
async def get_session():
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
