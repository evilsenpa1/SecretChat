from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.db.base import get_session

from .exceptions import UserIntegrityError, UserNotFoundError
from .models import UserModel


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.model = UserModel

    async def create(self, name: str, password: str) -> bool:
        try:
            self.session.add(self.model(name=name, password=password))
            await self.session.commit()
        except IntegrityError as err:
            raise UserIntegrityError from err
        return True

    async def get(self, id: int) -> UserModel:
        user = await self.session.get(self.model, id)
        if user is None:
            raise UserNotFoundError
        return user

    async def get_filter(self, **kwargs) -> UserModel | None:
        user = await self.session.execute(select(self.model).filter_by(**kwargs))

        user = user.scalar_one_or_none()
        return user


def get_user_repository(session: AsyncSession = Depends(get_session)) -> UserRepository:
    return UserRepository(session=session)
