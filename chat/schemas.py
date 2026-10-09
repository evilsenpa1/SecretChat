from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field

from users.schemas import UserResponseSchema


class ChatMemberSchema(UserResponseSchema):
    public_key: str = Field(..., description="Public key for EE2E (RSE)")


class ChatSchema(BaseModel):
    id: int = Field(..., description="The ID of the chat")
    name: str = Field(..., description="The name of the chat")
    owner: UserResponseSchema = Field(..., description="The owner of the chat")
    members: list[ChatMemberSchema]
    current_key_version: int = Field(..., description="AES key")


class ChatPatchSchema(BaseModel):
    id: int = Field(..., description="The ID of the chat")
    name: str | None = Field(..., description="The name of the chat")
    owner_id: int | None = Field(..., description="The owner of the chat")


class ChatCreateSchema(BaseModel):
    name: str = Field(..., description="The name of the chat")
    public_key: str = Field(..., description="Public key for EE2E (RSE)")
    encrypted_key: str = Field(..., description="AES key")


class ChatKeyMineSchema(BaseModel):
    version: int
    encrypted_key: str
    created_at: datetime


class WrappedKeyItem(BaseModel):
    user_id: int
    encrypted_key: str


class NewMemberKeySchema(BaseModel):
    member_id: int
    public_key: str


class BaseMembersSchema(BaseModel):
    new_version: int  # = current_key_version + 1
    wrapped_keys: list[WrappedKeyItem]  # wrappers for all members (actual)


class AddMembersSchema(BaseMembersSchema):
    new_members: list[NewMemberKeySchema]


class DeleteMembersSchema(BaseMembersSchema):
    member_ids: list[int]


class MessageType(StrEnum):
    message = "message"


class MessageRequestDataSchema(BaseModel):
    chat_id: int
    body: str
    client_msg_id: str
    nonce: str


class MessageRequestSchema(BaseModel):
    type: MessageType
    data: MessageRequestDataSchema


class MessageResponseDataSchema(BaseModel):
    id: int
    chat_id: int
    body: str
    created_at: datetime
    client_msg_id: str
    nonce: str
    key_version: int


class MessageResponseSchema(BaseModel):
    type: MessageType
    data: MessageResponseDataSchema


class MessageHistoryDataSchema(BaseModel):
    id: int
    chat_id: int
    body: str
    nonce: str
    created_at: datetime
    key_version: int


class InviteCreateSchema(BaseModel):
    user_ids: list[int]


class InviteMineSchema(BaseModel):
    id: int
    chat_id: int
    chat_name: str
