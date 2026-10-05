from authx import TokenPayload
from fastapi import APIRouter, Depends, Response, status

from core.dependencies import get_current_user_id
from users.auth import auth

from .schemas import LoginRequestSchema, UserResponseSchema
from .services import UserService, get_user_service

router = APIRouter()


@router.post("/user", status_code=status.HTTP_201_CREATED)
async def create(
    data: LoginRequestSchema, service: UserService = Depends(get_user_service)
):

    await service.create(data)
    return {"result": "ok"}


@router.get("/user/me", response_model=UserResponseSchema)
async def profile(
    service: UserService = Depends(get_user_service),
    user_id: int = Depends(get_current_user_id),
):
    user = await service.get(user_id)
    return user


@router.get("/user/{id}", response_model=UserResponseSchema)
async def get(id: int, service: UserService = Depends(get_user_service)):

    user = await service.get(id)
    return user


@router.post("/auth/login")
async def login(
    data: LoginRequestSchema,
    response: Response,
    service: UserService = Depends(get_user_service),
):

    result = await service.login(data=data, response=response)
    return {"status": result}


@router.post("/auth/refresh")
async def jwt_refresh(
    response: Response,
    payload: TokenPayload = Depends(auth.refresh_token_required),
    service: UserService = Depends(get_user_service),
):

    result = await service.jwt_refresh(response=response, user_id=payload.user_id)
    return {"status": result}
