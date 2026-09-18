from functools import lru_cache

from fastapi import Depends, WebSocket

from users.models import UserModel
from users.services import UserService, get_user_service

from .exceptions import ChatPermissionError
from .models import ChatModel, MessageModel
from .repository import ChatRepository, get_chat_repository
from .schemas import (
    ChatCreateSchema,
    ChatPatchSchema,
    MessageRequestSchema,
    MessageResponseSchema,
    MessageType,
)


class ChatService:
    def __init__(self, repo: ChatRepository, user_service: UserService) -> None:
        self.repo = repo
        self.user_service = user_service

    async def create(self, data: ChatCreateSchema, user_id: int) -> ChatModel:
        user = await self.user_service.get(user_id)
        return await self.repo.create(name=data.name, user=user)

    async def get(self, chat_id: int) -> ChatModel:
        return await self.repo.get(chat_id=chat_id)

    async def get_many(self, user_id: int) -> list[ChatModel]:
        return await self.repo.get_many_by_user(user_id=user_id)

    async def patch(self, data: ChatPatchSchema, user_id: int) -> ChatModel:
        user = await self.user_service.get(user_id)
        chat = await self.get(data.id)
        if user.id != chat.owner.id:
            raise ChatPermissionError

        return await self.repo.patch(data=data, chat=chat)

    async def delete(self, chat_id: int, user_id: int):
        user = await self.user_service.get(user_id)
        chat = await self.get(chat_id)
        if user.id != chat.owner.id:
            raise ChatPermissionError

        return await self.repo.delete(chat)

    async def create_message(
        self, message: MessageRequestSchema, user: UserModel
    ) -> MessageModel:
        return await self.repo.create_message(message, user)


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: dict[int, WebSocket] = {}

    async def connect(
        self,
        websocket: WebSocket,
        user: UserModel,
    ):

        await websocket.accept()
        self.active_connections[user.id] = websocket
        await websocket.send_text("Connected!")

    def disconnect(self, user_id: int):
        self.active_connections.pop(user_id)

    async def send_personal_message(self, message: str, user: UserModel):
        user_conn = self.active_connections[user.id]
        await user_conn.send_text(message)

    async def broadcast(
        self, message: MessageRequestSchema, user: UserModel, chat_service: ChatService
    ):
        client_msg_id = message.data.client_msg_id
        result = await chat_service.create_message(message, user)
        result = {
            "type": MessageType.message,
            "data": {**vars(result), "client_msg_id": client_msg_id},
        }
        result = MessageResponseSchema(**result)
        for connection in self.active_connections.values():
            await connection.send_json(result.model_dump(mode="json"))


def get_chat_service(
    repo: ChatRepository = Depends(get_chat_repository),
    user_service: UserService = Depends(get_user_service),
) -> ChatService:
    return ChatService(repo=repo, user_service=user_service)


@lru_cache
def get_connection_manager() -> ConnectionManager:
    return ConnectionManager()
