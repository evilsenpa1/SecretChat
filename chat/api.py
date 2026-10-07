from json.decoder import JSONDecodeError

from authx import RequestToken, TokenPayload
from fastapi import (
    APIRouter,
    Depends,
    WebSocket,
    WebSocketDisconnect,
    WebSocketException,
)

from core.dependencies import get_current_user_id
from users.auth import auth
from users.exceptions import UserNotFoundError
from users.services import UserService, get_user_service

from .schemas import (
    AddMembersSchema,
    ChatCreateSchema,
    ChatKeyMineSchema,
    ChatPatchSchema,
    ChatSchema,
    DeleteMembersSchema,
    InviteCreateSchema,
    InviteMineSchema,
    MessageHistoryDataSchema,
    MessageRequestSchema,
)
from .services import (
    ChatService,
    ConnectionManager,
    get_chat_service,
    get_connection_manager,
)

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
    chat_service: ChatService = Depends(get_chat_service),
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
                await manager.broadcast(inpt, user, chat_service)
            except JSONDecodeError:
                await manager.send_personal_message(
                    "Message was not delivered, this type of data is unsupported",
                    user=user,
                )
    except WebSocketDisconnect:
        manager.disconnect(user_id=user.id)


@router.post("/chat", response_model=ChatSchema)
async def create(
    data: ChatCreateSchema,
    user_id: int = Depends(get_current_user_id),
    chat_service: ChatService = Depends(get_chat_service),
):

    chat = await chat_service.create(data, user_id)

    return chat


@router.patch("/chat", response_model=ChatSchema)
async def patch(
    data: ChatPatchSchema,
    user_id: int = Depends(get_current_user_id),
    chat_service: ChatService = Depends(get_chat_service),
):
    result = await chat_service.patch(data, user_id)

    return result


@router.get("/chat/{chat_id}", response_model=ChatSchema)
async def get(chat_id: int, chat_service: ChatService = Depends(get_chat_service)):
    chat = await chat_service.get(chat_id)
    return chat


@router.get(
    "/chat/{chat_id}/messages",
    response_model=list[MessageHistoryDataSchema],
)
async def get_messages(
    chat_id: int,
    chat_service: ChatService = Depends(get_chat_service),
    user_id: int = Depends(get_current_user_id),
):
    return await chat_service.get_messages(chat_id, user_id)


@router.get("/chat", response_model=list[ChatSchema])
async def get_many(
    chat_service: ChatService = Depends(get_chat_service),
    user_id: int = Depends(get_current_user_id),
):

    chat = await chat_service.get_many(user_id)
    return chat


@router.delete("/chat/{chat_id}")
async def delete(
    chat_id: int,
    user_id: int = Depends(get_current_user_id),
    chat_service: ChatService = Depends(get_chat_service),
):

    await chat_service.delete(chat_id=chat_id, user_id=user_id)
    return {"status": "Ok"}


@router.get("/chat/{chat_id}/keys", response_model=list[ChatKeyMineSchema])
async def keys(
    chat_id: int,
    user_id: int = Depends(get_current_user_id),
    chat_service: ChatService = Depends(get_chat_service),
):
    return await chat_service.keys(user_id=user_id, chat_id=chat_id)


@router.get("/chat/{chat_id}/keys/{version}", response_model=list[ChatKeyMineSchema])
async def version_key(
    chat_id: int,
    version: int,
    user_id: int = Depends(get_current_user_id),
    chat_service: ChatService = Depends(get_chat_service),
):
    return await chat_service.keys(user_id=user_id, chat_id=chat_id, version=version)


# @router.post("/chat/{chat_id}/members", response_model=ChatSchema)
# async def members_add(
#     data: AddMembersSchema,
#     chat_id: int,
#     user_id: int = Depends(get_current_user_id),
#     chat_service: ChatService = Depends(get_chat_service),
# ):
#     return await chat_service.add_members(chat_id=chat_id, user_id=user_id, data=data)


@router.delete("/chat/{chat_id}/members", response_model=ChatSchema)
async def members_delete(
    data: DeleteMembersSchema,
    chat_id: int,
    member_id: int,
    user_id: int = Depends(get_current_user_id),
    chat_service: ChatService = Depends(get_chat_service),
):
    return await chat_service.delete_members(chat_id=chat_id, user_id=user_id, data=data)


@router.get("/chat/invites/me", response_model=list[InviteMineSchema])
async def get_invites(
    user_id: int = Depends(get_current_user_id),
    chat_service: ChatService = Depends(get_chat_service),
):
    return await chat_service.get_invites(user_id=user_id)


@router.post("/chat/{chat_id}/invites/", status_code=201)
async def invite_user(
    chat_id: int,
    data: InviteCreateSchema,
    owner_id: int = Depends(get_current_user_id),
    chat_service: ChatService = Depends(get_chat_service),
):
    await chat_service.invite_user(chat_id=chat_id, data=data, owner_id=owner_id)


@router.post("/chat/invites/{invite_id}/accept", response_model=ChatSchema)
async def accept_invite(
    data: AddMembersSchema,
    invite_id: int,
    user_id: int = Depends(get_current_user_id),
    chat_service: ChatService = Depends(get_chat_service),
):
    return await chat_service.accept_invite(invite_id=invite_id, user_id=user_id, data=data)


@router.delete("/chat/invites/{invite_id}/decline/", status_code=204)
async def decline_invite(
    invite_id: int,
    user_id: int = Depends(get_current_user_id),
    chat_service: ChatService = Depends(get_chat_service),
):
    await chat_service.decline_invite(user_id=user_id, invite_id=invite_id)
