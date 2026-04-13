declare namespace NodeJS {
  interface ProcessEnv {
    /** FastAPI origin (public, browser-safe), e.g. http://127.0.0.1:8000 */
    NEXT_PUBLIC_API_URL?: string;
    /**
     * Optional path prefix if the API is behind a proxy (e.g. `/api`).
     * This repo’s FastAPI app uses root paths; leave unset unless your deploy adds a prefix.
     */
    NEXT_PUBLIC_API_PATH_PREFIX?: string;
  }
}
