import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

  // Tell Next.js not to bundle these server-only packages
  // ngrok uses native binaries that can't be bundled by webpack/turbopack
  serverExternalPackages: ['@ngrok/ngrok'],
};

export default nextConfig;
