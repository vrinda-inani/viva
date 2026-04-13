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
    context_reference: str = Field(
        default="",
        description="Verbatim excerpt from the source for line_range (filled server-side from the document).",
    )
    source_snippet: str = Field(
        default="",
        description=(
            "Short verbatim quote (≤20 words) from the submission that justifies the question; "
            "snippet-level grounding for the UI."
        ),
    )


class ExtractedSource(BaseModel):
    label: str = Field(description="SOURCE_LABEL / filename for this block.")
    text: str = Field(description="Plain text extracted (Docling/Crawl4AI/httpx).")


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
    extracted_text: str = Field(
        default="",
        description="Combined submission text for preview (labeled sections).",
    )
    extracted_sources: list[ExtractedSource] = Field(default_factory=list)


class SessionFinalizeRequest(BaseModel):
    transcript: str
    integrity_alert_count: int = Field(ge=0, description="Number of integrity / tab-blur events")
    final_score: Optional[float] = Field(
        default=None,
        description="Optional confidence or rubric score (0–1 or app-specific scale)",
    )
    session_metadata_json: Optional[str] = Field(
        default=None,
        description="Optional JSON blob (proctoring blur/focus, fullscreen exits, etc.)",
    )


class SessionFinalizeResponse(BaseModel):
    session_id: str
    updated: bool


class SessionAnswerRequest(BaseModel):
    """
    Answer payload for a viva session. Persona/subject usually come from the DB row;
    when the row is missing (e.g. local dev fallback id), use the optional fields below.
    """

    answer_transcript: str = Field(
        description="Student's spoken answer since the current question was shown.",
    )
    current_question_text: str
    source_labels: list[str] = Field(default_factory=list)
    anchor_file_name: str
    anchor_line_start: int = Field(ge=1)
    anchor_line_end: int = Field(ge=1)
    source_blocks: list[ExtractedSource] = Field(
        default_factory=list,
        description="Per-label extracted text from upload (for verbatim context_reference snippets).",
    )
    subject: Optional[str] = Field(
        default=None,
        description="Classification subject when no DB session row (matches upload step).",
    )
    persona_title: Optional[str] = Field(
        default=None,
        description="Persona title when no DB session row.",
    )
    persona_focus: Optional[str] = Field(
        default=None,
        description="Persona focus when no DB session row.",
    )


class FollowUpRequest(BaseModel):
    answer_transcript: str = Field(
        description="Student's spoken answer since the current question was shown.",
    )
    current_question_text: str
    subject: str
    persona_title: str = ""
    persona_focus: str = ""
    source_labels: list[str] = Field(default_factory=list)
    anchor_file_name: str
    anchor_line_start: int = Field(ge=1)
    anchor_line_end: int = Field(ge=1)
    source_blocks: list[ExtractedSource] = Field(
        default_factory=list,
        description="Per-label extracted text from upload (for verbatim context_reference snippets).",
    )


class FollowUpResponse(BaseModel):
    question_object: QuestionObject
