import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // @henad/core is published as TypeScript source inside the workspace.
  transpilePackages: ['@henad/core'],
  images: { unoptimized: true },
}

export default nextConfig
