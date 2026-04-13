"""
Groq: one follow-up viva question from the student's answer transcript.
"""

from __future__ import annotations

from groq import Groq

from config import get_settings, resolve_llama_api_key
from models.schemas import QuestionObject
from services.question_generator import (
    DEFAULT_GROQ_MODEL,
    _build_dynamic_system_prompt,
    _clamp_range,
    _parse_json_object,
    _resolve_label,
    _truncate_to_words,
)
from services.text_snippet import snippet_from_line_range

# Smaller / faster model for session-bound follow-ups (Groq id, no meta-llama/ prefix).
FAST_GROQ_MODEL = "llama-3.1-8b-instant"

FOLLOW_UP_USER_INSTRUCTION = """You are given:
1) The oral examination question that was just asked.
2) The student's spoken answer (may be imperfect transcription).

Write ONE follow-up question that:
- Presses on a gap, ambiguity, or unstated assumption in their answer.
- Stays grounded in what they said—do not invent facts about their submission.
- Is concise and suitable for a live oral exam (one or two sentences).

Respond with ONLY valid JSON (no markdown fences) in this exact shape:
{"text":"string","file_name":"string","line_range":[start_line,end_line],"context_reference":"string","source_snippet":"string"}

Rules:
- file_name MUST be exactly one of the SOURCE_LABEL values listed below (use the anchor label if unsure).
- line_range: inclusive 1-based integers; if you cannot tie to lines, repeat the anchor line range exactly.
- context_reference: verbatim excerpt from the submission for that line_range (actual lines of text, not a summary).
- source_snippet: a direct quote from the same SOURCE block as line_range, at most 20 words, copied verbatim (no paraphrase); must justify why you are asking this follow-up. If impossible, use the first 20 words of context_reference."""


def generate_follow_up_question(
    *,
    answer_transcript: str,
    current_question_text: str,
    subject: str,
    persona_title: str | None,
    persona_focus: str | None,
    source_labels: list[str],
    anchor_file_name: str,
    anchor_line_start: int,
    anchor_line_end: int,
    source_blocks: list[tuple[str, str]] | None = None,
    fast: bool = False,
    fast_model: str | None = None,
) -> QuestionObject:
    api_key = resolve_llama_api_key()
    if not api_key:
        raise RuntimeError("GROQ_API_KEY or LLAMA_API_KEY is not set")

    settings = get_settings()
    if settings.llama_provider != "groq":
        raise RuntimeError("Only LLAMA_PROVIDER=groq is implemented for follow-up questions")

    if fast:
        model = (fast_model or "").strip() or FAST_GROQ_MODEL
        temperature = 0.25
        max_tokens = 448
    else:
        model = settings.llama_model or DEFAULT_GROQ_MODEL
        temperature = 0.4
        max_tokens = 1024
    labels = list(dict.fromkeys(source_labels)) or [anchor_file_name]

    labels_block = "\n".join(f"- {L}" for L in labels)
    user_prompt = (
        f"{FOLLOW_UP_USER_INSTRUCTION}\n\n"
        f"SOURCE_LABEL values (choose file_name from these only):\n{labels_block}\n\n"
        f"Anchor citation (default if needed): file_name={anchor_file_name!r}, "
        f"line_range=[{anchor_line_start}, {anchor_line_end}]\n\n"
        f"--- CURRENT QUESTION ---\n{current_question_text}\n\n"
        f"--- STUDENT ANSWER (TRANSCRIPT) ---\n{(answer_transcript or '[empty]').strip()}\n"
    )

    system_prompt = _build_dynamic_system_prompt(
        subject,
        persona_title=persona_title,
        persona_focus=persona_focus,
    )

    client = Groq(api_key=api_key)
    completion = client.chat.completions.create(
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )

    raw = completion.choices[0].message.content or ""
    data = _parse_json_object(raw)
    text = str(data.get("text", "")).strip()
    fname_raw = str(data.get("file_name", "")).strip()
    lr = data.get("line_range")
    if not text:
        raise RuntimeError("Model returned an empty follow-up question")
    if not isinstance(lr, list) or len(lr) != 2:
        raise RuntimeError("Malformed line_range in follow-up response")
    try:
        start = int(lr[0])
        end = int(lr[1])
    except (TypeError, ValueError) as e:
        raise RuntimeError("line_range must be two integers") from e

    resolved = _resolve_label(fname_raw, labels) or anchor_file_name
    # Unknown line count for submission file — use generous bound for clamping.
    start, end = _clamp_range(start, end, 50_000)

    bmap = dict(source_blocks or [])
    raw_content = bmap.get(resolved, "")
    verbatim = snippet_from_line_range(raw_content, start, end)
    if not verbatim.strip():
        cr = str(data.get("context_reference", "") or "").strip()
        verbatim = cr

    raw_snip = str(data.get("source_snippet", "") or "").strip()
    if raw_snip:
        snippet = _truncate_to_words(raw_snip)
    else:
        snippet = _truncate_to_words(verbatim) if verbatim.strip() else ""

    return QuestionObject(
        text=text,
        file_name=resolved,
        line_range=[start, end],
        context_reference=verbatim,
        source_snippet=snippet,
    )
