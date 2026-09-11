from fastapi import APIRouter, Depends, Response, status
from fastapi.exceptions import HTTPException

from users.auth import auth

from .exceptions import UserIntegrityError, UserNotFoundError, UserPermissionError
from .schemas import LoginRequestSchema, UserResponseSchema
from .services import UserService, get_user_service

router = APIRouter()


@router.post("/user", status_code=status.HTTP_201_CREATED)
async def create(data: LoginRequestSchema, service: UserService = Depends(get_user_service)):
    try:
        await service.create(data)
    except UserIntegrityError:
        raise HTTPException(409, "Cannot create user with this data") from None
    return {"result": "ok"}


@router.get("/user/{id}", response_model=UserResponseSchema)
async def get(id: int, service: UserService = Depends(get_user_service)):
    try:
        user = await service.get(id)
    except UserNotFoundError:
        raise HTTPException(404, "Not Found") from None
    return user


@router.post("/auth")
async def login(
    data: LoginRequestSchema, response: Response, service: UserService = Depends(get_user_service)
):
    try:
        await service.login(data=data, response=response)
    except (UserNotFoundError, UserPermissionError):
        raise HTTPException(401, detail="Invalid credentials") from None
    return {"status": "Ok"}


@router.get("/protected", dependencies=[Depends(auth.access_token_required)])
async def protected():
    return {"message": "Hello World"}
