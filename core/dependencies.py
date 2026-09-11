from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from users.auth import auth

from .db.base import get_session

SessionDep = Annotated[AsyncSession, Depends(get_session)]


def get_current_user_id(payload=Depends(auth.access_token_required)) -> int:
    return payload.user_id
