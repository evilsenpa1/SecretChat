from fastapi import APIRouter

from .base import Base, engine

router = APIRouter()


@router.post("/create_db")
async def create_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    return {"db": "created"}
