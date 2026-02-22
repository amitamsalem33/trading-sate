# backend/app/config.py
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    finnhub_api_key: str
    massive_api_key: str
    database_url: str = "sqlite:///./data/trading.db"
    redis_url: str = "redis://localhost:6379/0"
    env: str = "development"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

@lru_cache()
def get_settings() -> Settings:
    return Settings()
