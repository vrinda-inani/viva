from __future__ import annotations

from fastapi import APIRouter, HTTPException

from models.schemas import FollowUpRequest, FollowUpResponse
from services.follow_up import generate_follow_up_question

router = APIRouter()


@router.post("/follow_up", response_model=FollowUpResponse)
def follow_up_question(body: FollowUpRequest) -> FollowUpResponse:
    """
    Given the current question and the student's answer transcript, ask Groq for one follow-up question.
    """
    try:
        sb = [(s.label, s.text) for s in body.source_blocks]
        qo = generate_follow_up_question(
            answer_transcript=body.answer_transcript,
            current_question_text=body.current_question_text,
            subject=body.subject,
            persona_title=body.persona_title or None,
            persona_focus=body.persona_focus or None,
            source_labels=body.source_labels or [body.anchor_file_name],
            anchor_file_name=body.anchor_file_name,
            anchor_line_start=body.anchor_line_start,
            anchor_line_end=body.anchor_line_end,
            source_blocks=sb or None,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Follow-up generation failed: {e!s}",
        ) from e

    return FollowUpResponse(question_object=qo)
