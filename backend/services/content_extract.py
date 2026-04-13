from __future__ import annotations

from io import BytesIO
from pathlib import PurePath

from pypdf import PdfReader

TEXT_EXTENSIONS = {
    ".py",
    ".md",
    ".txt",
    ".tex",
    ".csv",
    ".json",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".html",
    ".css",
}
MAX_FILE_BYTES = 5_000_000


def extract_text_from_file(filename: str, data: bytes) -> tuple[str, str | None]:
    """
    Returns (text, error). Supports plain text-like extensions and PDF.
    """
    if len(data) > MAX_FILE_BYTES:
        return "", "File too large"

    path = PurePath(filename or "upload")
    suffix = path.suffix.lower()

    if suffix == ".pdf":
        try:
            reader = PdfReader(BytesIO(data))
            parts: list[str] = []
            for page in reader.pages:
                t = page.extract_text() or ""
                parts.append(t)
            text = "\n\n".join(parts).strip()
            if not text:
                return "", "No text extracted from PDF"
            return text, None
        except Exception as e:
            return "", f"PDF read failed: {e!s}"

    if suffix not in TEXT_EXTENSIONS and suffix != "":
        # Unknown extension: try utf-8 anyway
        pass

    try:
        return data.decode("utf-8", errors="replace"), None
    except Exception as e:
        return "", f"Decode failed: {e!s}"
