"""
Load secrets and settings from the environment.
Uses python-dotenv for local dev (.env / .env.local at repo root) and os.getenv at runtime.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

_REPO_ROOT = Path(__file__).resolve().parent.parent


def _load_env_files() -> None:
    """Load root `.env` then `.env.local` (later overrides earlier)."""
    for name in (".env", ".env.local"):
        path = _REPO_ROOT / name
        if path.is_file():
            load_dotenv(path, override=name == ".env.local")


_load_env_files()


def _split_origins(raw: str | None) -> list[str]:
    if not raw or not raw.strip():
        return [
            "http://localhost:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:3001",
        ]
    return [o.strip() for o in raw.split(",") if o.strip()]


@dataclass(frozen=True)
class Settings:
    database_url: str | None
    cors_origins: list[str]
    llama_provider: str
    llama_api_key: str | None
    groq_api_key: str | None
    replicate_api_token: str | None
    ollama_base_url: str | None
    llama_model: str | None
    whisper_provider: str
    whisper_api_key: str | None
    openai_api_key: str | None


@lru_cache
def get_settings() -> Settings:
    return Settings(
        database_url=os.getenv("DATABASE_URL") or None,
        cors_origins=_split_origins(os.getenv("CORS_ORIGINS")),
        llama_provider=(os.getenv("LLAMA_PROVIDER") or "groq").strip().lower(),
        llama_api_key=os.getenv("LLAMA_API_KEY") or None,
        groq_api_key=os.getenv("GROQ_API_KEY") or None,
        replicate_api_token=os.getenv("REPLICATE_API_TOKEN") or None,
        ollama_base_url=os.getenv("OLLAMA_BASE_URL") or None,
        llama_model=os.getenv("LLAMA_MODEL") or None,
        whisper_provider=(os.getenv("WHISPER_PROVIDER") or "openai").strip().lower(),
        whisper_api_key=os.getenv("WHISPER_API_KEY") or None,
        openai_api_key=os.getenv("OPENAI_API_KEY") or None,
    )


def resolve_llama_api_key() -> str | None:
    """Prefer explicit GROQ_API_KEY, then LLAMA_API_KEY."""
    s = get_settings()
    return s.groq_api_key or s.llama_api_key


def resolve_whisper_api_key() -> str | None:
    """Prefer WHISPER_API_KEY, then OPENAI_API_KEY for OpenAI-compatible stacks."""
    s = get_settings()
    return s.whisper_api_key or s.openai_api_key
