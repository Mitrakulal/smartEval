from typing import Any, List
from pathlib import Path
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # Server settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Storage paths
    DATA_DIR: str = "data"
    KEY_DIR: str = "data/keys"
    IMAGE_DIR: str = "data/images"
    DATABASE_PATH: str = "data/smarteval.db"

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    # Gemini & AI Models
    GEMINI_API_KEY: str = ""
    GEMINI_OCR_MODEL: str = "gemini-3.5-flash-lite"
    GEMINI_KEY_MODEL: str = "gemini-3.5-flash-lite"
    EMBEDDING_MODEL: str = "models/text-embedding-004"

    # Evaluation & Demo Settings
    DEMO_MODE: int = 1
    MOCK_TRANSCRIBE: int = 0
    POINT_THRESHOLD: float = 0.55
    BORDERLINE_BAND: float = 0.10

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> List[str]:
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("[") and v.endswith("]"):
                import json
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [item.strip() for item in v.split(",") if item.strip()]
        return v


settings = Settings()
