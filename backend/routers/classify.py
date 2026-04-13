from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from models.schemas import ClassifyResponse
from services.classifier import classify_submission, sample_submission_text
from services.ingest import ingest_submission_blocks_fast
from services.persona_mapping import classification_to_api

router = APIRouter()


@router.post("/classify", response_model=ClassifyResponse)
async def classify_submission_route(
    files: list[UploadFile] = File(default=[]),
    urls: str = Form(""),
) -> ClassifyResponse:
    """
    Classify submission topic + interviewer persona without generating questions.
    Use for lobby preview before starting the viva.
    """
    blocks = await ingest_submission_blocks_fast(files, urls)

    sample = sample_submission_text(blocks)
    try:
        tc = classify_submission(sample)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Classification failed: {e!s}",
        ) from e

    return ClassifyResponse(classification=classification_to_api(tc))
