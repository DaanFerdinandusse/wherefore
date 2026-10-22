"use client";

import { useState } from "react";

import type { BoardTab, MapCamera } from "@/components/trip/contracts";
import { TripMap } from "@/components/trip/map/trip-map";
import { Button } from "@/components/ui/button";

import { ASK_ID, askPlaceIds, asks, places, slots, trip } from "./fixture";

type Surface = "auto" | "static";

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button size="sm" variant={active ? "primary" : "outline"} aria-pressed={active} onClick={onClick}>
      {children}
    </Button>
  );
}

export function MapLab() {
  const [surface, setSurface] = useState<Surface>("auto");
  const [activeTab, setActiveTab] = useState<BoardTab>("all");
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [placeholder, setPlaceholder] = useState(false);
  const [camera, setCamera] = useState<MapCamera | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const ask = activeTab === `ask:${ASK_ID}`;
  const note = (line: string) => setLog((l) => [line, ...l].slice(0, 8));

  return (
    <main className="flex min-h-screen gap-8 p-7">
      <section className="flex min-w-0 flex-1 flex-col gap-4">
        <header className="flex items-end justify-between gap-6">
          <div>
            <h1 className="font-display text-title">{ask ? "Natural wine" : "14 places for Ana"}</h1>
            <p className="text-body text-text-2">
              {ask ? "4 bars from your ask. Other pins are faded." : "Numbers mark itinerary days. Bookmarks mark your places."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Toggle active={activeTab === "all"} onClick={() => setActiveTab("all")}>All</Toggle>
            <Toggle active={activeTab === "eat"} onClick={() => setActiveTab("eat")}>Eat</Toggle>
            <Toggle active={activeTab === "drink"} onClick={() => setActiveTab("drink")}>Drink</Toggle>
            <Toggle active={ask} onClick={() => setActiveTab(`ask:${ASK_ID}`)}>Natural wine · Sat</Toggle>
          </div>
        </header>

        <TripMap
          key={surface}
          surface={surface}
          trip={trip}
          places={places}
          asks={asks}
          slots={slots}
          activeTab={activeTab}
          activeAskPlaceIds={ask ? askPlaceIds : []}
          pendingPlaceholder={placeholder ? { label: "Finding more natural wine bars" } : null}
          highlightedPlaceId={highlighted}
          selectedPlaceId={selected}
          camera={camera}
          onHover={setHighlighted}
          onSelect={(id) => {
            setSelected(id);
            note(`select ${id ?? "none"}`);
          }}
          onOpenProfile={(id) => note(`open profile ${id}`)}
          onCameraChange={(c) => {
            setCamera(c);
          }}
          onSearchArea={(a) => note(`search area ${a.lat.toFixed(4)}, ${a.lon.toFixed(4)}, ${a.radiusM} m`)}
          className="h-[660px]! min-h-0!"
        />
      </section>

      <aside className="flex w-[320px] shrink-0 flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h2 className="label-caps text-text-2">Map</h2>
          <div className="flex flex-wrap gap-2">
            <Toggle active={surface === "auto"} onClick={() => setSurface("auto")}>Live map</Toggle>
            <Toggle active={surface === "static"} onClick={() => setSurface("static")}>Plain background</Toggle>
          </div>
          <div className="flex flex-wrap gap-2">
            <Toggle active={placeholder} onClick={() => setPlaceholder((p) => !p)}>Placeholder pin</Toggle>
            <Button size="sm" variant="outline" onClick={() => setCamera({ lat: 38.6958, lon: -9.1934, zoom: 15 })}>
              Camera to Belém
            </Button>
          </div>
          <p className="text-ui-sm text-text-2">
            Camera {camera ? `${camera.lat.toFixed(4)}, ${camera.lon.toFixed(4)} at ${camera.zoom.toFixed(2)}` : "not reported yet"}
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <h2 className="label-caps text-text-2">Places (hover to highlight, click to select)</h2>
          <ul className="flex flex-col">
            {places.map((p) => (
              <li key={p.tripPlaceId}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlighted(p.tripPlaceId)}
                  onMouseLeave={() => setHighlighted(null)}
                  onClick={() => setSelected(p.tripPlaceId)}
                  className={`flex w-full items-center justify-between rounded-row px-3 py-1.5 text-left text-ui hover:bg-surface ${
                    selected === p.tripPlaceId ? "bg-surface" : ""
                  }`}
                >
                  <span>{p.name}</span>
                  <span className="text-ui-sm text-text-2">{p.score}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => setHighlighted("senhor-uva")}>Highlight Senhor Uva</Button>
            <Button size="sm" variant="outline" onClick={() => setHighlighted("maat")}>Highlight MAAT</Button>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setSelected("black-sheep")}>Select Black Sheep</Button>
            <Button size="sm" variant="ghost" onClick={() => { setHighlighted(null); setSelected(null); }}>Clear</Button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <h2 className="label-caps text-text-2">Events</h2>
          <ul className="text-ui-sm text-text-2">
            {log.length === 0 ? <li>None yet</li> : log.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        </div>
      </aside>
    </main>
  );
}
