import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === "development";
const hasGoogleTracking = Boolean(
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim()
  || process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim(),
);
const scriptSources = [
  "'self'",
  "'unsafe-inline'",
  ...(isDevelopment ? ["'unsafe-eval'"] : []),
  ...(hasGoogleTracking ? ["https://www.googletagmanager.com"] : []),
];
const connectSources = [
  "'self'",
  ...(hasGoogleTracking
    ? [
      "https://www.google-analytics.com",
      "https://region1.google-analytics.com",
      "https://www.googletagmanager.com",
      "https://googleads.g.doubleclick.net",
      "https://www.googleadservices.com",
    ]
    : []),
];
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptSources.join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src ${connectSources.join(" ")}`,
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["read-excel-file", "unzipper"],
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    // As URLs entram somente por fornecedores autorizados/admin e serão
    // substituídas por storage próprio quando o pipeline de cópia for ativado.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
        ],
      },
    ];
  },
};

export default nextConfig;
