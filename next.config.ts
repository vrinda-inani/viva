import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
