from typing import TYPE_CHECKING

from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.db.base import Base

if TYPE_CHECKING:
    from chat.models import ChatInviteModel, ChatUserAssociation


class UserModel(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True)
    password: Mapped[str] = mapped_column()
    chats: Mapped[list["ChatUserAssociation"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    chat_invites: Mapped[list["ChatInviteModel"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
