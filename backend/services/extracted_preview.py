"""Build combined extracted text + per-source payloads for upload response."""

from __future__ import annotations

from models.schemas import ExtractedSource

# Cap total size returned to the browser (Docling/Crawl4AI can be large).
MAX_UPLOAD_EXTRACT_CHARS = 500_000


def build_extracted_from_blocks(
    blocks: list[tuple[str, str]],
) -> tuple[str, list[ExtractedSource]]:
    sources: list[ExtractedSource] = []
    total = 0
    for label, text in blocks:
        if total >= MAX_UPLOAD_EXTRACT_CHARS:
            break
        remaining = MAX_UPLOAD_EXTRACT_CHARS - total
        if len(text) <= remaining:
            chunk = text
        else:
            chunk = text[:remaining] + "\n[…truncated…]"
        sources.append(ExtractedSource(label=label, text=chunk))
        total += len(chunk)

    extracted_text = "\n\n".join(f"### {s.label}\n{s.text}" for s in sources)
    return extracted_text, sources
