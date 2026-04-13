import { getPublicApiBaseUrl } from "@/lib/env-public";

/**
 * API base: in dev, prefer relative `/api` (Next rewrites to FastAPI). Otherwise absolute URL.
 */
export function getApiBaseUrl(): string {
  return getPublicApiBaseUrl();
}

/** Join base URL with a path like `/classify` or `upload`. */
export function buildApiUrl(path: string): string {
  const base = getApiBaseUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

function logFetchError(url: string, err: unknown): void {
  console.error("[vivaFetch] Network or fetch failure for:", url);
  console.error("[vivaFetch] Raw error object:", err);
  if (err instanceof Error) {
    console.error("[vivaFetch] error.name:", err.name);
    console.error("[vivaFetch] error.message:", err.message);
    console.error("[vivaFetch] error.cause:", err.cause);
    if (err.stack) {
      console.error("[vivaFetch] error.stack:", err.stack);
    }
  }
}

/**
 * `fetch` to the backend. Logs the full URL; logs non-OK HTTP status (e.g. 404);
 * try/catch logs the real Error for true network failures (e.g. ECONNREFUSED).
 */
export async function vivaFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = buildApiUrl(path);
  console.log("[vivaFetch] Full URL:", url);

  try {
    const res = await fetch(url, init);
    if (!res.ok) {
      console.warn(
        "[vivaFetch] Non-OK HTTP status:",
        res.status,
        res.statusText,
        "—",
        url,
        "(path may be wrong or server returned an error body)",
      );
    }
    return res;
  } catch (err) {
    logFetchError(url, err);
    throw err;
  }
}
