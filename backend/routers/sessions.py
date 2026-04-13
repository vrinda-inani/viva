from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import Session, select

from database import VivaSession, get_db
from dev_constants import LOCAL_DEV_FALLBACK_SESSION_ID
from models.schemas import (
    FollowUpResponse,
    QuestionObject,
    SessionAnswerRequest,
    SessionFinalizeRequest,
    SessionFinalizeResponse,
)
from services.follow_up import generate_follow_up_question
from services.text_snippet import snippet_from_line_range

# Initial viva questions (three at upload) use services/question_generator.py — not this router.
# Follow-up JSON shape (incl. source_snippet) is defined in services/follow_up.py.

router = APIRouter(prefix="/sessions", tags=["sessions"])
_log = logging.getLogger(__name__)

# Groq OpenAI-compatible model id for POST /sessions/{session_id}/answer (no meta-llama/ prefix).
SESSION_ANSWER_FAST_GROQ_MODEL = "llama-3.1-8b-instant"


def _fallback_follow_up_question(body: SessionAnswerRequest) -> QuestionObject:
    """
    Generic technical follow-up when Groq fails so the client always gets 200 + valid JSON.
    """
    anchor = body.anchor_file_name
    lo, hi = body.anchor_line_start, body.anchor_line_end
    text = (
        "We could not generate a tailored follow-up from the model just now. "
        "Please go deeper on the main technical point in your last answer: "
        "what in your submission supports it, and what are its limits or assumptions?"
    )
    bmap = {s.label: s.text for s in body.source_blocks}
    raw = bmap.get(anchor, "")
    verbatim = snippet_from_line_range(raw, lo, hi) if raw.strip() else ""
    if not verbatim.strip():
        verbatim = ""
    snip = verbatim.strip()
    if snip:
        words = snip.split()
        snip = " ".join(words[:20]) if len(words) > 20 else snip
    return QuestionObject(
        text=text,
        file_name=anchor,
        line_range=[lo, hi],
        context_reference=verbatim,
        source_snippet=snip,
    )


def _load_session_row(db: Session, session_id: str) -> VivaSession | None:
    """Return DB row or None if id is not a UUID, row missing, or DB error."""
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        return None
    try:
        stmt = select(VivaSession).where(VivaSession.id == sid)
        return db.exec(stmt).first()
    except SQLAlchemyError:
        try:
            db.rollback()
        except Exception:
            pass
        return None


@router.post("/{session_id}/finalize", response_model=SessionFinalizeResponse)
def finalize_session(
    session_id: str,
    body: SessionFinalizeRequest,
    db: Session = Depends(get_db),
) -> SessionFinalizeResponse:
    """Persist transcript, integrity alert count, and optional final score."""
    row = _load_session_row(db, session_id)
    if row is not None:
        row.transcript = body.transcript
        row.integrity_alerts = body.integrity_alert_count
        if body.final_score is not None:
            row.final_score = body.final_score
        if body.session_metadata_json is not None:
            row.session_metadata = body.session_metadata_json

        db.add(row)
        db.commit()
        db.refresh(row)

        return SessionFinalizeResponse(session_id=str(row.id), updated=True)

    if session_id == LOCAL_DEV_FALLBACK_SESSION_ID:
        return SessionFinalizeResponse(session_id=session_id, updated=True)

    raise HTTPException(status_code=404, detail="Session not found")


@router.post("/{session_id}/answer", response_model=FollowUpResponse)
def submit_session_answer(
    session_id: str,  # str (not UUID) so paths like local-test-session validate
    body: SessionAnswerRequest,
    db: Session = Depends(get_db),
) -> FollowUpResponse:
    """
    Generate the next follow-up question from the latest answer transcript,
    using the interview persona/subject from the DB row or from the request when
    no row exists (local dev / skipped persist).
    """
    row = _load_session_row(db, session_id)

    if row is not None:
        subject = row.subject
        persona_title = row.persona_title or None
        persona_focus = row.persona_focus or None
    else:
        subject = body.subject or "OTHER"
        persona_title = body.persona_title
        persona_focus = body.persona_focus

    sb = [(s.label, s.text) for s in body.source_blocks]
    try:
        qo = generate_follow_up_question(
            answer_transcript=body.answer_transcript,
            current_question_text=body.current_question_text,
            subject=subject,
            persona_title=persona_title,
            persona_focus=persona_focus,
            source_labels=body.source_labels or [body.anchor_file_name],
            anchor_file_name=body.anchor_file_name,
            anchor_line_start=body.anchor_line_start,
            anchor_line_end=body.anchor_line_end,
            source_blocks=sb or None,
            fast=True,
            fast_model=SESSION_ANSWER_FAST_GROQ_MODEL,
        )
    except Exception as exc:
        _log.warning(
            "Follow-up Groq / parse failed for session %r: %s",
            session_id,
            exc,
            exc_info=True,
        )
        try:
            qo = _fallback_follow_up_question(body)
        except Exception as fb_exc:
            _log.error(
                "Fallback follow-up failed for session %r: %s",
                session_id,
                fb_exc,
                exc_info=True,
            )
            qo = QuestionObject(
                text=(
                    "We could not reach the question model. Briefly restate the core claim "
                    "from your last answer, then explain one limitation or alternative you did not mention."
                ),
                file_name=body.anchor_file_name,
                line_range=[body.anchor_line_start, body.anchor_line_end],
                context_reference="",
                source_snippet="",
            )

    return FollowUpResponse(question_object=qo)
