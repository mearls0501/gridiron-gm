import type { NextConfig } from "next";

// outputFileTracingRoot pins the workspace root to v2 — the repo also holds
// the v1 build (and its lockfile) at the top level, and without this Next
// guesses the repo root and warns about it on every dev start.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  async redirects() {
    return [
      { source: "/season-review", destination: "/recap", permanent: false },
    ];
  },
};
export default nextConfig;
