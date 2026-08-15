import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root so Turbopack doesn't pick up an unrelated
  // package-lock.json from a parent directory.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
