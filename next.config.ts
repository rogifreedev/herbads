import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "mammoth"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.fbcdn.net"
      },
      {
        protocol: "https",
        hostname: "*.cdninstagram.com"
      }
    ]
  }
};

export default nextConfig;
