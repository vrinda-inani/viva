"""
SQLModel engine and session dependency for Supabase (PostgreSQL).
"""

from __future__ import annotations

import uuid
from collections.abc import Generator
from typing import Optional

from sqlalchemy import create_engine
from sqlmodel import Field, Session, SQLModel


class VivaSession(SQLModel, table=True):
    """
    Matches public.viva_sessions in Supabase (text / uuid columns).
    """

    __tablename__ = "viva_sessions"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    subject: str
    persona_title: str
    persona_focus: str
    transcript: Optional[str] = Field(default=None)
    integrity_alerts: Optional[int] = Field(default=None)
    final_score: Optional[float] = Field(default=None)


_engine = None


def get_engine():
    global _engine
    if _engine is None:
        from config import get_settings

        url = get_settings().database_url
        if not url:
            raise RuntimeError("DATABASE_URL is not set")
        _engine = create_engine(
            url,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
        )
    return _engine


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: one DB session per request."""
    from fastapi import HTTPException

    from config import get_settings

    if not get_settings().database_url:
        raise HTTPException(
            status_code=503,
            detail="DATABASE_URL is not configured",
        )
    engine = get_engine()
    with Session(engine) as session:
        yield session
