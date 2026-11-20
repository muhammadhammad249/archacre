import type { NextConfig } from "next";

const privateHeaders = [
  { key: "Cache-Control", value: "private, no-store" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Content-Security-Policy", value: "base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'" },
];

const config: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
  outputFileTracingIncludes: { "/*": ["./*.html"], "/\\[\\[\\.\\.\\.path\\]\\]": ["./assets/**/*"] },
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  async headers() {
    return [
      { source: "/:path*", headers: [{ key: "X-Content-Type-Options", value: "nosniff" }] },
      { source: "/studio/:path*", headers: privateHeaders },
      { source: "/api/studio/:path*", headers: privateHeaders },
    ];
  },
};

export default config;
