import uuid
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, HTTPException
from ..chat_manager import chat_manager
from ..firebase_admin import verify_token, get_firestore

router = APIRouter()


@router.post("/rooms")
async def create_room(id_token: str):
    try:
        await verify_token(id_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Firebase token")

    room_id = str(uuid.uuid4())[:8]
    return {"room_id": room_id}


@router.get("/rooms/{room_id}/history")
async def get_room_history(room_id: str, id_token: str):
    try:
        await verify_token(id_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Firebase token")

    db = get_firestore()
    docs = (
        db.collection("rooms")
        .document(room_id)
        .collection("messages")
        .order_by("timestamp")
        .limit(100)
        .get()
    )
    return {"messages": [doc.to_dict() for doc in docs]}


@router.websocket("/ws/{room_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    room_id: str,
    token: str = Query(...),
    display_name: str = Query(...),
):
    try:
        decoded = await verify_token(token)
        uid = decoded["uid"]
    except Exception:
        await websocket.accept()
        await websocket.send_json({"type": "error", "payload": {"detail": "Unauthorized"}})
        await websocket.close()
        return

    room = await chat_manager.connect(websocket, room_id, uid, display_name)
    if not room:
        return

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "message":
                content = data.get("payload", {}).get("content", "").strip()
                if content:
                    await room.on_user_message(uid, display_name, content)

    except WebSocketDisconnect:
        await chat_manager.disconnect(room_id, uid)
    except Exception:
        await chat_manager.disconnect(room_id, uid)
