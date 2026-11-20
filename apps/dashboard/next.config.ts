import type { NextConfig } from 'next';

const daemon = process.env.DAEMON_URL ?? 'http://localhost:3100';

const config: NextConfig = {
  reactStrictMode: true,
  // gzip buffers server-sent events, so the SSE proxy would stall
  compress: false,
  poweredByHeader: false,
  experimental: { optimizePackageImports: ['axios', 'date-fns'] },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${daemon}/api/:path*` }];
  },
};

export default config;
