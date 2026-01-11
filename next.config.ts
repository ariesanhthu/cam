import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true
  },
  allowedDevOrigins: ["172.26.176.1:3000", "localhost:3000"]
};

export default nextConfig;
