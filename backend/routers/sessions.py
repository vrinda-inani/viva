from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from database import VivaSession, get_db
from models.schemas import SessionFinalizeRequest, SessionFinalizeResponse

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("/{session_id}/finalize", response_model=SessionFinalizeResponse)
def finalize_session(
    session_id: uuid.UUID,
    body: SessionFinalizeRequest,
    db: Session = Depends(get_db),
) -> SessionFinalizeResponse:
    """Persist transcript, integrity alert count, and optional final score."""
    stmt = select(VivaSession).where(VivaSession.id == session_id)
    row = db.exec(stmt).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")

    row.transcript = body.transcript
    row.integrity_alerts = body.integrity_alert_count
    if body.final_score is not None:
        row.final_score = body.final_score

    db.add(row)
    db.commit()
    db.refresh(row)

    return SessionFinalizeResponse(session_id=str(row.id), updated=True)
