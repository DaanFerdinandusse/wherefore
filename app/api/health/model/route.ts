import { connection } from "next/server";

import { checkModelHealth } from "@/lib/codex/health";

// Public (PLAN 5): no requireUser on /api/health/*. Returns no secrets.
export async function GET() {
  await connection();
  const health = await checkModelHealth();
  return Response.json(health, { status: health.ok ? 200 : 503 });
}
