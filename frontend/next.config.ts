import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable static export for AWS Amplify deployment
  output: 'export',
  // Remove trailingSlash to generate index.html at root properly
  trailingSlash: false,
  images: {
    unoptimized: true
  }
};

export default nextConfig;
