from datetime import datetime
from typing import Iterable

from fastapi import Depends
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from chat.exceptions import ChatIntegrityError, ChatNotFoundError
from core.db.base import get_session
from users.models import UserModel

from .models import (
    ChatInviteModel,
    ChatKeyModel,
    ChatKeyRecipient,
    ChatModel,
    ChatUserAssociation,
    MessageModel,
)
from .schemas import (
    AddMembersSchema,
    ChatCreateSchema,
    ChatPatchSchema,
    DeleteMembersSchema,
    MessageRequestSchema,
)


class ChatRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.model = ChatModel
        self.message_model = MessageModel

    async def create(self, data: ChatCreateSchema, user: UserModel) -> ChatModel:
        link = ChatUserAssociation(user=user, public_key=data.public_key)
        chat = self.model(name=data.name, owner=user, members=[link])
        self.session.add(chat)
        await self.session.flush()

        chat_key = ChatKeyModel(chat_id=chat.id, version=1, created_at=datetime.now())
        self.session.add(chat_key)
        await self.session.flush()

        self.session.add(
            ChatKeyRecipient(
                user_id=user.id,
                encrypted_key=data.encrypted_key,
                chat_key_id=chat_key.id,
            )
        )
        await self.session.commit()
        await self.session.refresh(chat, attribute_names=["owner", "members"])
        return chat

    async def get(self, chat_id: int) -> ChatModel:
        chat = (
            select(self.model)
            .where(self.model.id == chat_id)
            .options(
                joinedload(self.model.owner),
                selectinload(self.model.members).selectinload(ChatUserAssociation.user),
                selectinload(self.model.invites),
            )
        )
        chat = await self.session.execute(chat)
        chat = chat.scalar_one_or_none()
        if chat is None:
            raise ChatNotFoundError
        return chat

    async def get_current_key_version(self, chat_ids: Iterable[int]) -> dict[int, int]:
        stmt = (
            select(ChatKeyModel.chat_id, func.max(ChatKeyModel.version))
            .where(ChatKeyModel.chat_id.in_(chat_ids))
            .group_by(ChatKeyModel.chat_id)
        )
        result = await self.session.execute(stmt)

        return {i: x for i, x in result.all()}

    async def get_many_by_user(self, user_id: int) -> list[ChatModel]:
        chat = (
            select(ChatModel)
            .where(
                ChatModel.members.any(ChatUserAssociation.user_id == user_id),
            )
            .options(
                selectinload(self.model.owner).load_only(UserModel.id, UserModel.name),
                selectinload(self.model.members)
                .selectinload(ChatUserAssociation.user)
                .load_only(UserModel.id, UserModel.name),
            )
        )
        chat = await self.session.execute(chat)

        return list(chat.scalars().all())

    async def patch(self, data: ChatPatchSchema, chat: ChatModel) -> ChatModel:
        payload = data.model_dump(exclude_unset=True)

        new_owner_id = payload.get("owner_id")

        if new_owner_id is None:
            payload.pop("owner_id")
        elif new_owner_id is not None and not any(
            member.user_id == new_owner_id for member in chat.members
        ):
            raise ChatIntegrityError

        for key, value in payload.items():
            setattr(chat, key, value)

        await self.session.commit()
        await self.session.refresh(chat, attribute_names=["owner", "members"])
        return chat

    async def delete(self, chat: ChatModel) -> None:
        await self.session.delete(chat)
        await self.session.flush()
        await self.session.commit()

    async def create_message(
        self, message: MessageRequestSchema, user: UserModel
    ) -> MessageModel:
        chat = await self.get(message.data.chat_id)
        date = datetime.today()

        key_version = (
            select(func.max(ChatKeyModel.version))
            .where(ChatKeyModel.chat_id == message.data.chat_id)
            .group_by(ChatKeyModel.chat_id)
        ).scalar_subquery()

        actual_key = (
            select(ChatKeyModel)
            .where(ChatKeyModel.version == key_version)
            .where(ChatKeyModel.chat_id == message.data.chat_id)
        )
        actual_key = await self.session.execute(actual_key)
        actual_key = actual_key.scalar_one()

        result = self.message_model(
            body=message.data.body,
            owner=user,
            chat=chat,
            created_at=date,
            nonce=message.data.nonce,
            chat_key=actual_key,
        )
        self.session.add(result)
        await self.session.commit()
        await self.session.refresh(result, attribute_names=["owner"])
        return result

    async def get_messages(self, chat_id) -> list[MessageModel]:
        messages = (
            select(MessageModel)
            .where(MessageModel.chat_id == chat_id)
            .options(selectinload(MessageModel.chat_key))
        )

        messages = await self.session.execute(messages)

        return list(messages.scalars().all())

    async def keys(
        self, chat: ChatModel, user: UserModel, version: None | int
    ) -> list[dict]:
        keys = (
            select(
                ChatKeyRecipient.encrypted_key,
                ChatKeyModel.version,
                ChatKeyModel.created_at,
            )
            .join(ChatKeyRecipient.chat_key)
            .where(ChatKeyModel.chat_id == chat.id, ChatKeyRecipient.user_id == user.id)
        )
        if version is not None:
            keys.where(ChatKeyModel.version == version)

        result = await self.session.execute(keys)
        return list(result.mappings().all())

    async def add_members(
        self,
        new_member_models: Iterable[UserModel],
        chat: ChatModel,
        data: AddMembersSchema,
    ):
        new_member_models = list(new_member_models)
        new_member_models.sort(key=lambda x: x.id)
        new_members = data.new_members
        new_members.sort(key=lambda x: x.member_id)
        members_zipped = zip(new_member_models, new_members)

        links = []
        for model, schema in members_zipped:
            links.append(ChatUserAssociation(user=model, public_key=schema.public_key))

        links.extend(chat.members)
        chat.members = links
        self.session.add(chat)
        await self.session.flush()

        chat_key = ChatKeyModel(
            chat_id=chat.id, version=data.new_version, created_at=datetime.now()
        )
        self.session.add(chat_key)
        await self.session.flush()

        for k in data.wrapped_keys:
            self.session.add(
                ChatKeyRecipient(
                    user_id=k.user_id,
                    encrypted_key=k.encrypted_key,
                    chat_key_id=chat_key.id,
                )
            )
        await self.session.commit()
        await self.session.refresh(chat, attribute_names=["owner", "members"])
        return chat

    async def delete_members(
        self,
        delete_member_models: Iterable[UserModel],
        chat: ChatModel,
        data: DeleteMembersSchema,
        data_member_ids: Iterable[int],
    ):

        await self.session.execute(
            delete(ChatUserAssociation)
            .where(ChatUserAssociation.chat_id == chat.id)
            .where(ChatUserAssociation.user_id.in_(data_member_ids))
        )

        chat_key_ids = select(ChatKeyModel.id).where(ChatKeyModel.chat_id == chat.id)

        await self.session.execute(
            delete(ChatKeyRecipient)
            .where(ChatKeyRecipient.chat_key_id.in_(chat_key_ids))
            .where(ChatKeyRecipient.user_id.in_(data_member_ids))
        )

        chat_key = ChatKeyModel(
            chat_id=chat.id, version=data.new_version, created_at=datetime.now()
        )
        self.session.add(chat_key)
        await self.session.flush()

        for k in data.wrapped_keys:
            self.session.add(
                ChatKeyRecipient(
                    user_id=k.user_id,
                    encrypted_key=k.encrypted_key,
                    chat_key_id=chat_key.id,
                )
            )

        await self.session.commit()
        await self.session.refresh(chat, attribute_names=["owner", "members"])
        return chat

    async def invite_user(self, chat: ChatModel, users: list[UserModel]):

        for i in users:
            invite = ChatInviteModel(chat=chat, user=i)
            self.session.add(invite)

        await self.session.commit()

    async def get_invites_by_user(self, user: UserModel) -> list[ChatInviteModel]:
        invites = (
            select(ChatInviteModel)
            .where(ChatInviteModel.user_id == user.id)
            .options(joinedload(ChatInviteModel.chat))
        )

        invites = await self.session.execute(invites)

        return list(invites.scalars().all())

    async def get_invite(self, invite_id: int) -> ChatInviteModel:
        invite = select(ChatInviteModel).where(ChatInviteModel.id == invite_id)

        invite = await self.session.execute(invite)

        return invite.scalar_one()

    async def delete_invite(self, invite: ChatInviteModel):
        await self.session.delete(invite)
        await self.session.flush()
        await self.session.commit()


def get_chat_repository(
    session: AsyncSession = Depends(get_session),
) -> ChatRepository:
    return ChatRepository(session=session)
