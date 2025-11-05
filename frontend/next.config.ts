import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ['pino-pretty', 'lokijs', 'encoding'],
};

export default nextConfig;
