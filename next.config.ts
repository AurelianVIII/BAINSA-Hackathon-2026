import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // The dev-tools bubble renders bottom-left, on top of the attention
  // timeline's legend. It is dev-only and never ships, but it makes the
  // layout hard to judge while building.
  devIndicators: false,
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
