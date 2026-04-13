"""API-facing classification shape (persona strings come from classifier LLM)."""

from __future__ import annotations

from models.schemas import ClassificationOut
from services.classifier import ClassificationResult


def classification_to_api(cr: ClassificationResult) -> ClassificationOut:
    return ClassificationOut(
        subject=cr.subject,
        confidence=cr.confidence,
        persona_title=cr.persona,
        interviewer_line=f"Viva is now interviewing you as a {cr.persona}.",
        focus=cr.focus,
    )
