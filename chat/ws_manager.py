import asyncio
from collections import defaultdict
from functools import lru_cache

import redis.asyncio as redis
from fastapi import WebSocket

from chat.schemas import MessageRequestSchema, MessageResponseSchema, MessageType
from chat.services import ChatService
from users.models import UserModel

r = redis.Redis(decode_responses=True, host="redis")

KEEPALIVE_CHANNEL = "ws:keepalive"


def user_channel(user_id: int) -> str:
    return f"ws:user:{user_id}"


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: dict[int, set[WebSocket]] = defaultdict(set)
        self.pubsub = r.pubsub()
        self._listener: asyncio.Task | None = None

    async def start(self) -> None:
        await self.pubsub.subscribe(KEEPALIVE_CHANNEL)
        self._listener = asyncio.create_task(self._listen())

    async def stop(self) -> None:
        if self._listener:
            self._listener.cancel()
        await self.pubsub.aclose()  # redis-py >= 5.0.1

    async def _listen(self) -> None:
        async for msg in self.pubsub.listen():
            if msg["type"] != "message" or msg["channel"] == KEEPALIVE_CHANNEL:
                continue
            user_id = int(msg["channel"].rsplit(":", 1)[1])
            for ws in list(self.active_connections.get(user_id, ())):
                try:
                    await ws.send_text(msg["data"])
                except Exception:
                    await self.disconnect(user_id, ws)

    async def connect(self, websocket: WebSocket, user: UserModel) -> None:
        await websocket.accept()
        conns = self.active_connections[user.id]
        if not conns:
            await self.pubsub.subscribe(user_channel(user.id))
        conns.add(websocket)
        await websocket.send_text("Connected!")

    async def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        conns = self.active_connections.get(user_id)
        if not conns:
            return
        conns.discard(websocket)
        if not conns:
            del self.active_connections[user_id]
            await self.pubsub.unsubscribe(user_channel(user_id))

    async def broadcast(
        self, message: MessageRequestSchema, user: UserModel, chat_service: ChatService
    ) -> None:
        client_msg_id = message.data.client_msg_id
        chat = await chat_service.get(message.data.chat_id)
        result = await chat_service.create_message(message, user, chat)
        response = {
            "type": MessageType.message,
            "data": {
                **vars(result),
                "key_version": result.chat_key.version,
                "client_msg_id": client_msg_id,
            },
        }
        response = MessageResponseSchema(**response)
        payload = response.model_dump_json()

        async with r.pipeline(transaction=False) as pipe:
            for member in chat.members:
                pipe.publish(user_channel(member.id), payload)
            await pipe.execute()

    async def send_personal_message(self, websocker: WebSocket, message: str):
        await websocker.send_text(message)


@lru_cache
def get_connection_manager() -> ConnectionManager:
    return ConnectionManager()
