from typing import TYPE_CHECKING

from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.db.base import Base

if TYPE_CHECKING:
    from chat.models import ChatModel


class UserModel(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True)
    password: Mapped[str] = mapped_column()
    chats: Mapped[list["ChatModel"]] = relationship(
        secondary="chat_user_association_table", back_populates="members"
    )
