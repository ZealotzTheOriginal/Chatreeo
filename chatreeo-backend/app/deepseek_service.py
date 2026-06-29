import httpx
from .config import settings

DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"
DEEPSEEK_MODEL = "deepseek-chat"

SYSTEM_PROMPT = """You are Chatreeo AI, a friendly and adaptive conversational assistant.
You are participating in a real-time chat room alongside two human users.

Core behaviors:
- Detect the language(s) being spoken and respond in the same language as the most recent messages.
- Adapt your tone: if users are casual, be casual; if they are professional, be professional.
- Be concise — this is a chat, not an essay. Keep responses short and natural.
- You have memory of the full conversation history provided to you.
- When both users seem to agree or have reached a conclusion, acknowledge it briefly.
- Never pretend to be human if asked directly.
- You can address both users simultaneously or just one if the message was directed at them.

Context awareness:
- You respond only when there has been a pause in the conversation (the users stopped typing).
- Your goal is to add value: summarize, clarify, contribute new ideas, or continue the thread naturally.
"""


async def generate_ai_response(messages: list[dict], room_context: dict | None = None) -> str:
    headers = {
        "Authorization": f"Bearer {settings.deepseek_api_key}",
        "Content-Type": "application/json",
    }

    formatted = [{"role": "system", "content": SYSTEM_PROMPT}]

    for msg in messages:
        role = "assistant" if msg["sender_type"] == "ai" else "user"
        name_prefix = f"[{msg['sender_name']}]: " if msg["sender_type"] == "user" else ""
        formatted.append({"role": role, "content": f"{name_prefix}{msg['content']}"})

    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": formatted,
        "max_tokens": 512,
        "temperature": 0.8,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(DEEPSEEK_API_URL, json=payload, headers=headers)
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]
