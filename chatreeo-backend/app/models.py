from pydantic import BaseModel
from typing import Literal
from datetime import datetime


class Message(BaseModel):
    id: str
    room_id: str
    sender_id: str
    sender_name: str
    sender_type: Literal["user", "ai"]
    content: str
    timestamp: datetime


class WSMessage(BaseModel):
    type: Literal["message", "join", "leave", "ai_typing", "ai_message", "error", "room_state"]
    payload: dict


class UserProfile(BaseModel):
    uid: str
    display_name: str
    email: str
    language: str = "es"
