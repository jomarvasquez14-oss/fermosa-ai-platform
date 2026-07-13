import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Image uploads travel through server actions; logbook images are
      // allowed up to 10 MB (components/upload/validation.ts) + form overhead.
      bodySizeLimit: "12mb",
    },
  },
  eslint: {
    // Linting runs as a dedicated CI/pre-commit step (`pnpm lint`).
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
