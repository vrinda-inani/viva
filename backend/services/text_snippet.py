"""Verbatim line-range excerpts from plain extracted text (1-based inclusive lines)."""

from __future__ import annotations


def snippet_from_line_range(
    content: str,
    start_line: int,
    end_line: int,
    *,
    max_chars: int = 6000,
) -> str:
    lines = content.splitlines()
    if not lines:
        return ""
    s = max(0, start_line - 1)
    e = min(len(lines), end_line)
    if s >= len(lines):
        s = len(lines) - 1
    if e < s:
        e = s
    body = "\n".join(lines[s:e])
    body = body.strip()
    if len(body) > max_chars:
        body = body[: max_chars - 24].rstrip() + "\n[…truncated…]"
    return body
