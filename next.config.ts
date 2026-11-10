import type { NextConfig } from "next"

const securityHeaders = [
  // Force HTTPS for two years (browsers ignore this on plain http://localhost)
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Stop other sites from embedding our pages in a frame (clickjacking)
  { key: "X-Frame-Options", value: "DENY" },
  // Stop browsers guessing file types
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Do not leak full page addresses to other sites
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Switch off browser features the app does not use
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
]

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
  // csv-parse removed: nothing uses it any more
  serverExternalPackages: ["@prisma/client", "prisma", "bcryptjs"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
}

export default nextConfig