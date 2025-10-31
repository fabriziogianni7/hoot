import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    // Use serverComponentsExternalPackages for externals in Turbopack
    serverComponentsExternalPackages: ['pino-pretty', 'lokijs', 'encoding'],
  },
};

export default nextConfig;
