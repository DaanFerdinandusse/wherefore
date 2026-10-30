import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  // The Next agent-rules block contains an em dash, which this repo bans.
  agentRules: false,
  images: {
    // Provider images and our photo proxy load directly (unoptimized, see
    // lib/images/source.ts); the optimizer keeps static files and Google
    // avatar or photo hosts. The provider hosts stay listed so an explicit
    // optimized use still works.
    // Optimized copies live a day at least, whatever the upstream header says.
    minimumCacheTTL: 86_400,
    remotePatterns: [
      { protocol: "https", hostname: "images.qloo.com" },
      { protocol: "https", hostname: "**.qloo.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "places.googleapis.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
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

// withWorkflow compiles "use workflow" / "use step" and serves the flow route
// at /.well-known/workflow/v1/flow (Local World in dev, Vercel Workflows in prod).
export default withWorkflow(nextConfig);
