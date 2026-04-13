"""
Pre-flight subject + persona classification (Llama 3.3 via Groq).
Returns structured persona strings for UI and question generation.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

from groq import Groq

from config import get_settings, resolve_llama_api_key

DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile"

VALID_SUBJECTS = frozenset(
    {
        "COMPUTER_SCIENCE",
        "MATHEMATICS",
        "HUMANITIES",
        "PROFESSIONAL",
        "OTHER",
    }
)

CLASSIFIER_PROMPT_TEMPLATE = """Analyze this content. Classify as: [COMPUTER_SCIENCE, MATHEMATICS, HUMANITIES, PROFESSIONAL]. If none fit, use OTHER.

Return ONLY a JSON object with this exact shape (no markdown):
{{"subject": "CATEGORY_NAME", "persona": "short interviewer title", "focus": "one sentence on what you will probe", "confidence": 0.0}}

Rules:
- subject must be one of: COMPUTER_SCIENCE, MATHEMATICS, HUMANITIES, PROFESSIONAL, OTHER.
- persona: a concise role title (e.g. "Lead Architect", "Pure Math Professor", "Executive Recruiter").
- focus: evaluation emphasis aligned with that persona.
- confidence: your confidence in the subject label from 0.0 to 1.0.

Submission sample:
---
{sample}
---
"""

SAMPLE_CHAR_BUDGET = 2000


@dataclass(frozen=True)
class ClassificationResult:
    subject: str
    persona: str
    focus: str
    confidence: float

    @staticmethod
    def from_prior_json(raw: str) -> ClassificationResult | None:
        """Parse client-supplied JSON to skip a duplicate Groq classification on /upload."""
        try:
            d = json.loads(raw)
            if not isinstance(d, dict):
                return None
            sub = _normalize_subject(str(d.get("subject", "OTHER")))
            persona = str(d.get("persona", "")).strip() or "Academic Examiner"
            focus = str(d.get("focus", "")).strip() or "Depth of reasoning and evidence."
            try:
                conf = float(d.get("confidence", 0.9))
            except (TypeError, ValueError):
                conf = 0.9
            conf = max(0.0, min(1.0, conf))
            return ClassificationResult(
                subject=sub, persona=persona, focus=focus, confidence=conf
            )
        except (json.JSONDecodeError, TypeError):
            return None


def sample_submission_text(blocks: list[tuple[str, str]], max_chars: int = SAMPLE_CHAR_BUDGET) -> str:
    """First max_chars characters of combined labeled submission text."""
    parts: list[str] = []
    total = 0
    for label, text in blocks:
        if total >= max_chars:
            break
        chunk = f"[{label}]\n{text}"
        take = max_chars - total
        parts.append(chunk[:take])
        total += min(len(chunk), take)
    return "\n\n".join(parts).strip()


def _normalize_subject(raw: str) -> str:
    s = raw.strip().upper().replace(" ", "_").replace("-", "_")
    if s in VALID_SUBJECTS:
        return s
    aliases = {
        "CS": "COMPUTER_SCIENCE",
        "COMPUTERSCIENCE": "COMPUTER_SCIENCE",
        "MATH": "MATHEMATICS",
        "STEM": "COMPUTER_SCIENCE",
        "LIT": "HUMANITIES",
        "BUSINESS": "PROFESSIONAL",
        "CAREER": "PROFESSIONAL",
    }
    return aliases.get(s, "OTHER")


def _parse_json_object(raw: str) -> dict:
    text = raw.strip()
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        text = m.group(0)
    return json.loads(text)


def classify_submission(sample: str) -> ClassificationResult:
    if not sample.strip():
        return ClassificationResult(
            subject="OTHER",
            persona="Academic Examiner",
            focus="Clarity of reasoning and use of evidence.",
            confidence=0.0,
        )

    api_key = resolve_llama_api_key()
    if not api_key:
        raise RuntimeError("GROQ_API_KEY or LLAMA_API_KEY is not set")

    settings = get_settings()
    if settings.llama_provider != "groq":
        raise RuntimeError("Only LLAMA_PROVIDER=groq is implemented for classification")

    model = settings.llama_model or DEFAULT_GROQ_MODEL
    prompt = CLASSIFIER_PROMPT_TEMPLATE.format(sample=sample[:SAMPLE_CHAR_BUDGET])

    client = Groq(api_key=api_key)
    completion = client.chat.completions.create(
        model=model,
        temperature=0.15,
        max_tokens=512,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": "You classify submissions and assign interviewer personas. Output JSON only.",
            },
            {"role": "user", "content": prompt},
        ],
    )

    raw = completion.choices[0].message.content or ""
    data = _parse_json_object(raw)
    subject = _normalize_subject(str(data.get("subject", "OTHER")))
    if subject not in VALID_SUBJECTS:
        subject = "OTHER"

    persona = str(data.get("persona", "")).strip()
    focus = str(data.get("focus", "")).strip()
    if not persona:
        persona = "Academic Examiner"
    if not focus:
        focus = "Depth of understanding and justification."

    try:
        confidence = float(data.get("confidence", 0.85))
    except (TypeError, ValueError):
        confidence = 0.85
    confidence = max(0.0, min(1.0, confidence))

    return ClassificationResult(
        subject=subject,
        persona=persona,
        focus=focus,
        confidence=confidence,
    )
