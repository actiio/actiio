import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://sdk.cashfree.com https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      `connect-src 'self' https://*.supabase.co https://api.cashfree.com ${apiBaseUrl} https://va.vercel-scripts.com`,
      "frame-ancestors 'none'",
    ].join("; ");

    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Content-Security-Policy",
          value: csp,
        },
      ],
    }];
  },
};

export default nextConfig;
