from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.db.base import Base


class ChatUserAssociation(Base):
    __tablename__ = "chat_user_association"

    chat_id: Mapped[int] = mapped_column(ForeignKey("chats.id"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    public_key: Mapped[str] = mapped_column(String, nullable=True)

    chat: Mapped["ChatModel"] = relationship(back_populates="members")
    user: Mapped["UserModel"] = relationship(back_populates="chats")


if TYPE_CHECKING:
    from users.models import UserModel


class ChatKeyModel(Base):
    __tablename__ = "chat_keys"

    id: Mapped[int] = mapped_column(primary_key=True)
    chat_id: Mapped[int] = mapped_column(ForeignKey("chats.id"))
    version: Mapped[int] = mapped_column()  # increment after rotation
    created_at: Mapped[datetime] = mapped_column()

    chat: Mapped["ChatModel"] = relationship(back_populates="keys")
    wrapped_keys: Mapped[list["ChatKeyRecipient"]] = relationship(
        back_populates="chat_key", cascade="all, delete-orphan"
    )


class ChatKeyRecipient(Base):
    __tablename__ = "chat_key_recipients"

    chat_key_id: Mapped[int] = mapped_column(
        ForeignKey("chat_keys.id"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    encrypted_key: Mapped[str] = mapped_column(
        String
    )  # base64(RSA-OAEP(aes_key, user.public_key))

    chat_key: Mapped["ChatKeyModel"] = relationship(back_populates="wrapped_keys")


class ChatInviteModel(Base):
    __tablename__ = "chat_invites"

    id: Mapped[int] = mapped_column(primary_key=True)
    chat_id: Mapped[int] = mapped_column(ForeignKey("chats.id", ondelete="CASCADE"))
    chat: Mapped["ChatModel"] = relationship(back_populates="invites")
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    user: Mapped["UserModel"] = relationship(back_populates="chat_invites")


class ChatModel(Base):
    __tablename__ = "chats"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column()
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    owner: Mapped["UserModel"] = relationship("UserModel", foreign_keys=[owner_id])
    members: Mapped[list["ChatUserAssociation"]] = relationship(
        back_populates="chat", cascade="all, delete-orphan"
    )
    messages: Mapped[list["MessageModel"]] = relationship(
        "MessageModel", back_populates="chat", cascade="all, delete-orphan"
    )
    keys: Mapped[list["ChatKeyModel"]] = relationship(
        back_populates="chat", cascade="all, delete-orphan"
    )
    invites: Mapped[list["ChatInviteModel"]] = relationship(
        back_populates="chat", cascade="all, delete-orphan"
    )


class MessageModel(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    chat_key_id: Mapped[int] = mapped_column(ForeignKey("chat_keys.id"))
    chat_key: Mapped["ChatKeyModel"] = relationship("ChatKeyModel")
    nonce: Mapped[str] = mapped_column()
    body: Mapped[str] = mapped_column()
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    owner: Mapped["UserModel"] = relationship("UserModel", foreign_keys=[owner_id])
    chat_id: Mapped[int] = mapped_column(ForeignKey("chats.id"))
    chat: Mapped[ChatModel] = relationship(
        ChatModel, foreign_keys=[chat_id], back_populates="messages"
    )
    created_at: Mapped[datetime] = mapped_column()
