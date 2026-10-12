from fastapi import Depends

from chat.exceptions import ChatPermissionError
from chat.repository import ChatRepository, get_chat_repository
from chat.schemas import AddMembersSchema, ChatSchema, InviteCreateSchema, InviteMineSchema
from users.services import UserService, get_user_service

from .chat_service import ChatService, get_chat_service


class InvitationService:
    def __init__(self, chat_service: ChatService, user_service: UserService, repo: ChatRepository):
        self.chat_service = chat_service
        self.user_service = user_service
        self.repo = repo

    async def invite_user(self, chat_id: int, data: InviteCreateSchema, owner_id: int):
        user = await self.user_service.get(owner_id)
        chat = await self.repo.get(chat_id)
        self.chat_service._owner_check(user, chat.owner.id)

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
        result = await self.chat_service.add_members(invite.chat_id, data)
        await self.repo.delete_invite(invite)
        return result


def get_invitation_service(
    chat_service: ChatService = Depends(get_chat_service),
    user_service: UserService = Depends(get_user_service),
    repo: ChatRepository = Depends(get_chat_repository),
):
    return InvitationService(chat_service=chat_service, user_service=user_service, repo=repo)
