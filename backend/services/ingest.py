"""
Ingestion: fast path (≤2000 chars, lightweight) for classification / persona beat;
deep path (Docling PDF + Crawl4AI / Firecrawl / GitHub) for full viva question context.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import os
import random
import tempfile
from pathlib import PurePath
from urllib.parse import urlparse

import anyio
import httpx
from fastapi import HTTPException, UploadFile

from services.content_extract import extract_text_from_file
from services.url_scraper import scrape_url_to_text

logger = logging.getLogger(__name__)

# Crawl4AI / Playwright: realistic desktop Chrome UA + stealth (see _crawl4ai_markdown).
_C4AI_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)

MAX_URLS = 12
MAX_FILES = 20
MAX_FILE_BYTES = 5_000_000

FAST_SAMPLE_CHAR_BUDGET = 2000

GITHUB_FILE_EXTENSIONS = frozenset(
    {
        ".py",
        ".md",
        ".txt",
        ".tex",
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".json",
        ".yaml",
        ".yml",
        ".rs",
        ".go",
        ".java",
        ".c",
        ".h",
        ".cpp",
        ".css",
        ".html",
        ".csv",
    }
)
MAX_GITHUB_FILES = 28
MAX_GITHUB_FILE_BYTES = 120_000
MAX_GITHUB_TOTAL_CHARS = 95_000

FIRECRAWL_URL = os.getenv("FIRECRAWL_API_URL", "https://api.firecrawl.dev/v1/scrape")

_FIRECRAWL_HOST_HINTS = (
    "linkedin.com",
    "webflow.io",
    "framer.website",
    "notion.site",
    "wixsite.com",
    "squarespace.com",
)


def parse_urls_json(urls: str) -> list[str]:
    import json

    if not urls or not urls.strip():
        return []
    try:
        parsed = json.loads(urls)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"urls must be a JSON array: {e}") from e
    if not isinstance(parsed, list):
        raise HTTPException(status_code=400, detail="urls must be a JSON array of strings")
    return [str(u).strip() for u in parsed if str(u).strip()]


def _github_owner_repo(url: str) -> tuple[str, str, str] | None:
    try:
        p = urlparse(url.strip())
    except Exception:
        return None
    if p.netloc.lower() not in ("github.com", "www.github.com"):
        return None
    parts = [x for x in p.path.strip("/").split("/") if x]
    if len(parts) < 2:
        return None
    owner, repo = parts[0], parts[1]
    repo = repo.removesuffix(".git")
    branch = ""
    if len(parts) > 2 and parts[2] == "tree" and len(parts) > 3:
        branch = parts[3]
    return owner, repo, branch


def _github_headers() -> dict[str, str]:
    token = os.getenv("GITHUB_TOKEN", "").strip()
    h = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "VivaIngest/1.0",
    }
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def truncate_blocks_to_budget(
    blocks: list[tuple[str, str]], budget: int
) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    remaining = budget
    for label, text in blocks:
        if remaining <= 0:
            break
        chunk = text[:remaining]
        if chunk.strip():
            out.append((label, chunk))
        remaining -= len(chunk)
    return out


def _fetch_github_readme_sample(url: str, budget: int) -> tuple[str, str | None]:
    """README or repo description only — fast path for classification."""
    parsed = _github_owner_repo(url)
    if not parsed:
        return "", "Not a GitHub repository URL"
    owner, repo, _ = parsed
    with httpx.Client(timeout=20.0, headers=_github_headers()) as client:
        r = client.get(f"https://api.github.com/repos/{owner}/{repo}/readme")
        if r.status_code == 200:
            data = r.json()
            content = data.get("content") or ""
            try:
                raw = base64.b64decode(content.replace("\n", "")).decode(
                    "utf-8",
                    errors="replace",
                )
            except Exception:
                raw = ""
            if raw.strip():
                return raw[:budget], None

        r2 = client.get(f"https://api.github.com/repos/{owner}/{repo}")
        if r2.status_code != 200:
            return "", "GitHub repository not found"
        meta = r2.json()
        desc = str(meta.get("description") or "").strip()
        topics = meta.get("topics") or []
        topic_s = ", ".join(topics[:8]) if isinstance(topics, list) else ""
        blob = f"# {owner}/{repo}\n{desc}\nTopics: {topic_s}".strip()
        return blob[:budget], None


def _fetch_github_flat_markdown(url: str) -> tuple[str, str | None]:
    parsed = _github_owner_repo(url)
    if not parsed:
        return "", "Not a GitHub repository URL"
    owner, repo, branch_override = parsed

    with httpx.Client(timeout=45.0, headers=_github_headers()) as client:
        r = client.get(f"https://api.github.com/repos/{owner}/{repo}")
        if r.status_code == 404:
            return "", "GitHub repository not found (private repos need GITHUB_TOKEN)"
        r.raise_for_status()
        repo_data = r.json()
        default_branch = str(repo_data.get("default_branch") or "main")
        branch = branch_override or default_branch

        rc = client.get(
            f"https://api.github.com/repos/{owner}/{repo}/commits/{branch}",
        )
        if rc.status_code != 200:
            return "", f"Could not resolve branch {branch!r}"
        commit = rc.json()
        tree_sha = commit.get("commit", {}).get("tree", {}).get("sha")
        if not tree_sha:
            return "", "Could not read repository tree"

        rt = client.get(
            f"https://api.github.com/repos/{owner}/{repo}/git/trees/{tree_sha}",
            params={"recursive": "1"},
        )
        rt.raise_for_status()
        tree = rt.json()
        items = tree.get("tree") or []
        if not isinstance(items, list):
            return "", "Unexpected GitHub tree response"

        blobs: list[tuple[str, int]] = []
        for it in items:
            if it.get("type") != "blob":
                continue
            path = str(it.get("path", ""))
            suf = PurePath(path).suffix.lower()
            if suf not in GITHUB_FILE_EXTENSIONS:
                continue
            size = int(it.get("size") or 0)
            if size <= 0 or size > MAX_GITHUB_FILE_BYTES:
                continue
            blobs.append((path, size))

        blobs.sort(key=lambda x: x[1])
        blobs = blobs[:MAX_GITHUB_FILES]

        lines: list[str] = [
            f"# GitHub repository: {owner}/{repo}",
            f"**Branch:** {branch}",
            "",
            "## File map (ingested excerpts)",
            "",
        ]
        total = 0
        for path, _ in blobs:
            if total >= MAX_GITHUB_TOTAL_CHARS:
                break
            raw_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}"
            fr = client.get(raw_url)
            if fr.status_code != 200:
                continue
            try:
                text = fr.content.decode("utf-8", errors="replace")
            except Exception:
                continue
            chunk = f"### `{path}`\n\n```\n{text}\n```\n\n"
            if total + len(chunk) > MAX_GITHUB_TOTAL_CHARS:
                chunk = chunk[: MAX_GITHUB_TOTAL_CHARS - total] + "\n\n[…truncated…]\n"
            lines.append(chunk)
            total += len(chunk)

        body = "\n".join(lines).strip()
        if len(body) < 80:
            return "", "Could not fetch repository files (rate limit or empty tree)"
        return body, None


def _firecrawl_markdown(url: str) -> str | None:
    key = os.getenv("FIRECRAWL_API_KEY", "").strip()
    if not key:
        return None
    try:
        with httpx.Client(timeout=60.0) as client:
            r = client.post(
                FIRECRAWL_URL,
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                },
                json={
                    "url": url,
                    "formats": ["markdown"],
                    "onlyMainContent": True,
                },
            )
            r.raise_for_status()
            data = r.json()
    except Exception:
        return None

    if not isinstance(data, dict):
        return None
    inner = data.get("data") if "data" in data else data
    if not isinstance(inner, dict):
        return None
    md = inner.get("markdown") or inner.get("content")
    if isinstance(md, str) and len(md.strip()) > 40:
        return md.strip()
    return None


def _host_is_linkedin(url: str) -> bool:
    try:
        host = urlparse(url).netloc.lower()
    except Exception:
        return False
    return host == "linkedin.com" or host.endswith(".linkedin.com")


def _prefer_firecrawl(url: str) -> bool:
    if not os.getenv("FIRECRAWL_API_KEY", "").strip():
        return False
    try:
        host = urlparse(url).netloc.lower()
    except Exception:
        return False
    return any(h in host for h in _FIRECRAWL_HOST_HINTS)


def _markdown_from_crawl4ai_result(result: object) -> str | None:
    md = getattr(result, "markdown", None)
    if isinstance(md, str) and md.strip():
        return md.strip()
    if md is not None:
        raw = getattr(md, "raw_markdown", None) or getattr(md, "fit_markdown", None)
        if isinstance(raw, str) and raw.strip():
            return raw.strip()
    return None


def _build_crawl4ai_browser_config(*, linkedin: bool) -> object | None:
    """Stealth + realistic UA; visible window on LinkedIn (headless=False) to reduce 999 blocks."""
    from crawl4ai import BrowserConfig

    headless = not linkedin
    attempts: tuple[dict, ...] = (
        {
            "headless": headless,
            "verbose": False,
            "user_agent": _C4AI_USER_AGENT,
            "enable_stealth": True,
        },
        {
            "headless": headless,
            "verbose": False,
            "user_agent": _C4AI_USER_AGENT,
        },
        {"headless": True, "verbose": False},
    )
    for kw in attempts:
        try:
            return BrowserConfig(**kw)
        except TypeError:
            continue
        except Exception:
            continue
    return None


async def _crawl4ai_markdown(url: str) -> str | None:
    """
    Playwright-backed crawl when Firecrawl is not configured.
    DefaultMarkdownGenerator + PruningContentFilter strips nav/footers for clean markdown.
    Uses stealth + realistic UA; LinkedIn uses a headed browser, networkidle, and a random pre-crawl delay.
    """
    try:
        from crawl4ai import AsyncWebCrawler, CrawlerRunConfig
        from crawl4ai.content_filter_strategy import PruningContentFilter
        from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator
    except ImportError:
        logger.warning("crawl4ai not installed; falling back to static scrape")
        return None

    try:
        from crawl4ai import CacheMode
    except ImportError:
        CacheMode = None  # type: ignore[misc, assignment]

    linkedin = _host_is_linkedin(url)

    md_gen = DefaultMarkdownGenerator(
        content_filter=PruningContentFilter(threshold=0.45, threshold_type="fixed"),
        options={
            "ignore_links": False,
            "escape_html": True,
        },
    )
    page_timeout = 120_000 if linkedin else 90_000
    run_kwargs: dict = {
        "markdown_generator": md_gen,
        "wait_until": "networkidle",
        "page_timeout": page_timeout,
        "delay_before_return_html": 2.0,
    }
    if CacheMode is not None:
        run_kwargs["cache_mode"] = CacheMode.DISABLED

    browser_cfg = _build_crawl4ai_browser_config(linkedin=linkedin)

    run_cfg: CrawlerRunConfig | None = None
    for wait_until in ("networkidle", "domcontentloaded"):
        kw = {**run_kwargs, "wait_until": wait_until}
        try:
            run_cfg = CrawlerRunConfig(**kw)
            break
        except TypeError:
            kw.pop("delay_before_return_html", None)
            try:
                run_cfg = CrawlerRunConfig(**kw)
                break
            except TypeError:
                continue
    if run_cfg is None:
        return None

    async def _run_crawler(crawler: object) -> object:
        await asyncio.sleep(random.uniform(1.0, 3.0))
        return await crawler.arun(url=url, config=run_cfg)

    try:
        if browser_cfg is not None:
            async with AsyncWebCrawler(config=browser_cfg) as crawler:
                result = await _run_crawler(crawler)
        else:
            async with AsyncWebCrawler() as crawler:
                result = await _run_crawler(crawler)
    except Exception as e:
        logger.warning("Crawl4AI failed for %s: %s", url, e)
        return None

    if not getattr(result, "success", False):
        return None
    return _markdown_from_crawl4ai_result(result)


def extract_pdf_fast_sample(data: bytes, max_chars: int = 1800) -> tuple[str, str | None]:
    """Lightweight PDF text for classification (first pages, no Docling)."""
    if len(data) > MAX_FILE_BYTES:
        return "", "File too large"
    from io import BytesIO

    from pypdf import PdfReader

    try:
        reader = PdfReader(BytesIO(data))
        parts: list[str] = []
        for page in reader.pages[:3]:
            parts.append(page.extract_text() or "")
        text = "\n\n".join(parts).strip()
        if not text:
            return "", "No text extracted from PDF (try deep ingest)"
        return text[:max_chars], None
    except Exception as e:
        return "", f"PDF read failed: {e!s}"


def _pdf_format_option_for_opts(opts: "PdfPipelineOptions") -> "PdfFormatOption":
    """Prefer PyPdfium backend + pipeline opts so Docling skips docling-parse / heavy layout weights when possible."""
    from docling.document_converter import PdfFormatOption

    try:
        from docling.backend.pypdfium2_backend import PyPdfiumDocumentBackend

        return PdfFormatOption(pipeline_options=opts, backend=PyPdfiumDocumentBackend)
    except Exception:
        return PdfFormatOption(pipeline_options=opts)


def extract_pdf_docling(data: bytes) -> tuple[str, str | None]:
    """
    Docling PDF → Markdown. Default path is lightweight: no OCR/table/formula models,
    TableFormer **fast** mode, **force_backend_text** (embedded PDF text, no layout NN),
    and **PyPdfium** backend when available — avoids "loading weights" / 503 on simple PDFs.
    Set VIVA_DOC_FULL_PIPELINE=true for richer (still TableFormer fast) processing.
    Falls back to pypdf if Docling fails.
    """
    if len(data) > MAX_FILE_BYTES:
        return "", "File too large"

    try:
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.pipeline_options import (
            PdfPipelineOptions,
            TableFormerMode,
            TableStructureOptions,
        )
        from docling.document_converter import DocumentConverter
    except ImportError:
        return extract_pdf_fast_sample(data, max_chars=500_000)

    full_pipeline = os.getenv("VIVA_DOC_FULL_PIPELINE", "").lower() in (
        "1",
        "true",
        "yes",
    )
    fast_table_opts = TableStructureOptions(mode=TableFormerMode.FAST)

    if full_pipeline:
        formula_on = os.getenv("VIVA_DOC_FORMULAS", "true").lower() not in (
            "0",
            "false",
            "no",
        )
        try:
            opts = PdfPipelineOptions(
                do_formula_enrichment=formula_on,
                table_structure_options=fast_table_opts,
                generate_page_images=False,
                generate_picture_images=False,
            )
        except TypeError:
            opts = PdfPipelineOptions()
            opts.do_formula_enrichment = formula_on
            opts.table_structure_options = fast_table_opts
    else:
        light_kw: dict = {
            "do_ocr": False,
            "do_table_structure": False,
            "do_formula_enrichment": False,
            "table_structure_options": fast_table_opts,
            "generate_page_images": False,
            "generate_picture_images": False,
        }
        try:
            opts = PdfPipelineOptions(**light_kw, force_backend_text=True)
        except TypeError:
            opts = PdfPipelineOptions(**light_kw)
            if hasattr(opts, "force_backend_text"):
                opts.force_backend_text = True
        for _attr in (
            "do_code_enrichment",
            "do_picture_description",
            "do_picture_classification",
        ):
            if hasattr(opts, _attr):
                setattr(opts, _attr, False)

    pdf_opt = _pdf_format_option_for_opts(opts)
    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: pdf_opt,
        }
    )

    tmp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(data)
            tmp_path = tmp.name
        result = converter.convert(tmp_path)
        md = result.document.export_to_markdown()
        if not md or not str(md).strip():
            return "", "Docling produced empty markdown"
        return str(md).strip(), None
    except Exception as e:
        logger.warning("Docling PDF failed, using pypdf fallback: %s", e)
        return extract_pdf_fast_sample(data, max_chars=500_000)
    finally:
        if tmp_path and os.path.isfile(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


async def _ingest_file_fast(uf: UploadFile, per_item_cap: int) -> tuple[str, str]:
    name = uf.filename or "upload"
    data = await uf.read()
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(status_code=400, detail=f"File {name!r} is too large")

    path = PurePath(name)
    suffix = path.suffix.lower()

    if suffix == ".pdf":
        text, err = extract_pdf_fast_sample(data, max_chars=per_item_cap)
        if err:
            raise HTTPException(status_code=400, detail=f"Could not read PDF {name!r}: {err}")
        return name, text

    text, err = extract_text_from_file(name, data)
    if err:
        raise HTTPException(
            status_code=400,
            detail=f"Could not read file {name!r}: {err}",
        )
    return name, text[:per_item_cap]


async def _ingest_file_deep(uf: UploadFile) -> tuple[str, str]:
    name = uf.filename or "upload"
    data = await uf.read()
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(status_code=400, detail=f"File {name!r} is too large")

    path = PurePath(name)
    suffix = path.suffix.lower()

    if suffix == ".pdf":

        def _run_docling() -> tuple[str, str | None]:
            return extract_pdf_docling(data)

        text, err = await anyio.to_thread.run_sync(_run_docling)
        if err:
            raise HTTPException(status_code=400, detail=f"Could not read PDF {name!r}: {err}")
        if not text.strip():
            raise HTTPException(status_code=400, detail=f"Empty PDF {name!r}")
        return name, text

    text, err = extract_text_from_file(name, data)
    if err:
        raise HTTPException(
            status_code=400,
            detail=f"Could not read file {name!r}: {err}",
        )
    if not text.strip():
        raise HTTPException(status_code=400, detail=f"Empty content in file {name!r}")
    return name, text


async def _ingest_url_fast(url: str, budget: int) -> tuple[str, str]:
    gh_err: str | None = None
    if _github_owner_repo(url):
        text, err = _fetch_github_readme_sample(url, budget)
        if text and err is None:
            return url, text
        gh_err = err

    text, err = scrape_url_to_text(url)
    if err:
        detail = err
        if gh_err:
            detail = f"{err} (GitHub: {gh_err})"
        raise HTTPException(status_code=400, detail=f"URL {url!r}: {detail}")
    return url, text[:budget]


async def _ingest_url_deep(url: str) -> tuple[str, str]:
    gh_err: str | None = None
    if _github_owner_repo(url):
        gh_text, gh_err = _fetch_github_flat_markdown(url)
        if gh_text and gh_err is None:
            return url, gh_text

    if _prefer_firecrawl(url):
        md = _firecrawl_markdown(url)
        if md:
            return url, md

    if os.getenv("VIVA_USE_CRAWL4AI", "true").lower() in ("1", "true", "yes"):
        md = await _crawl4ai_markdown(url)
        if md:
            return url, md

    text, err = scrape_url_to_text(url)
    if err:
        detail = err
        if gh_err:
            detail = f"{err} (GitHub: {gh_err})"
        raise HTTPException(status_code=400, detail=f"URL {url!r}: {detail}")
    return url, text


async def ingest_submission_blocks_fast(
    files: list[UploadFile],
    urls_raw: str,
    budget: int = FAST_SAMPLE_CHAR_BUDGET,
) -> list[tuple[str, str]]:
    """
    Minimal ingestion for /classify — keeps persona assignment snappy.
    """
    url_list = parse_urls_json(urls_raw)
    if len(url_list) > MAX_URLS:
        raise HTTPException(status_code=400, detail=f"At most {MAX_URLS} URLs allowed")
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"At most {MAX_FILES} files allowed")

    per_file = max(400, budget // max(1, len(files) + len(url_list)))

    blocks: list[tuple[str, str]] = []
    for uf in files:
        blocks.append(await _ingest_file_fast(uf, per_item_cap=per_file))

    for raw_url in url_list:
        blocks.append(await _ingest_url_fast(raw_url, budget=per_file))

    if not blocks:
        raise HTTPException(
            status_code=400,
            detail="Provide at least one file or URL",
        )

    return truncate_blocks_to_budget(blocks, budget)


async def ingest_submission_blocks(
    files: list[UploadFile],
    urls_raw: str,
) -> list[tuple[str, str]]:
    """
    Full pipeline for /upload: Docling (PDF LaTeX), Crawl4AI / Firecrawl / GitHub.
    """
    url_list = parse_urls_json(urls_raw)
    if len(url_list) > MAX_URLS:
        raise HTTPException(status_code=400, detail=f"At most {MAX_URLS} URLs allowed")
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"At most {MAX_FILES} files allowed")

    blocks: list[tuple[str, str]] = []

    for uf in files:
        blocks.append(await _ingest_file_deep(uf))

    for raw_url in url_list:
        blocks.append(await _ingest_url_deep(raw_url))

    if not blocks:
        raise HTTPException(
            status_code=400,
            detail="Provide at least one file or URL",
        )

    return blocks
