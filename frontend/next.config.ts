import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ['pino', 'pino-pretty', 'thread-stream']
};

export default nextConfig;
