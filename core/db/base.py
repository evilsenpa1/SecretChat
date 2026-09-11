from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from core.settings import get_settings

settings = get_settings()

engine = create_async_engine(str(settings.pg_dsn))


SessionLocal = async_sessionmaker(
    autocommit=False, autoflush=False, expire_on_commit=False, bind=engine
)


class Base(DeclarativeBase):
    pass


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session


@asynccontextmanager
async def get_session_ctx() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
