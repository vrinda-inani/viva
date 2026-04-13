"""
Viva FastAPI entrypoint. Configuration is read from the environment (see config.py).
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings, resolve_llama_api_key, resolve_whisper_api_key
from routers.classify import router as classify_router
from routers.sessions import router as sessions_router
from routers.upload import router as upload_router

settings = get_settings()
_log = logging.getLogger("viva.setup")


@asynccontextmanager
async def lifespan(app: FastAPI):
    _log.warning(
        "Viva backend: one-time browser setup for Crawl4AI — "
        "run: python -m crawl4ai.install && playwright install chromium"
    )
    yield


app = FastAPI(title="Viva API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mounted at root so Next.js dev rewrite `/api/:path*` → `http://127.0.0.1:8000/:path*` lines up.
app.include_router(classify_router)
app.include_router(upload_router)
app.include_router(sessions_router)


@app.get("/test")
def connectivity_test_root():
    """Sanity check (browser via Next: GET /api/test → proxied to /test)."""
    return {"ok": True, "message": "Viva API reachable", "path": "/test"}


@app.get("/health")
def health():
    """Liveness check; does not validate external API keys."""
    return {"status": "ok"}


@app.get("/health/config")
def health_config():
    """
    Reports which integrations are configured (never returns secret values).
    """
    _crawl4ai = False
    _docling = False
    try:
        import crawl4ai  # noqa: F401

        _crawl4ai = True
    except ImportError:
        pass
    try:
        import docling  # noqa: F401

        _docling = True
    except ImportError:
        pass

    return {
        "database_configured": bool(settings.database_url),
        "llama_provider": settings.llama_provider,
        "llama_model": settings.llama_model,
        "llama_key_configured": bool(resolve_llama_api_key()),
        "whisper_provider": settings.whisper_provider,
        "whisper_key_configured": bool(resolve_whisper_api_key()),
        "crawl4ai_installed": _crawl4ai,
        "docling_installed": _docling,
    }
