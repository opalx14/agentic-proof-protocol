import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@agentic-proof/shared'],
  // Chrome/Rabby testing opens the dev app at 127.0.0.1 while Next binds 0.0.0.0.
  // Next 16 blocks cross-origin dev asset requests unless the hostname is explicitly allowed.
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
