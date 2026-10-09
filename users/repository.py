import logging
from collections.abc import Collection

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.db.base import get_session

from .exceptions import UserIntegrityError, UserNotFoundError
from .models import UserModel

logger = logging.getLogger(__name__)


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.model = UserModel

    async def create(self, name: str, password: str) -> UserModel:
        try:
            user = self.model(name=name, password=password)
            self.session.add(user)
            await self.session.commit()
        except IntegrityError as err:
            raise UserIntegrityError from err
        return user

    async def get(self, id: int) -> UserModel:
        user = await self.session.get(self.model, id)
        if user is None:
            raise UserNotFoundError
        return user

    async def get_many(self, ids: Collection[int]) -> list[UserModel]:
        result = await self.session.execute(select(self.model).where(self.model.id.in_(ids)))
        result = list(result.scalars().all())

        if len(result) != len(ids):
            result = {i.id for i in result}
            error_ids = set(ids) - result
            logger.warning("Some users did`t found!", extra={"error_ids": error_ids})
            raise UserNotFoundError

        return result

    async def get_filter(self, **kwargs) -> UserModel | None:
        user = await self.session.execute(select(self.model).filter_by(**kwargs))

        return user.scalar_one_or_none()

    async def delete(self, user: UserModel) -> bool:
        await self.session.delete(user)
        await self.session.flush()
        await self.session.commit()

        return True


def get_user_repository(session: AsyncSession = Depends(get_session)) -> UserRepository:
    return UserRepository(session=session)
