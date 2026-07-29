/** @type {import('next').NextConfig} */

// 'unsafe-eval' is only needed by the dev HMR runtime. Dropping it in
// production removes a class of eval-based script execution; Stripe.js,
// Google Maps JS v3, and GA4 do not require it. ('unsafe-inline' still
// remains for scripts — removing it cleanly needs per-request nonces, a
// tracked follow-up. Smoke-test the address picker + checkout after any
// change to this policy.)
const isDev = process.env.NODE_ENV !== "production";
const scriptSrc = [
  "script-src 'self' 'unsafe-inline'",
  isDev ? "'unsafe-eval'" : "",
  "https://js.stripe.com https://maps.googleapis.com https://maps.gstatic.com https://www.googletagmanager.com https://www.google-analytics.com",
]
  .filter(Boolean)
  .join(" ");

const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              scriptSrc,
              "worker-src 'self' blob: https://maps.googleapis.com https://maps.gstatic.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.fontshare.com https://cdn.fontshare.com",
              "font-src 'self' https://fonts.gstatic.com https://api.fontshare.com https://cdn.fontshare.com",
              "img-src 'self' data: blob: https://maps.googleapis.com https://*.googleapis.com https://maps.gstatic.com",
              "frame-src https://js.stripe.com https://www.google.com",
              "connect-src 'self' blob: https://*.supabase.co https://api.stripe.com https://maps.googleapis.com https://*.googleapis.com https://maps.gstatic.com https://region1.google-analytics.com https://www.google-analytics.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
