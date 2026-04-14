import type { NextConfig } from "next";

/** GitHub project Pages URL is `https://<user>.github.io/<repo>/` — set `BASE_PATH=/<repo>` when building for Pages. */
const basePath = process.env.BASE_PATH?.trim() || "";

const nextConfig: NextConfig = {
  output: "export",
  basePath: basePath || undefined,
  images: { unoptimized: true },
  /**
   * Dev-only proxy: browser calls same-origin `/api/*` → FastAPI on :8000 with no CORS.
   * Production: set `NEXT_PUBLIC_API_URL` to an absolute API origin (rewrites disabled).
   */
  async rewrites() {
    if (process.env.NODE_ENV !== "development") {
      return [];
    }
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8000/:path*",
      },
    ];
  },
};

export default nextConfig;
