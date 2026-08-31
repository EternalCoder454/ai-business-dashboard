/** @type {import('next').NextConfig} */
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
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
    ];

    // HSTS means nothing over plain HTTP, so it stays out of local dev.
    if (process.env.NODE_ENV === "production") {
      headers.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
    }

    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
