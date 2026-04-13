from __future__ import annotations

from typing import Annotated, Optional

from pydantic import BaseModel, Field


class QuestionObject(BaseModel):
    text: str
    file_name: str = Field(description="Must match a SOURCE_LABEL from the prompt exactly.")
    line_range: Annotated[
        list[int],
        Field(
            min_length=2,
            max_length=2,
            description="Inclusive 1-based line numbers within that source block.",
        ),
    ]


class ClassificationOut(BaseModel):
    subject: str
    confidence: float
    persona_title: str
    interviewer_line: str
    focus: str


class ClassifyResponse(BaseModel):
    classification: ClassificationOut


class UploadResponse(BaseModel):
    session_id: str
    question_objects: list[QuestionObject]
    classification: ClassificationOut


class SessionFinalizeRequest(BaseModel):
    transcript: str
    integrity_alert_count: int = Field(ge=0, description="Number of integrity / tab-blur events")
    final_score: Optional[float] = Field(
        default=None,
        description="Optional confidence or rubric score (0–1 or app-specific scale)",
    )


class SessionFinalizeResponse(BaseModel):
    session_id: str
    updated: bool
