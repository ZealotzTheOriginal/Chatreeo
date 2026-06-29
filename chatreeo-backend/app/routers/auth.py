from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..firebase_admin import get_firestore, verify_token

router = APIRouter()


class RegisterProfileRequest(BaseModel):
    id_token: str
    display_name: str
    language: str = "es"


@router.post("/register")
async def register_profile(body: RegisterProfileRequest):
    try:
        decoded = await verify_token(body.id_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Firebase token")

    uid = decoded["uid"]
    email = decoded.get("email", "")

    profile = {
        "uid": uid,
        "email": email,
        "display_name": body.display_name,
        "language": body.language,
    }

    db = get_firestore()
    db.collection("users").document(uid).set(profile, merge=True)

    return {"status": "ok", "profile": profile}


@router.get("/profile")
async def get_profile(id_token: str):
    try:
        decoded = await verify_token(id_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Firebase token")

    uid = decoded["uid"]
    db = get_firestore()
    doc = db.collection("users").document(uid).get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Profile not found")

    return doc.to_dict()
