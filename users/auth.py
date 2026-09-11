from datetime import timedelta

from authx import AuthX, AuthXConfig
from fastapi import FastAPI

from core.settings import get_settings

app = FastAPI()

settings = get_settings()

config = AuthXConfig(
    JWT_SECRET_KEY=settings.JWT_SECRET_KEY,
    JWT_ALGORITHM="HS256",
    JWT_ACCESS_COOKIE_NAME="access_token",
    JWT_REFRESH_COOKIE_NAME="refresh_token",
    JWT_ACCESS_TOKEN_EXPIRES=timedelta(minutes=30),
    JWT_REFRESH_TOKEN_EXPIRES=timedelta(days=7),
    JWT_TOKEN_LOCATION=["cookies"],
    JWT_COOKIE_SECURE=not settings.DEBUG,
    JWT_COOKIE_SAMESITE="lax",
    JWT_COOKIE_CSRF_PROTECT=True,
)

auth = AuthX(config=config)
auth.handle_errors(app)
