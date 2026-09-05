import type { NextConfig } from "next";

const origenesPermitidos = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origen) => origen.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: origenesPermitidos,
    },
  },
};

export default nextConfig;
