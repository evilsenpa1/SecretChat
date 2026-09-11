from json.decoder import JSONDecodeError

from authx import RequestToken, TokenPayload
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, WebSocketException, status
from fastapi.exceptions import HTTPException

from core.dependencies import get_current_user_id
from users.auth import auth
from users.exceptions import UserNotFoundError
from users.services import UserService, get_user_service

from .exceptions import ChatNotFoundError, ChatPermissionError
from .schemas import ChatCreateSchema, ChatPatchSchema, ChatSchema, MessageRequestSchema
from .services import ChatService, ConnectionManager, get_chat_service, get_connection_manager

router = APIRouter()


async def _socket_access_token_required(
    websocket: WebSocket,
):
    access_token = websocket.cookies.get("access_token")
    csrf = websocket.cookies.get("csrf_access_token")
    if access_token is None or csrf is None:
        raise WebSocketException(code=3000, reason="Not authenticated")
    access_token = RequestToken(token=access_token, location="cookies", csrf=csrf)
    return auth.verify_token(access_token)


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    payload: TokenPayload = Depends(_socket_access_token_required),
    manager: ConnectionManager = Depends(get_connection_manager),
    user_service: UserService = Depends(get_user_service),
):
    try:
        user = await user_service.get(payload.user_id)
    except UserNotFoundError as err:
        raise WebSocketException(code=3000, reason="User not found") from err

    await manager.connect(websocket, user=user)

    try:
        while True:
            try:
                inpt = await websocket.receive_json()
                inpt = MessageRequestSchema(**inpt)
                await manager.broadcast(inpt, user)
            except JSONDecodeError:
                await manager.send_personal_message(
                    "Message was not delivered, this type of data is unsupported", user=user
                )
    except WebSocketDisconnect:
        manager.disconnect(user_id=user.id)
        # await manager.broadcast(f"Client [{user.name}] left the chat")


@router.post("/chat", response_model=ChatSchema)
async def create(
    data: ChatCreateSchema,
    user_id: int = Depends(get_current_user_id),
    chat_service: ChatService = Depends(get_chat_service),
):

    try:
        chat = await chat_service.create(data, user_id)
    except UserNotFoundError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found") from err

    return chat


@router.patch("/chat", response_model=ChatSchema)
async def patch(
    data: ChatPatchSchema,
    user_id: int = Depends(get_current_user_id),
    chat_service: ChatService = Depends(get_chat_service),
):
    try:
        result = await chat_service.patch(data, user_id)
    except ChatPermissionError as err:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied"
        ) from err

    return result


@router.get("/chat/{chat_id}", response_model=ChatSchema)
async def get(chat_id: int, chat_service: ChatService = Depends(get_chat_service)):
    try:
        chat = await chat_service.get(chat_id)
    except ChatNotFoundError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found") from err
    return chat


@router.get("/chat", response_model=list[ChatSchema])
async def get_many(
    chat_service: ChatService = Depends(get_chat_service),
    user_id: int = Depends(get_current_user_id),
):

    chat = await chat_service.get_many(user_id)
    return chat
