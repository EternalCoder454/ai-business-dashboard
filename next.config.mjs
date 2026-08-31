/** @type {import('next').NextConfig} */

const isProduction = process.env.NODE_ENV === "production";

/**
 * Content Security Policy.
 *
 * Everything the app loads is same-origin. The two exceptions are stated
 * explicitly rather than waved through with a wildcard:
 *
 * - Google serves the profile picture from its own CDN after sign in.
 * - form-action names accounts.google.com because Chrome checks the redirect
 *   chain that follows a form submission, and the sign-in form's response is a
 *   302 to Google. Omitting it blocks sign in.
 *
 * script-src keeps 'unsafe-inline', which is the one genuinely weak directive
 * here, and it is a deliberate choice rather than an oversight. The App Router
 * emits per-page inline bootstrap scripts whose content changes with the page,
 * so hashes cannot cover them, and the supported alternative is a per-request
 * nonce generated in the proxy. The proxy deliberately does not run on the
 * sign-in page, so a nonce scheme would leave exactly the page that must never
 * break without one. Locking down connect-src, object-src, base-uri,
 * frame-ancestors, and form-action removes most of what an injected script
 * could usefully do; closing this last gap needs the nonce work, and it is not
 * worth risking the entry path for.
 */
function contentSecurityPolicy() {
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "form-action 'self' https://accounts.google.com",
    "img-src 'self' data: blob: https://*.googleusercontent.com",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    // Every call to Anthropic goes through this app's own route, so the browser
    // never needs to reach api.anthropic.com and should not be allowed to.
    isProduction ? "connect-src 'self'" : "connect-src 'self' ws: wss:",
    isProduction
      ? "script-src 'self' 'unsafe-inline'"
      : // Turbopack's dev client evaluates code it fetches.
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  ];

  // No upgrade-insecure-requests. Every source above is already same-origin or
  // https, so it has nothing to upgrade, and it breaks a production build
  // served over plain http, which is how this gets tested locally. HSTS is what
  // actually keeps the deployment off http.

  return directives.join("; ");
}

const nextConfig = {
  reactStrictMode: true,
  // Do not advertise the framework and version to anyone probing the app.
  poweredByHeader: false,
  // Lets a second instance run on another port with its own build output, so
  // two servers never share (and corrupt) the same .next directory.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // The Library absorbed these two, and old links should not 404.
  async redirects() {
    return [
      { source: "/skills", destination: "/library/skills", permanent: false },
      { source: "/deliverables", destination: "/library/deliverables", permanent: false },
    ];
  },

  async headers() {
    const headers = [
      { key: "Content-Security-Policy", value: contentSecurityPolicy() },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      // Paired with frame-ancestors above, for browsers that honour only one.
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
      // Nothing here uses any of these, so nothing here should be able to ask.
      {
        key: "Permissions-Policy",
        value: [
          "camera=()",
          "microphone=()",
          "geolocation=()",
          "payment=()",
          "usb=()",
          "magnetometer=()",
          "gyroscope=()",
          "accelerometer=()",
          "interest-cohort=()",
        ].join(", "),
      },
      // Sign in is a full page redirect rather than a popup, so isolating the
      // browsing context costs nothing here.
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    ];

    // HSTS means nothing over plain HTTP, so it stays out of local dev.
    if (isProduction) {
      headers.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
    }

    return [
      { source: "/:path*", headers },
      // The API answers with data, never with a document. Saying so stops a
      // browser rendering a stray response as a page.
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
