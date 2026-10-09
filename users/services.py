from collections.abc import Collection

import bcrypt
from fastapi import Depends, Response

from .auth import auth, set_jwt_pair
from .exceptions import UserIntegrityError, UserNotFoundError, UserPermissionError
from .models import UserModel
from .repository import UserRepository, get_user_repository
from .schemas import LoginRequestSchema


class UserService:
    def __init__(self, repo: UserRepository) -> None:
        self.repo = repo

    async def get(self, id: int) -> UserModel:
        return await self.repo.get(id)

    async def get_many(self, ids: Collection[int]) -> list[UserModel]:
        return await self.repo.get_many(ids)

    async def create(self, data: LoginRequestSchema) -> UserModel:
        user = await self.repo.get_filter(name=data.name)
        if user is not None:
            raise UserIntegrityError
        hashed = bcrypt.hashpw(bytes(data.password.encode()), bcrypt.gensalt(rounds=15)).decode(
            "utf-8"
        )
        return await self.repo.create(name=data.name, password=hashed)

    async def delete(self, id: int) -> bool:
        user = await self.repo.get(id)
        if user.id != id:
            raise UserPermissionError
        await self.repo.delete(user)

        return True

    async def login(self, data: LoginRequestSchema, response) -> UserModel:
        user = await self.repo.get_filter(name=data.name)
        if user is None:
            raise UserNotFoundError

        name = user.name
        password = user.password
        if name == data.name and bcrypt.checkpw(data.password.encode(), password.encode()):
            set_jwt_pair(user.name, user.id, response)

            return user
        raise UserPermissionError

    async def jwt_refresh(self, response: Response, user_id: int) -> bool:

        user = await self.repo.get(user_id)

        auth.unset_cookies(response)

        set_jwt_pair(user.name, user.id, response)

        return True


def get_user_service(repo: UserRepository = Depends(get_user_repository)):
    return UserService(repo=repo)
