from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Column, ForeignKey, Table
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.db.base import Base

chat_user_association_table = Table(
    "chat_user_association_table",
    Base.metadata,
    Column("user_id", ForeignKey("users.id"), primary_key=True),
    Column("chat_id", ForeignKey("chats.id"), primary_key=True),
)

if TYPE_CHECKING:
    from users.models import UserModel


class ChatModel(Base):
    __tablename__ = "chats"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column()
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    owner: Mapped["UserModel"] = relationship("UserModel", foreign_keys=[owner_id])
    members: Mapped[list["UserModel"]] = relationship(
        secondary=chat_user_association_table, back_populates="chats", lazy="selectin"
    )


class MessageModel(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    body: Mapped[str] = mapped_column()
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    owner: Mapped["UserModel"] = relationship("UserModel", foreign_keys=[owner_id])
    chat_id: Mapped[int] = mapped_column(ForeignKey("chats.id"))
    chat: Mapped[ChatModel] = relationship(ChatModel, foreign_keys=[chat_id])
    created_at: Mapped[datetime] = mapped_column()
