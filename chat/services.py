from collections.abc import Iterable
from functools import lru_cache

from fastapi import Depends, WebSocket

from users.models import UserModel
from users.schemas import UserResponseSchema
from users.services import UserService, get_user_service

from .exceptions import ChatIntegrityError, ChatPermissionError, ValidationError
from .models import ChatModel, MessageModel
from .repository import ChatRepository, get_chat_repository
from .schemas import (
    AddMembersSchema,
    ChatCreateSchema,
    ChatMemberSchema,
    ChatPatchSchema,
    ChatSchema,
    DeleteMembersSchema,
    InviteCreateSchema,
    InviteMineSchema,
    MessageHistoryDataSchema,
    MessageRequestSchema,
    MessageResponseSchema,
    MessageType,
)


class ChatService:
    def __init__(self, repo: ChatRepository, user_service: UserService) -> None:
        self.repo = repo
        self.user_service = user_service

    async def create(self, data: ChatCreateSchema, user_id: int) -> ChatSchema:
        user = await self.user_service.get(user_id)
        chat = await self.repo.create(data=data, user=user)
        chat_member = ChatMemberSchema(id=user.id, name=user.name, public_key=data.public_key)
        return ChatSchema(
            id=chat.id,
            name=chat.name,
            owner=UserResponseSchema(id=user.id, name=user.name),
            members=[chat_member],
            current_key_version=1,
        )

    async def get(self, chat_id: int) -> ChatSchema:
        chat = await self.repo.get(chat_id=chat_id)
        owner = UserResponseSchema(id=chat.owner.id, name=chat.owner.name)
        members = [
            ChatMemberSchema(id=i.user.id, name=i.user.name, public_key=i.public_key)
            for i in chat.members
        ]

        key_version = await self.repo.get_current_key_version([chat.id])
        return ChatSchema(
            id=chat.id,
            name=chat.name,
            owner=owner,
            members=members,
            current_key_version=key_version[chat.id],
        )

    async def get_many(self, user_id: int) -> list[ChatModel]:
        chats = await self.repo.get_many_by_user(user_id=user_id)
        key_versions = await self.repo.get_current_key_version([i.id for i in chats])
        result = []
        for i in chats:
            owner = UserResponseSchema(id=i.owner.id, name=i.owner.name)
            members = [
                ChatMemberSchema(id=m.user.id, name=m.user.name, public_key=m.public_key)
                for m in i.members
            ]
            result.append(
                ChatSchema(
                    id=i.id,
                    name=i.name,
                    owner=owner,
                    members=members,
                    current_key_version=key_versions[i.id],
                )
            )
        return result

    async def patch(self, data: ChatPatchSchema, user_id: int, chat_id: int) -> ChatSchema:
        if chat_id != data.id:
            raise ValidationError
        user = await self.user_service.get(user_id)
        chat = await self.repo.get(data.id)

        _owner_check(user, chat.owner.id)

        chat = await self.repo.patch(data=data, chat=chat)
        owner = UserResponseSchema(id=chat.owner.id, name=chat.owner.name)
        members = [
            ChatMemberSchema(id=i.user.id, name=i.user.name, public_key=i.public_key)
            for i in chat.members
        ]
        key_version = await self.repo.get_current_key_version([chat.id])
        return ChatSchema(
            id=chat.id,
            name=chat.name,
            owner=owner,
            current_key_version=key_version[chat.id],
            members=members,
        )

    async def delete(self, chat_id: int, user_id: int):
        user = await self.user_service.get(user_id)
        chat = await self.repo.get(chat_id)

        _owner_check(user, chat.owner.id)

        return await self.repo.delete(chat)

    async def create_message(
        self, message: MessageRequestSchema, user: UserModel, chat: ChatSchema
    ) -> MessageModel:
        _member_check(user, {i.id for i in chat.members})
        return await self.repo.create_message(message, user)

    async def get_messages(self, chat_id: int, user_id: int) -> list[MessageHistoryDataSchema]:
        chat = await self.repo.get(chat_id)
        user = await self.user_service.get(user_id)

        _member_check(user, {i.user_id for i in chat.members})

        messages = await self.repo.get_messages(chat_id)

        return [
            MessageHistoryDataSchema(
                id=i.id,
                chat_id=i.chat_id,
                body=i.body,
                nonce=i.nonce,
                created_at=i.created_at,
                key_version=i.chat_key.version,
            )
            for i in messages
        ]

    async def keys(self, user_id: int, chat_id: int, version: int | None = None) -> list[dict]:
        user = await self.user_service.get(user_id)
        chat = await self.repo.get(chat_id)

        _member_check(user, {i.user.id for i in chat.members})

        return await self.repo.keys(chat=chat, user=user, version=version)

    async def add_members(self, chat_id: int, data: AddMembersSchema):

        chat = await self.repo.get(chat_id)

        key_version = await self.repo.get_current_key_version([chat.id])
        if key_version[chat.id] + 1 != data.new_version:
            raise ChatIntegrityError
        new_member_models = await self.user_service.get_many(
            [i.member_id for i in data.new_members]
        )
        data_member_ids = {i.member_id for i in data.new_members}

        if (
            len(new_member_models) != len(data.new_members)
            or {i.id for i in new_member_models} != data_member_ids
            or data_member_ids.union({m.user_id for m in chat.members})
            != {i.user_id for i in data.wrapped_keys}
        ):
            raise ChatIntegrityError

        chat = await self.repo.add_members(
            new_member_models=new_member_models, chat=chat, data=data
        )
        members = [
            ChatMemberSchema(id=i.user.id, name=i.user.name, public_key=i.public_key)
            for i in chat.members
        ]

        return ChatSchema(
            id=chat.id,
            name=chat.name,
            owner=UserResponseSchema(id=chat.owner.id, name=chat.owner.name),
            members=members,
            current_key_version=data.new_version,
        )

    async def delete_members(self, user_id: int, chat_id: int, data: DeleteMembersSchema):
        user = await self.user_service.get(user_id)
        chat = await self.repo.get(chat_id)
        _owner_check(user, chat.owner_id)

        key_version = await self.repo.get_current_key_version([chat.id])
        members_exist = {i.user_id for i in chat.members}
        delete_member_models = await self.user_service.get_many(list(set(data.member_ids)))
        data_member_ids = set(data.member_ids)
        if key_version[chat.id] + 1 != data.new_version or not data_member_ids.issubset(
            members_exist
        ):
            raise ChatIntegrityError

        chat = await self.repo.delete_members(
            delete_member_models=delete_member_models,
            chat=chat,
            data=data,
            data_member_ids=data_member_ids,
        )

        owner = UserResponseSchema(id=chat.owner.id, name=chat.owner.name)
        members = [
            ChatMemberSchema(id=i.user.id, name=i.user.name, public_key=i.public_key)
            for i in chat.members
        ]

        return ChatSchema(
            id=chat.id,
            name=chat.name,
            owner=owner,
            members=members,
            current_key_version=data.new_version,
        )

    async def invite_user(self, chat_id: int, data: InviteCreateSchema, owner_id: int):
        user = await self.user_service.get(owner_id)
        chat = await self.repo.get(chat_id)
        _owner_check(user, chat.owner_id)

        requested_ids = set(data.user_ids)
        member_ids = {member.user_id for member in chat.members}

        user_invite_ids = requested_ids - member_ids

        if len(user_invite_ids) == 0:
            return

        users = await self.user_service.get_many(list(user_invite_ids))

        await self.repo.invite_user(chat=chat, users=users)

    async def get_invites(self, user_id: int) -> list[InviteMineSchema]:
        user = await self.user_service.get(user_id)

        invites = await self.repo.get_invites_by_user(user)

        return [
            InviteMineSchema(id=i.id, chat_name=i.chat.name, chat_id=i.chat.id) for i in invites
        ]

    async def decline_invite(self, user_id: int, invite_id: int):
        user = await self.user_service.get(user_id)
        invite = await self.repo.get_invite(invite_id)

        if invite.user_id != user.id:
            raise ChatPermissionError

        await self.repo.delete_invite(invite)

    async def accept_invite(
        self, invite_id: int, user_id: int, data: AddMembersSchema
    ) -> ChatSchema:
        invite = await self.repo.get_invite(invite_id)
        if invite.user_id != user_id:
            raise ChatPermissionError
        result = await self.add_members(invite.chat_id, data)
        await self.repo.delete_invite(invite)
        return result


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
        chat = await chat_service.get(message.data.chat_id)
        result = await chat_service.create_message(message, user, chat)
        result = {
            "type": MessageType.message,
            "data": {
                **vars(result),
                "key_version": result.chat_key.version,
                "client_msg_id": client_msg_id,
            },
        }
        result = MessageResponseSchema(**result)

        for connection in {self.active_connections.get(i) for i in {i.id for i in chat.members}}:
            if connection is not None:
                await connection.send_json(result.model_dump(mode="json"))


def get_chat_service(
    repo: ChatRepository = Depends(get_chat_repository),
    user_service: UserService = Depends(get_user_service),
) -> ChatService:
    return ChatService(repo=repo, user_service=user_service)


@lru_cache
def get_connection_manager() -> ConnectionManager:
    return ConnectionManager()


def _owner_check(user: UserModel, owner_id: int) -> None:
    if user.id != owner_id:
        raise ChatPermissionError


def _member_check(user: UserModel, member_ids: Iterable[int]) -> None:
    if user.id not in member_ids:
        raise ChatPermissionError
