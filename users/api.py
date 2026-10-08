from authx import TokenPayload
from fastapi import APIRouter, Depends, Response, status

from core.dependencies import get_current_user_id
from users.auth import auth
from users.exceptions import UserPermissionError

from .schemas import LoginRequestSchema, UserResponseSchema
from .services import UserService, get_user_service

router = APIRouter()


@router.post("/users", status_code=status.HTTP_201_CREATED, response_model=UserResponseSchema)
async def create(data: LoginRequestSchema, service: UserService = Depends(get_user_service)):

    return await service.create(data)


@router.get("/users/me", response_model=UserResponseSchema)
async def profile(
    service: UserService = Depends(get_user_service),
    user_id: int = Depends(get_current_user_id),
):

    return await service.get(user_id)


@router.get("/users/{id}", response_model=UserResponseSchema)
async def get(id: int, service: UserService = Depends(get_user_service)):

    return await service.get(id)


@router.post("/users/login", response_model=UserResponseSchema)
async def login(
    data: LoginRequestSchema,
    response: Response,
    service: UserService = Depends(get_user_service),
):

    return await service.login(data=data, response=response)


@router.post("/users/refresh-jwt")
async def jwt_refresh(
    response: Response,
    payload: TokenPayload = Depends(auth.refresh_token_required),
    service: UserService = Depends(get_user_service),
):

    result = await service.jwt_refresh(response=response, user_id=payload.user_id)
    return {"status": result}


@router.delete("/users/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(
    id: int,
    service: UserService = Depends(get_user_service),
    user_id: int = Depends(get_current_user_id),
):
    if user_id != id:
        raise UserPermissionError
    await service.delete(id=id)
