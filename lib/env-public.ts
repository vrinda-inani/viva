/**
 * Client-safe configuration (NEXT_PUBLIC_* only).
 * Server-only secrets must never be read here — use Route Handlers or the backend.
 */

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

/**
 * API base for `fetch`:
 * - Local dev: relative `/api` → Next.js rewrites to FastAPI (see `next.config.ts`).
 * - Production / direct backend: absolute `NEXT_PUBLIC_API_URL` (https://…).
 * Optional `NEXT_PUBLIC_API_PATH_PREFIX` only for absolute bases (e.g. path-mounted CDN).
 */
export function getPublicApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim() ?? "";

  if (raw.startsWith("/")) {
    return normalizeBaseUrl(raw);
  }

  if (raw) {
    const base = normalizeBaseUrl(raw);
    const prefixRaw = process.env.NEXT_PUBLIC_API_PATH_PREFIX?.trim() ?? "";
    if (!prefixRaw) {
      return base;
    }
    const prefix = prefixRaw.startsWith("/") ? prefixRaw : `/${prefixRaw}`;
    return normalizeBaseUrl(`${base}${prefix}`);
  }

  if (process.env.NODE_ENV === "development") {
    return "/api";
  }

  return "http://127.0.0.1:8000";
}
