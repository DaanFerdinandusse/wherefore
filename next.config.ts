import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Next agent-rules block contains an em dash, which this repo bans.
  agentRules: false,
  images: {
    // Provider images on cards, Google photos through our proxy (same origin),
    // and Google avatar or photo hosts.
    remotePatterns: [
      { protocol: "https", hostname: "images.qloo.com" },
      { protocol: "https", hostname: "**.qloo.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "places.googleapis.com" },
    ],
  },
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  turbopack: {
    // Worktrees symlink node_modules from the main checkout; Turbopack then
    // needs a root above both. Set TURBOPACK_ROOT=/Users/<you> in .env.local.
    ...(process.env.TURBOPACK_ROOT ? { root: process.env.TURBOPACK_ROOT } : {}),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
