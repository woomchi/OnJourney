import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  devIndicators: false,
  allowedDevOrigins: [
    "*.trycloudflare.com",
    "*.loca.lt",
    "*.ngrok-free.dev",
    "*.ngrok-free.app",
    "*.ngrok.io"
  ],
  /* config options here */
};

export default nextConfig;
