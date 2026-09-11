import bcrypt
from fastapi import Depends

from .auth import auth
from .exceptions import UserIntegrityError, UserNotFoundError, UserPermissionError
from .models import UserModel
from .repository import UserRepository, get_user_repository
from .schemas import LoginRequestSchema


class UserService:
    def __init__(self, repo: UserRepository) -> None:
        self.repo = repo

    async def get(self, id: int) -> UserModel:
        return await self.repo.get(id)

    async def create(self, data: LoginRequestSchema) -> bool:
        user = await self.repo.get_filter(name=data.name)
        if user is not None:
            raise UserIntegrityError
        hashed = bcrypt.hashpw(bytes(data.password.encode()), bcrypt.gensalt(rounds=16)).decode(
            "utf-8"
        )
        return await self.repo.create(name=data.name, password=hashed)

    async def delete(self):
        pass

    async def login(self, data: LoginRequestSchema, response) -> bool:
        user = await self.repo.get_filter(name=data.name)
        if user is None:
            raise UserNotFoundError

        name = user.name
        password = user.password
        if name == data.name and bcrypt.checkpw(data.password.encode(), password.encode()):
            access = auth.create_access_token(uid=name, data={"user_id": user.id})
            refresh = auth.create_refresh_token(uid=name)

            auth.set_access_cookies(access, response, max_age=300 * 60)
            auth.set_refresh_cookies(refresh, response, max_age=3600 * 24 * 5)

            return True
        raise UserPermissionError


def get_user_service(repo: UserRepository = Depends(get_user_repository)):
    return UserService(repo=repo)
