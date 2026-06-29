import asyncio
import uuid
from datetime import datetime, timezone
from fastapi import WebSocket
from .deepseek_service import generate_ai_response
from .firebase_admin import get_firestore
from .config import settings

MAX_USERS_PER_ROOM = 2
MAX_HISTORY_FOR_AI = 30


class ConnectedUser:
    def __init__(self, websocket: WebSocket, uid: str, display_name: str):
        self.websocket = websocket
        self.uid = uid
        self.display_name = display_name


class ChatRoom:
    def __init__(self, room_id: str):
        self.room_id = room_id
        self.users: dict[str, ConnectedUser] = {}
        self.messages: list[dict] = []
        self._ai_timer: asyncio.Task | None = None
        self._ai_responding = False

    def is_full(self) -> bool:
        return len(self.users) >= MAX_USERS_PER_ROOM

    def add_user(self, user: ConnectedUser):
        self.users[user.uid] = user

    def remove_user(self, uid: str):
        self.users.pop(uid, None)

    def is_empty(self) -> bool:
        return len(self.users) == 0

    async def broadcast(self, payload: dict, exclude_uid: str | None = None):
        dead = []
        for uid, user in self.users.items():
            if uid == exclude_uid:
                continue
            try:
                await user.websocket.send_json(payload)
            except Exception:
                dead.append(uid)
        for uid in dead:
            self.remove_user(uid)

    async def broadcast_all(self, payload: dict):
        await self.broadcast(payload, exclude_uid=None)

    def _room_state_payload(self) -> dict:
        return {
            "type": "room_state",
            "payload": {
                "room_id": self.room_id,
                "users": [
                    {"uid": u.uid, "display_name": u.display_name}
                    for u in self.users.values()
                ],
                "ai_responding": self._ai_responding,
            },
        }

    async def on_user_message(self, uid: str, display_name: str, content: str):
        msg = {
            "id": str(uuid.uuid4()),
            "room_id": self.room_id,
            "sender_id": uid,
            "sender_name": display_name,
            "sender_type": "user",
            "content": content,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        self.messages.append(msg)
        self._persist_message(msg)

        await self.broadcast_all({"type": "message", "payload": msg})
        self._reset_ai_timer()

    def _reset_ai_timer(self):
        if self._ai_timer and not self._ai_timer.done():
            self._ai_timer.cancel()
        self._ai_timer = asyncio.create_task(self._ai_respond_after_delay())

    async def _ai_respond_after_delay(self):
        try:
            await asyncio.sleep(settings.ai_response_delay)

            if self._ai_responding:
                return

            self._ai_responding = True
            await self.broadcast_all({"type": "ai_typing", "payload": {"typing": True}})

            recent = self.messages[-MAX_HISTORY_FOR_AI:]
            response_text = await generate_ai_response(recent)

            ai_msg = {
                "id": str(uuid.uuid4()),
                "room_id": self.room_id,
                "sender_id": "ai",
                "sender_name": "Chatreeo AI",
                "sender_type": "ai",
                "content": response_text,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            self.messages.append(ai_msg)
            self._persist_message(ai_msg)

            await self.broadcast_all({"type": "ai_typing", "payload": {"typing": False}})
            await self.broadcast_all({"type": "message", "payload": ai_msg})

        except asyncio.CancelledError:
            pass
        except Exception as e:
            await self.broadcast_all({"type": "error", "payload": {"detail": str(e)}})
        finally:
            self._ai_responding = False

    def _persist_message(self, msg: dict):
        try:
            db = get_firestore()
            db.collection("rooms").document(self.room_id).collection("messages").document(
                msg["id"]
            ).set(msg)
        except Exception:
            pass

    def load_history_from_firestore(self):
        try:
            db = get_firestore()
            docs = (
                db.collection("rooms")
                .document(self.room_id)
                .collection("messages")
                .order_by("timestamp")
                .limit(MAX_HISTORY_FOR_AI)
                .get()
            )
            self.messages = [doc.to_dict() for doc in docs]
        except Exception:
            pass


class ChatManager:
    def __init__(self):
        self.rooms: dict[str, ChatRoom] = {}

    def get_or_create_room(self, room_id: str) -> ChatRoom:
        if room_id not in self.rooms:
            room = ChatRoom(room_id)
            room.load_history_from_firestore()
            self.rooms[room_id] = room
        return self.rooms[room_id]

    def cleanup_room(self, room_id: str):
        room = self.rooms.get(room_id)
        if room and room.is_empty():
            if room._ai_timer and not room._ai_timer.done():
                room._ai_timer.cancel()
            del self.rooms[room_id]

    async def connect(
        self, websocket: WebSocket, room_id: str, uid: str, display_name: str
    ) -> ChatRoom | None:
        room = self.get_or_create_room(room_id)

        if room.is_full() and uid not in room.users:
            await websocket.accept()
            await websocket.send_json(
                {"type": "error", "payload": {"detail": "Room is full (max 2 users)"}}
            )
            await websocket.close()
            return None

        await websocket.accept()
        user = ConnectedUser(websocket, uid, display_name)
        room.add_user(user)

        await room.broadcast_all(
            {
                "type": "join",
                "payload": {"uid": uid, "display_name": display_name},
            }
        )
        await websocket.send_json(room._room_state_payload())

        if len(room.messages) > 0:
            await websocket.send_json(
                {"type": "history", "payload": {"messages": room.messages[-50:]}}
            )

        return room

    async def disconnect(self, room_id: str, uid: str):
        room = self.rooms.get(room_id)
        if not room:
            return
        user = room.users.get(uid)
        display_name = user.display_name if user else uid
        room.remove_user(uid)

        await room.broadcast_all(
            {"type": "leave", "payload": {"uid": uid, "display_name": display_name}}
        )
        self.cleanup_room(room_id)


chat_manager = ChatManager()
