"use client";

import { useState } from "react";

import { TripMapPanel } from "@/components/trip/map/trip-map-panel";
import { TripStoreProvider, useTripStoreApi } from "@/components/trip/store";
import { Button } from "@/components/ui/button";
import type { Ask, SlotName, TripPlaceCard, TripSnapshot } from "@/lib/contracts";

import { asks, places, slots, trip } from "../fixture";

// Synthetic searches over the fixture's places, with the label shapes real
// chats produce: short, long, and two that read almost the same. Ids are
// uuids because the URL mirror drops anything else.
const SEARCHES: { id: string; label: string; status?: Ask["status"]; match: (p: TripPlaceCard) => boolean }[] = [
  { id: "11111111-1111-4111-8111-111111111111", label: "Quieter breakfast · Sun morning", match: (p) => p.category === "coffee" },
  { id: "22222222-2222-4222-8222-222222222222", label: "Lunch · Sat lunch", match: (p) => p.category === "eat" },
  { id: "33333333-3333-4333-8333-333333333333", label: "Dinner options, dinner after · Mon dinner", match: (p) => p.category === "eat" && !p.yourPlace },
  { id: "44444444-4444-4444-8444-444444444444", label: "Lunch · Mon lunch", match: (p) => p.category === "eat" && (p.score ?? 0) > 80 },
  { id: "55555555-5555-4555-8555-555555555555", label: "Museums near Estrela", match: (p) => p.category === "see" },
  { id: "66666666-6666-4666-8666-666666666666", label: "Hotel in Chiado", match: (p) => p.category === "stay" },
];

const SNAPSHOT: TripSnapshot = {
  trip,
  travelers: [],
  slots,
  asks: [...asks, ...SEARCHES.map(({ id, label }): Ask => ({ id, label, status: "done", resultCount: 0, loosened: [] }))],
  places: places.map((p) => ({ ...p, askIds: [...p.askIds, ...SEARCHES.filter((s) => s.match(p)).map((s) => s.id)] })),
};

const WIDTHS = [460, 738, 1180];

/** Adds in the store only, so the bar turns to "On Day 2 lunch" without a server. */
function LabPanel() {
  const store = useTripStoreApi();
  const addToSlot = async (tripPlaceId: string, day: number, slot: SlotName, position = 0) => {
    store.getState().optimisticSlot({ day, slot, position, tripPlaceId }).commit();
    return true;
  };
  return <TripMapPanel actions={{ addToSlot }} favoriteImages={new Map()} />;
}

export function PanelLab() {
  const [width, setWidth] = useState(738);
  return (
    <main className="flex min-h-screen flex-col gap-4 p-7">
      <div className="flex items-center gap-2">
        {WIDTHS.map((w) => (
          <Button key={w} size="sm" variant={w === width ? "primary" : "outline"} aria-pressed={w === width} onClick={() => setWidth(w)}>
            {w}px
          </Button>
        ))}
      </div>
      <div style={{ width }} className="h-[640px] overflow-hidden rounded-card border border-rule">
        <TripStoreProvider snapshot={SNAPSHOT} url={{ view: "map", activeTab: "all", selectedPlaceId: null, camera: null }}>
          <LabPanel />
        </TripStoreProvider>
      </div>
      <p className="text-ui-sm text-text-2">Demo data.</p>
    </main>
  );
}
