import "server-only";

import { buildSignals } from "@/lib/agent/tools/signals";
import { getClient, listFavorites } from "@/lib/clients";
import { displayScore, scoreEntities } from "@/lib/qloo";

import type { ScorePlacesForClient } from "./contracts";

// My places scored for one client, outside any trip: the same signals the
// agent builds for a trip with this client alone (their resolved favorites,
// never the advisor's own places) and the same scoring call score_places
// makes. Without a trip there is no board, so the display scale is the set
// itself. The upstream answer is cached in api_cache for a day (lib/qloo), so
// switching back to a client or a city re-reads the cache instead of calling.

export const scorePlacesForClient: ScorePlacesForClient = async (clientId, entityIds, scope) => {
  const ids = [...new Set(entityIds)].filter(Boolean);
  const client = await getClient(clientId, scope);
  if (!client || ids.length === 0) return { status: "scored", scores: {} };

  const favorites = await listFavorites(clientId, scope);
  const signals = buildSignals({
    travelers: [{ name: client.name, clientId, role: "client" }],
    favorites: favorites.map((f) => ({ clientId: f.clientId, entityId: f.entityId, name: f.place?.name ?? f.query, match: f.match })),
  });
  if (signals.signals.length === 0) return { status: "no-favorites" };

  try {
    // Sorted ids keep the request, and so its cache key, the same between views.
    const { scores } = await scoreEntities({ signals: signals.signals, entityIds: ids.sort(), favorites: signals.favorites });
    const affinities = scores.map((s) => s.affinity);
    return {
      status: "scored",
      scores: Object.fromEntries(scores.map((s) => [s.entityId, displayScore(s.affinity, affinities)])),
    };
  } catch (error) {
    console.error("Scoring saved places for a client failed", error);
    return { status: "failed" };
  }
};
