import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  // next dev would otherwise append its own block (with an em dash) to AGENTS.md.
  agentRules: false,
  turbopack: {
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
