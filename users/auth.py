from datetime import timedelta

from authx import AuthX, AuthXConfig
from fastapi import FastAPI, Response

from core.settings import get_settings

app = FastAPI()

settings = get_settings()

config = AuthXConfig(
    JWT_SECRET_KEY=settings.JWT_SECRET_KEY,
    JWT_ALGORITHM="HS256",
    JWT_ACCESS_COOKIE_NAME="access_token",
    JWT_REFRESH_COOKIE_NAME="refresh_token",
    JWT_ACCESS_TOKEN_EXPIRES=timedelta(seconds=settings.JWT_ACCESS_TTL),
    JWT_REFRESH_TOKEN_EXPIRES=timedelta(seconds=settings.JWT_REFRESH_TTL),
    JWT_TOKEN_LOCATION=["cookies"],
    JWT_COOKIE_SECURE=not settings.DEBUG,
    JWT_COOKIE_SAMESITE="lax",
    JWT_COOKIE_CSRF_PROTECT=True,
)

auth = AuthX(config=config)
auth.handle_errors(app)


def set_jwt_pair(username: str, user_id: int, response: Response):
    access = auth.create_access_token(uid=username, data={"user_id": user_id})
    refresh = auth.create_refresh_token(uid=username, data={"user_id": user_id})

    auth.set_access_cookies(access, response, max_age=settings.JWT_ACCESS_TTL)
    auth.set_refresh_cookies(refresh, response, max_age=settings.JWT_REFRESH_TTL)
