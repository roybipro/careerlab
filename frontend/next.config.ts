import type { NextConfig } from "next";

// Where the FastAPI backend lives. In production this is set by the host.
const API_URL = process.env.API_URL ?? "http://localhost:8000";

// Rewrites are baked in at build time, so a production build without API_URL would proxy to localhost.
if (process.env.NODE_ENV === "production" && !process.env.API_URL) {
  console.warn("[careerlab] API_URL is not set: /api/v1/* will be proxied to http://localhost:8000. Set API_URL before `next build`.");
}

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the root so a stray lockfile in a parent folder is not picked up.
    root: import.meta.dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [
      // The browser only talks to its own origin, so the session cookie stays first-party.
      { source: "/api/v1/:path*", destination: `${API_URL}/api/v1/:path*` },
    ];
  },
  async redirects() {
    return [{ source: "/", destination: "/dashboard", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
