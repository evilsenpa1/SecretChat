from enum import StrEnum

from pydantic import BaseModel, Field
from datetime import datetime
from users.schemas import UserResponseSchema


class ChatSchema(BaseModel):
    id: int = Field(..., description="The ID of the chat")
    name: str = Field(..., description="The name of the chat")
    owner: UserResponseSchema = Field(..., description="The owner of the chat")
    members: list[UserResponseSchema]


class ChatPatchSchema(BaseModel):
    id: int = Field(..., description="The ID of the chat")
    name: str | None = Field(..., description="The name of the chat")
    owner_id: int | None = Field(..., description="The owner of the chat")
    member_ids: list[int] | None


class ChatCreateSchema(BaseModel):
    name: str = Field(..., description="The name of the chat")


class MessageType(StrEnum):
    message = "message"


class MessageRequestDataSchema(BaseModel):
    chat_id: int
    body: str
    client_msg_id: str


class MessageRequestSchema(BaseModel):
    type: MessageType
    data: MessageRequestDataSchema


class MessageResponseDataSchema(BaseModel):
    id: int
    chat_id: int
    body: str
    client_msg_id: str


class MessageResponseSchema(BaseModel):
    type: MessageType
    data: MessageResponseDataSchema

class MessageHistoryDataSchema(BaseModel):
    id: int
    chat_id: int
    body: str
    created_at: datetime