from fastapi import APIRouter, Depends, Response, status

from .schemas import LoginRequestSchema, UserResponseSchema
from .services import UserService, get_user_service

router = APIRouter()


@router.post("/user", status_code=status.HTTP_201_CREATED)
async def create(data: LoginRequestSchema, service: UserService = Depends(get_user_service)):

    await service.create(data)
    return {"result": "ok"}


@router.get("/user/{id}", response_model=UserResponseSchema)
async def get(id: int, service: UserService = Depends(get_user_service)):

    user = await service.get(id)
    return user


@router.post("/auth")
async def login(
    data: LoginRequestSchema, response: Response, service: UserService = Depends(get_user_service)
):

    await service.login(data=data, response=response)
    return {"status": "Ok"}
