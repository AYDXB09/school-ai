"""
Configuration loader for School AI Backend.
Reads from .env file and environment variables.
"""

import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    # Canvas LMS
    CANVAS_API_URL: str = os.getenv("CANVAS_API_URL", "")
    CANVAS_API_TOKEN: str = os.getenv("CANVAS_API_TOKEN", "")

    # K2-Think-v2 LLM
    K2_API_KEY: str = os.getenv("K2_API_KEY", "")
    K2_API_URL: str = os.getenv("K2_API_URL", "https://api.k2think.ai/v1/chat/completions")
    K2_MODEL: str = os.getenv("K2_MODEL", "MBZUAI-IFM/K2-Think-v2")

    # ChromaDB
    CHROMA_PERSIST_DIR: str = os.getenv("CHROMA_PERSIST_DIR", "./chroma_data")

    # Server
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    ALLOWED_ORIGINS: list[str] = os.getenv(
        "ALLOWED_ORIGINS", "http://localhost:5173,https://aydxb09.github.io"
    ).split(",")


config = Config()
