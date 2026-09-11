from datetime import datetime

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from chat.exceptions import ChatNotFoundError
from core.db.base import get_session
from users.models import UserModel

from .models import ChatModel, MessageModel
from .schemas import ChatPatchSchema, MessageRequestSchema


class ChatRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.model = ChatModel
        self.message_model = MessageModel

    async def create(self, name: str, user: UserModel) -> ChatModel:
        chat = self.model(name=name, owner=user, members=[user])
        self.session.add(chat)
        await self.session.commit()
        await self.session.refresh(chat, attribute_names=["owner", "members"])
        return chat

    async def get(self, chat_id: int) -> ChatModel:
        chat = await self.session.get(self.model, chat_id)
        if chat is None:
            raise ChatNotFoundError
        return chat

    async def get_many_by_user(self, user_id: int) -> list[ChatModel]:
        chat = select(ChatModel).where(
            ChatModel.members.any(UserModel.id == user_id),
        )
        chat = await self.session.execute(chat)

        return list(chat.scalars().all())

    async def patch(self, data: ChatPatchSchema, chat: ChatModel) -> ChatModel:
        payload = data.model_dump(exclude_unset=True)

        member_ids = payload.pop("member_ids", None)
        if member_ids is not None:
            member_ids = set(member_ids)

        for key, value in payload.items():
            setattr(chat, key, value)

        if "owner_id" in payload:
            member_ids.add(payload["owner_id"])

        if member_ids is not None:
            result = await self.session.execute(
                select(UserModel).where(UserModel.id.in_(member_ids))
            )
            members = result.scalars().all()

            if len(members) != len(set(member_ids)):
                raise ValueError("Some member ids do not exist")

            chat.members = list(members)  # for recount diffs in association-table

        await self.session.commit()
        await self.session.refresh(chat, attribute_names=["owner", "members"])
        return chat

    async def create_message(self, message: MessageRequestSchema, user: UserModel) -> MessageModel:
        chat = await self.get(message.data.chat_id)
        date = datetime.today()
        result = self.message_model(body=message.data.body, owner=user, chat=chat, created_at=date)
        self.session.add(result)
        await self.session.commit()
        await self.session.refresh(result, attribute_names=["owner"])
        return result


def get_chat_repository(
    session: AsyncSession = Depends(get_session),
) -> ChatRepository:
    return ChatRepository(session=session)
