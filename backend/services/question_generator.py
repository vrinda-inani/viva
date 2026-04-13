"""
Llama 3 via Groq: generate exactly three viva questions from combined submission text.

Prompt template (high level):
- Act as a technical examiner (user-supplied framing).
- Each numbered source block uses lines like 0001| … so the model can cite inclusive line_range.
- Require JSON only: {"questions":[{"text","file_name","line_range":[start,end]}, …]} — exactly 3 items.
- Post-process: clamp line_range to valid bounds per source and fix ordering.
"""

from __future__ import annotations

import json
import re
from difflib import get_close_matches
from pathlib import PurePath

from groq import Groq

from config import get_settings, resolve_llama_api_key
from models.schemas import QuestionObject
from services.persona_mapping_fallback import get_persona

MAX_TOTAL_CONTEXT_CHARS = 120_000
DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile"

EXAMINER_INSTRUCTION = """Review the following student submission. Identify three specific logic 'hotspots'—areas where the author had to make a conscious design or argumentative choice. Generate one question for each hotspot that requires the student to explain the 'why' behind their choices, not just the 'what'.

Rules:
- Questions must reference concrete details from the materials (names, structures, theorems, passages, metrics)—never generic textbook prompts.
- Output ONLY valid JSON with this exact shape (no markdown fences):
{"questions":[{"text":"string","file_name":"string","line_range":[start_line,end_line]}, ...]}
- Exactly 3 objects in "questions".
- file_name MUST exactly match one of the SOURCE_LABEL values given below.
- line_range must be inclusive 1-based line numbers referring to the 4-digit line prefixes in that SOURCE block only.
- start_line <= end_line."""

LATEX_FOCUS_ADDENDUM = """
LaTeX and formal notation: The submission may contain raw LaTeX (e.g. \\frac, \\sum, \\int, \\mathbb, \\begin{equation}). Where such patterns appear in the SOURCE blocks, at least one of your three questions MUST probe the underlying mathematical logic—definitions, quantifiers, why that formalism was chosen, or correctness of the argument—not merely how to read the symbols."""


def _build_dynamic_system_prompt(
    subject: str,
    persona_title: str | None = None,
    persona_focus: str | None = None,
) -> str:
    if persona_title and persona_focus:
        title, focus = persona_title, persona_focus
    else:
        p = get_persona(subject)
        title, focus = p["title"], p["focus"]

    parts = [
        f"You are a {title} conducting a rigorous oral examination (viva).",
        f"Evaluation focus: {focus}",
        "You probe deep understanding: tradeoffs, justification, and integrity of the work.",
    ]
    if subject in ("MATHEMATICS", "COMPUTER_SCIENCE"):
        parts.append(
            "Pay special attention to raw LaTeX and mathematical notation (e.g. \\frac, \\sum, \\int, \\mathbb): "
            "when present, ensure questions engage the mathematical meaning and logic, not surface syntax alone."
        )
    parts.append("When producing structured output, respond with JSON only—no markdown fences.")
    return " ".join(parts)


def _build_numbered_block(label: str, content: str) -> tuple[str, int]:
    lines = content.splitlines()
    numbered = [f"{i + 1:04d}| {line}" for i, line in enumerate(lines)]
    body = "\n".join(numbered)
    return f"### SOURCE_LABEL: {label}\n{body}\n", len(lines)


def _truncate_blocks(blocks: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """Truncate (label, text) pairs to fit combined char budget."""
    total = 0
    out: list[tuple[str, str]] = []
    for label, text in blocks:
        remaining = MAX_TOTAL_CONTEXT_CHARS - total
        if remaining <= 0:
            break
        chunk = text if len(text) <= remaining else text[:remaining] + "\n[…truncated…]"
        out.append((label, chunk))
        total += len(chunk)
    return out


def _resolve_label(claimed: str, labels: list[str]) -> str | None:
    if claimed in labels:
        return claimed
    base = PurePath(claimed).name
    for L in labels:
        if L.endswith(base) or base == L:
            return L
    close = get_close_matches(claimed, labels, n=1, cutoff=0.65)
    return close[0] if close else None


def _clamp_range(
    start: int, end: int, line_count: int
) -> tuple[int, int]:
    s = max(1, min(start, line_count))
    e = max(1, min(end, line_count))
    if s > e:
        s, e = e, s
    return s, e


def _parse_json_object(raw: str) -> dict:
    text = raw.strip()
    fence = re.search(r"\{[\s\S]*\}", text)
    if fence:
        text = fence.group(0)
    return json.loads(text)


def generate_three_questions(
    blocks: list[tuple[str, str]],
    subject: str = "OTHER",
    persona_title: str | None = None,
    persona_focus: str | None = None,
) -> list[QuestionObject]:
    """
    blocks: list of (source_label, plain_text) from files and scraped URLs.
    subject: category for LaTeX / routing rules.
    persona_title / persona_focus: from classifier LLM when available.
    """
    api_key = resolve_llama_api_key()
    if not api_key:
        raise RuntimeError("GROQ_API_KEY or LLAMA_API_KEY is not set")

    settings = get_settings()
    if settings.llama_provider != "groq":
        raise RuntimeError("Only LLAMA_PROVIDER=groq is implemented for question generation")

    model = settings.llama_model or DEFAULT_GROQ_MODEL
    blocks = _truncate_blocks(blocks)

    labeled_parts: list[str] = []
    line_counts: dict[str, int] = {}
    for label, content in blocks:
        block, n = _build_numbered_block(label, content)
        labeled_parts.append(block)
        line_counts[label] = n

    context = "\n\n".join(labeled_parts)
    latex_extra = (
        LATEX_FOCUS_ADDENDUM
        if subject in ("MATHEMATICS", "COMPUTER_SCIENCE")
        else ""
    )
    user_prompt = (
        f"{EXAMINER_INSTRUCTION}{latex_extra}\n\n"
        f"--- SUBMISSION MATERIAL ---\n\n{context}"
    )

    system_prompt = _build_dynamic_system_prompt(
        subject,
        persona_title=persona_title,
        persona_focus=persona_focus,
    )

    client = Groq(api_key=api_key)
    completion = client.chat.completions.create(
        model=model,
        temperature=0.35,
        max_tokens=2048,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )

    raw = completion.choices[0].message.content or ""
    data = _parse_json_object(raw)
    items = data.get("questions")
    if not isinstance(items, list) or len(items) != 3:
        raise RuntimeError("Model did not return exactly 3 questions")

    labels = list(line_counts.keys())
    out: list[QuestionObject] = []

    for item in items:
        if not isinstance(item, dict):
            raise RuntimeError("Invalid question object")
        text = str(item.get("text", "")).strip()
        fname_raw = str(item.get("file_name", "")).strip()
        lr = item.get("line_range")
        if not text or not fname_raw or not isinstance(lr, list) or len(lr) != 2:
            raise RuntimeError("Malformed question entry")
        try:
            start = int(lr[0])
            end = int(lr[1])
        except (TypeError, ValueError) as e:
            raise RuntimeError("line_range must be two integers") from e

        resolved = _resolve_label(fname_raw, labels)
        if not resolved:
            resolved = labels[0] if labels else fname_raw
        nlines = line_counts.get(resolved, 1)
        start, end = _clamp_range(start, end, max(1, nlines))

        out.append(
            QuestionObject(
                text=text,
                file_name=resolved,
                line_range=[start, end],
            )
        )

    return out
