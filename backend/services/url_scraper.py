"""
URL scraping for submission context.

Logic (summary):
- Accept only http/https URLs; normalize strip, optional basic SSRF guard (block localhost/private IPs is optional for v1).
- Fetch with httpx: timeout, redirect follow, browser-like User-Agent.
- If Content-Type suggests HTML (or body looks like markup), parse with BeautifulSoup: remove script/style,
  extract visible text with newlines, collapse excessive blank lines.
- If not HTML, treat body as plain text (truncated).
- Enforce a per-URL character budget so LLM context stays bounded.
"""

from __future__ import annotations

import re
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

DEFAULT_TIMEOUT = 20.0
MAX_URL_BYTES = 2_000_000
MAX_TEXT_CHARS = 48_000


def _is_allowed_scheme(url: str) -> bool:
    try:
        p = urlparse(url.strip())
    except Exception:
        return False
    return p.scheme in ("http", "https") and bool(p.netloc)


def _visible_text_from_html(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "template"]):
        tag.decompose()
    text = soup.get_text(separator="\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def scrape_url_to_text(url: str) -> tuple[str, str | None]:
    """
    Returns (text, error_message). On success error_message is None.
    """
    raw = url.strip()
    if not raw:
        return "", "Empty URL"
    if not _is_allowed_scheme(raw):
        return "", "URL must start with http:// or https://"

    headers = {
        "User-Agent": "VivaSubmissionBot/0.1 (+https://localhost; academic integrity tool)",
        "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
    }

    try:
        with httpx.Client(
            timeout=DEFAULT_TIMEOUT,
            follow_redirects=True,
            headers=headers,
        ) as client:
            resp = client.get(raw)
            resp.raise_for_status()
            if len(resp.content) > MAX_URL_BYTES:
                return "", "Response too large"
            ctype = (resp.headers.get("content-type") or "").lower()
            raw_bytes = resp.content
    except httpx.HTTPError as e:
        return "", f"Fetch failed: {e!s}"
    except Exception as e:
        return "", f"Fetch failed: {e!s}"

    try:
        text = raw_bytes.decode("utf-8", errors="replace")
    except Exception:
        text = str(raw_bytes)

    if "html" in ctype or text.lstrip().lower().startswith("<!doctype html") or "<html" in text[:500].lower():
        visible = _visible_text_from_html(text)
    else:
        visible = text.strip()

    if len(visible) > MAX_TEXT_CHARS:
        visible = visible[:MAX_TEXT_CHARS] + "\n\n[…truncated…]"

    if not visible.strip():
        return "", "No extractable text"

    return visible, None
