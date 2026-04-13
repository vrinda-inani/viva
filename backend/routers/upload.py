from __future__ import annotations

import logging
import warnings

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import Session

from database import VivaSession, get_db

_log = logging.getLogger(__name__)

LOCAL_DEV_FALLBACK_SESSION_ID = "local-test-session"
from models.schemas import UploadResponse
from services.classifier import (
    ClassificationResult,
    classify_submission,
    sample_submission_text,
)
from services.ingest import ingest_submission_blocks
from services.persona_mapping import classification_to_api
from services.question_generator import generate_three_questions

router = APIRouter()


@router.post("/upload", response_model=UploadResponse)
async def upload_submission(
    files: list[UploadFile] = File(default=[]),
    urls: str = Form(""),
    prior_classification: str = Form(""),
    db: Session = Depends(get_db),
) -> UploadResponse:
    """
    Ingest → classify (or reuse client prior) → generate three viva questions.
    """
    blocks = await ingest_submission_blocks(files, urls)

    cr: ClassificationResult | None = None
    if prior_classification and prior_classification.strip():
        cr = ClassificationResult.from_prior_json(prior_classification)

    if cr is None:
        sample = sample_submission_text(blocks)
        try:
            cr = classify_submission(sample)
        except RuntimeError as e:
            raise HTTPException(status_code=503, detail=str(e)) from e
        except Exception as e:
            raise HTTPException(
                status_code=502,
                detail=f"Classification failed: {e!s}",
            ) from e

    classification = classification_to_api(cr)

    try:
        questions = generate_three_questions(
            blocks,
            cr.subject,
            persona_title=cr.persona,
            persona_focus=cr.focus,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Question generation failed: {e!s}",
        ) from e

    row = VivaSession(
        subject=cr.subject,
        persona_title=cr.persona,
        persona_focus=cr.focus,
    )
    db.add(row)
    session_id_str: str
    try:
        db.commit()
        db.refresh(row)
        session_id_str = str(row.id)
    except (SQLAlchemyError, OSError) as exc:
        db.rollback()
        msg = (
            f"Database unavailable; persisting session skipped ({exc!s}). "
            f"Using fallback session id {LOCAL_DEV_FALLBACK_SESSION_ID!r}."
        )
        warnings.warn(msg, RuntimeWarning, stacklevel=1)
        _log.warning(msg)
        print(f"[upload] WARNING: {msg}", flush=True)
        session_id_str = LOCAL_DEV_FALLBACK_SESSION_ID

    return UploadResponse(
        session_id=session_id_str,
        question_objects=questions,
        classification=classification,
    )
