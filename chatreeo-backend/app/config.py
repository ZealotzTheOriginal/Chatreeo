from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    deepseek_api_key: str
    firebase_service_account_path: str = "./firebase-service-account.json"
    frontend_url: str = "http://localhost:4200"
    ai_response_delay: float = 5.0

    class Config:
        env_file = ".env"


settings = Settings()
