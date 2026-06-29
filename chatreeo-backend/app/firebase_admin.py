import json
import os
import firebase_admin
from firebase_admin import credentials, auth, firestore
from .config import settings

_app = None


def get_firebase_app():
    global _app
    if _app is None:
        # En cloud (Render) se usa la variable de entorno con el JSON completo.
        # En local se usa el archivo indicado en .env.
        json_str = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
        if json_str:
            cred = credentials.Certificate(json.loads(json_str))
        else:
            cred = credentials.Certificate(settings.firebase_service_account_path)
        _app = firebase_admin.initialize_app(cred)
    return _app


def get_firestore():
    get_firebase_app()
    return firestore.client()


async def verify_token(token: str) -> dict:
    get_firebase_app()
    decoded = auth.verify_id_token(token)
    return decoded
