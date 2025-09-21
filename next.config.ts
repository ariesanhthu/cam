import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // allow LAN access via your IP
    allowedDevOrigins: ["192.168.137.1"],
    // or use "*" to allow all origins on your local network
    // allowedDevOrigins: ["*"],
  },
};

export default nextConfig;
