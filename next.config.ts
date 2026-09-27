import type { NextConfig } from "next";
import os from "node:os";
import path from "node:path";

// This machine's LAN IPv4 addresses. Next 16 rejects the dev HMR websocket
// from any origin other than localhost, and without it the page never
// hydrates — opening the "Network:" URL (e.g. from another laptop at the
// demo) shows the UI but every button is dead. Read from the interfaces
// rather than hard-coded, since the venue Wi-Fi hands out new IPs.
const lanAddresses = Object.values(os.networkInterfaces())
  .flat()
  .filter((iface) => iface && iface.family === "IPv4" && !iface.internal)
  .map((iface) => iface!.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: lanAddresses,
  // The dev-tools bubble renders bottom-left, on top of the attention
  // timeline's legend. It is dev-only and never ships, but it makes the
  // layout hard to judge while building.
  devIndicators: false,
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
