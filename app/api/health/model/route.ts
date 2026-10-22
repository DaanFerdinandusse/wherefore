import { connection } from "next/server";

import { requireUser } from "@/lib/auth/server";
import { checkModelConfig, hasHealthSecret, probeModel } from "@/lib/codex/health";

// GET /api/health/model: the passive check, public (PLAN 5): configuration
// present, credential row present, token not expired. No model call, no
// secrets. 200 when ok, 503 otherwise.
//
// GET /api/health/model?probe=1: the active check, one real completion. Needs
// a signed-in user or `Authorization: Bearer $HEALTH_SECRET`; 401 otherwise.
// At most one model call per minute per instance (the last result is
// returned with cached: true in between).
export async function GET(request: Request) {
  await connection();
  const probe = new URL(request.url).searchParams.get("probe");
  if (!probe || probe === "0") {
    const health = await checkModelConfig();
    return Response.json(health, { status: health.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
  }

  if (!hasHealthSecret(request.headers.get("authorization"))) {
    try {
      await requireUser();
    } catch {
      return Response.json(
        { error: "unauthorized:health", message: "Sign in, or send the health secret, to run the model probe." },
        { status: 401 },
      );
    }
  }
  const health = await probeModel();
  return Response.json(health, { status: health.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
