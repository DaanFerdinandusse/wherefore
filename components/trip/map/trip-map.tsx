"use client";

import { APIProvider } from "@vis.gl/react-google-maps";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import type { TripPlaceCard } from "@/lib/contracts";
import {
  boundsForCamera,
  cameraForBounds,
  fitBoundsFor,
  offscreenDirection,
  offsetCenter,
  radiusFromViewport,
  toScreen,
  type Camera,
  type Padding,
  type ViewportSize,
} from "@/lib/map/geo";
import { pinLabel } from "@/lib/map/label";
import { buildPins, dayByPlace, isAskTab, visiblePlaces, type PinModel } from "@/lib/map/pins";
import { cn } from "@/lib/ui/cn";

import type { TripMapProps } from "../contracts";
import { MapUnavailableNotice, OffscreenChip, SearchAreaButton, ZoomControls } from "./controls";
import { GoogleSurface } from "./google-surface";
import { MapErrorBoundary } from "./map-error-boundary";
import { PinView, PlaceholderPin } from "./pins";
import { MapPreviewCard } from "./preview-card";
import { StaticSurface } from "./static-surface";
import { FIT_MAX_ZOOM, FIT_PADDING, sameCamera, type MapEngine, type MoveCause } from "./surface";
import { useElementSize } from "./use-element-size";

// The Discover map (Paper 02b, F8, F7b). Pure: everything comes in as props
// (TripMapProps) and every interaction goes out through a callback. Draws on
// the live map when it loads, and on a plain warm background with the same
// pins when it cannot ("Map is not available yet").

declare global {
  interface Window {
    /** Called by the map script when the key is rejected or the API is not enabled. */
    gm_authFailure?: () => void;
  }
}

export type TripMapComponentProps = TripMapProps & {
  /** "static" skips the live map (map lab, tests). Defaults to "auto". */
  surface?: "auto" | "static";
  /**
   * Space along each edge that workspace chrome covers (the chat dock at the
   * bottom). Fitting keeps pins out of it and the placeholder pin centers in
   * the free area.
   */
  insets?: Partial<Padding>;
};

type MapStatus = "loading" | "ready" | "unavailable";

const DESTINATION_ZOOM = 13;
/** No tiles by then: the map is not coming (a disabled API does not always call gm_authFailure). */
const MAP_TIMEOUT_MS = 10_000;
/** Where the preview card sits, from Paper 02b: 98 px from the top, 40 px from the right. */
const CARD = { top: 98, right: 40, width: 320, height: 390 };
const EDGE = 24;

type Located = TripPlaceCard & { lat: number; lon: number };

function located(card: TripPlaceCard | undefined): card is Located {
  return !!card && typeof card.lat === "number" && typeof card.lon === "number";
}

/**
 * Pans so a place sits in the free area left of the preview card. With
 * `always` false it only moves when the card or an edge hides the place.
 */
function reveal(engine: MapEngine, card: Located, always: boolean, camera: Camera | null, size: ViewportSize) {
  if (!camera) return engine.panTo(card);
  const p = toScreen(camera, size, card);
  const cardLeft = size.width - CARD.right - CARD.width;
  const covered = p.x > cardLeft - 56 && p.y < CARD.top + CARD.height;
  const outside = p.x < EDGE || p.y < EDGE || p.x > size.width - EDGE || p.y > size.height - EDGE;
  if (!always && !covered && !outside) return;
  const target = { x: Math.max(cardLeft / 2, 80), y: size.height / 2 };
  engine.panTo(offsetCenter(card, camera.zoom, size.width / 2 - target.x, size.height / 2 - target.y));
}

export function TripMap({
  trip,
  places,
  slots,
  activeTab,
  activeAskPlaceIds,
  pendingPlaceholder,
  highlightedPlaceId,
  selectedPlaceId,
  camera: controlledCamera,
  onHover,
  onSelect,
  onOpenProfile,
  onCameraChange,
  onSearchArea,
  className,
  surface = "auto",
  insets,
}: TripMapComponentProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ?? "";
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "DEMO_MAP_ID";
  const live = surface === "auto" && apiKey !== "";

  const [status, setStatus] = useState<MapStatus>(live ? "loading" : "unavailable");
  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const [liveEngine, setLiveEngine] = useState<MapEngine | null>(null);
  const [staticEngine, setStaticEngine] = useState<MapEngine | null>(null);
  const [camera, setCamera] = useState<Camera | null>(null);
  const [userMoved, setUserMoved] = useState(false);

  const cameraRef = useRef<Camera | null>(null);
  const sizeRef = useRef(size);
  const placesRef = useRef(places);
  const onCameraChangeRef = useRef(onCameraChange);
  /** The pin the pointer is on, so a hover that starts on the map does not pan it. */
  const localHover = useRef<string | null>(null);
  const lastFit = useRef<{ key: string; engine: MapEngine } | null>(null);
  const startsControlled = useRef(controlledCamera != null);
  const lastControlled = useRef<Camera | null>(controlledCamera ?? null);

  // The live map takes over once its tiles load; until then (or when it
  // cannot load) the plain background shows the same pins.
  const liveActive = live && status === "ready";
  const liveActiveRef = useRef(liveActive);
  const engine = liveActive ? liveEngine : staticEngine;

  useEffect(() => {
    sizeRef.current = size;
    placesRef.current = places;
    onCameraChangeRef.current = onCameraChange;
    liveActiveRef.current = liveActive;
  });

  useEffect(() => {
    if (!live || status !== "loading") return;
    const timer = window.setTimeout(() => setStatus((s) => (s === "loading" ? "unavailable" : s)), MAP_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [live, status]);

  // The map script reports a rejected key or a disabled API only through this global.
  useEffect(() => {
    if (!live) return;
    const previous = window.gm_authFailure;
    window.gm_authFailure = () => {
      setStatus("unavailable");
      previous?.();
    };
    return () => {
      window.gm_authFailure = previous;
    };
  }, [live]);

  const placesById = useMemo(() => new Map(places.map((p) => [p.tripPlaceId, p])), [places]);
  const visible = useMemo(() => visiblePlaces(places, activeTab), [places, activeTab]);
  const askResults = useMemo(() => {
    if (!isAskTab(activeTab)) return [];
    const ids = new Set(activeAskPlaceIds);
    return visible.filter((p) => ids.has(p.tripPlaceId));
  }, [visible, activeTab, activeAskPlaceIds]);

  const fitBounds = useMemo(() => fitBoundsFor(askResults.length > 0 ? askResults : visible), [askResults, visible]);
  const fallbackCamera = useMemo<Camera>(
    () => ({ lat: trip.destination.lat, lon: trip.destination.lon, zoom: DESTINATION_ZOOM }),
    [trip.destination.lat, trip.destination.lon],
  );

  // With the preview card open, fitting keeps the area under it free.
  const selectedCard = selectedPlaceId ? placesById.get(selectedPlaceId) : undefined;
  const cardOpen = selectedCard !== undefined && size.width >= CARD.width * 2;
  const inset = { top: insets?.top ?? 0, right: insets?.right ?? 0, bottom: insets?.bottom ?? 0, left: insets?.left ?? 0 };
  const fitPadding = useMemo<Padding>(
    () => ({
      // The control row (search, zoom) sits in the top 64 px.
      top: inset.top + FIT_PADDING + 24,
      right: inset.right + (cardOpen ? CARD.right + CARD.width + 24 : FIT_PADDING),
      bottom: inset.bottom + FIT_PADDING,
      left: inset.left + FIT_PADDING,
    }),
    [cardOpen, inset.top, inset.right, inset.bottom, inset.left],
  );

  const initialCamera =
    camera ??
    controlledCamera ??
    (fitBounds && size.width > 0 ? cameraForBounds(fitBounds, size, { padding: fitPadding, maxZoom: FIT_MAX_ZOOM }) : fallbackCamera);
  const view = camera ?? initialCamera;

  // Declutter depends on zoom; a quarter step is fine enough and keeps drag frames cheap.
  const zoomStep = Math.round(view.zoom * 4) / 4;
  const pins = useMemo(
    () => buildPins({ places, slots, activeTab, activeAskPlaceIds, highlightedPlaceId, selectedPlaceId }, zoomStep),
    [places, slots, activeTab, activeAskPlaceIds, highlightedPlaceId, selectedPlaceId, zoomStep],
  );

  const handleCamera = useCallback((next: Camera, cause: MoveCause, settled: boolean) => {
    const moved = !sameCamera(cameraRef.current, next);
    cameraRef.current = next;
    if (settled) lastControlled.current = next;
    setCamera(next);
    if (cause === "user" && moved) setUserMoved(true);
    if (cause === "fit" && settled) setUserMoved(false);
    if (settled) onCameraChangeRef.current?.(next);
  }, []);

  // Fit to the visible places (or the ask results) on load, on a tab change,
  // and when the first places arrive. A camera passed in at mount wins.
  // A new engine (the live map gave way to the plain background) fits again.
  const fitKey = `${trip.id}|${activeTab}|${visible.length > 0}|${askResults.length > 0}`;
  useEffect(() => {
    if (!engine) return;
    const previous = lastFit.current;
    if (previous && previous.key === fitKey && previous.engine === engine) return;
    lastFit.current = { key: fitKey, engine };
    if (!previous && startsControlled.current) return;
    engine.fit(fitBounds, fallbackCamera, fitPadding);
  }, [engine, fitKey, fitBounds, fallbackCamera, fitPadding]);

  // Controlled camera: follow the prop when it changes to somewhere the map is
  // not. Only a new value moves the map; the echo of our own report does not.
  useEffect(() => {
    if (!engine || !controlledCamera || sameCamera(controlledCamera, lastControlled.current)) return;
    lastControlled.current = controlledCamera;
    if (!sameCamera(controlledCamera, cameraRef.current)) engine.moveTo(controlledCamera);
  }, [engine, controlledCamera]);

  // Highlight from chat or board: pan to the place, keep the zoom.
  useEffect(() => {
    if (!engine || !highlightedPlaceId || highlightedPlaceId === localHover.current) return;
    const card = placesRef.current.find((p) => p.tripPlaceId === highlightedPlaceId);
    if (located(card)) engine.panTo(card);
  }, [engine, highlightedPlaceId]);

  // Selection: bring the pin into the free area left of the preview card when the card covers it.
  useEffect(() => {
    if (!engine || !selectedPlaceId) return;
    const card = placesRef.current.find((p) => p.tripPlaceId === selectedPlaceId);
    if (located(card)) reveal(engine, card, false, cameraRef.current, sizeRef.current);
  }, [engine, selectedPlaceId]);

  const clientName = trip.clientName;
  const renderPin = useCallback(
    (pin: PinModel) => {
      const card = placesById.get(pin.id);
      const label = card && pin.highlighted && !pin.selected ? pinLabel(card, clientName) : null;
      return <PinView pin={pin} label={label} />;
    },
    [placesById, clientName],
  );
  const pinTitle = useCallback(
    (pin: PinModel) => {
      const card = placesById.get(pin.id);
      return card ? pinLabel(card, clientName).text : pin.name;
    },
    [placesById, clientName],
  );

  const surfaceProps = {
    initialCamera,
    size,
    pins,
    renderPin,
    pinTitle,
    onPinEnter: (id: string) => {
      localHover.current = id;
      onHover(id);
    },
    onPinLeave: (id: string) => {
      if (localHover.current === id) localHover.current = null;
      onHover(null);
    },
    onPinClick: (id: string) => onSelect(id),
    onBackgroundClick: () => onSelect(null),
  };

  const days = useMemo(() => dayByPlace(slots), [slots]);
  // A place behind the open preview card counts as out of view; its chip sits at the card's edge.
  const chipMargin: Padding = { top: EDGE, right: cardOpen ? CARD.right + CARD.width + 12 : EDGE, bottom: EDGE, left: EDGE };
  const chips = [...new Set([selectedPlaceId, highlightedPlaceId])]
    .map((id) => (id ? placesById.get(id) : undefined))
    .filter(located)
    .map((card) => ({ card, direction: size.width > 0 ? offscreenDirection(view, card, size, chipMargin) : null }))
    .filter((c) => c.direction !== null);

  const staticProps = {
    ...surfaceProps,
    onReady: setStaticEngine,
    onCamera: (c: Camera, cause: MoveCause, settled: boolean) => {
      if (!liveActiveRef.current) handleCamera(c, cause, settled);
    },
  };
  const liveProps = {
    ...surfaceProps,
    onReady: setLiveEngine,
    onCamera: (c: Camera, cause: MoveCause, settled: boolean) => {
      if (liveActiveRef.current) handleCamera(c, cause, settled);
    },
  };

  function searchArea() {
    if (!onSearchArea) return;
    const radiusM = radiusFromViewport(boundsForCamera(view, size));
    onSearchArea({ lat: view.lat, lon: view.lon, radiusM });
    setUserMoved(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape" && selectedPlaceId) {
      e.stopPropagation();
      onSelect(null);
    }
  }

  const body = (
    <div
      ref={containerRef}
      onKeyDown={onKeyDown}
      data-map-status={live ? status : "static"}
      className={cn("relative isolate h-full min-h-80 overflow-hidden rounded-card border border-rule bg-canvas", className)}
    >
      {size.width > 0 ? (
        <MapErrorBoundary
          fallback={<StaticSurface key="static-fallback" {...staticProps} />}
          onError={() => setStatus("unavailable")}
        >
          {/* A failed map stays mounted and hidden: tearing it down makes the map script throw. */}
          {live ? (
            <GoogleSurface
              key="live"
              mapId={mapId}
              hidden={!liveActive}
              // Tiles after the timeout (a slow network) still bring the map in.
              onTilesLoaded={() => setStatus("ready")}
              onFailure={() => setStatus("unavailable")}
              {...liveProps}
            />
          ) : null}
          {liveActive ? null : <StaticSurface key="static" {...staticProps} />}
        </MapErrorBoundary>
      ) : null}

      {pendingPlaceholder ? (
        <PlaceholderPin
          label={pendingPlaceholder.label}
          className="pointer-events-none absolute z-10 -translate-1/2"
          style={{
            // Right of the center, clear of a highlighted pin panned there and its label on the left.
            left: inset.left + (size.width - inset.left - inset.right) / 2 + 96,
            top: inset.top + (size.height - inset.top - inset.bottom) / 2 - 8,
          }}
        />
      ) : null}

      {chips.map(({ card, direction }) =>
        direction ? (
          <OffscreenChip
            key={card.tripPlaceId}
            name={card.name}
            badge={days.get(card.tripPlaceId) ?? card.score}
            direction={direction}
            area={{
              left: chipMargin.left,
              top: chipMargin.top,
              right: size.width - chipMargin.right,
              bottom: size.height - chipMargin.bottom,
            }}
            onClick={() => {
              if (!engine) return;
              if (card.tripPlaceId === selectedPlaceId) reveal(engine, card, true, view, size);
              else engine.panTo(card);
            }}
          />
        ) : null,
      )}

      {status === "unavailable" && live ? <MapUnavailableNotice className="absolute top-[22px] left-[22px] z-30" /> : null}

      {userMoved && onSearchArea ? (
        <SearchAreaButton onClick={searchArea} className="absolute top-[22px] left-1/2 z-30 -translate-x-1/2" />
      ) : null}

      <ZoomControls
        onZoomIn={() => engine?.zoomBy(1)}
        onZoomOut={() => engine?.zoomBy(-1)}
        className="absolute top-[22px] right-[18px] z-30"
      />

      {selectedCard ? (
        <MapPreviewCard
          key={selectedCard.tripPlaceId}
          card={selectedCard}
          clientName={clientName}
          onOpen={() => onOpenProfile(selectedCard.tripPlaceId)}
          onClose={() => onSelect(null)}
          className="absolute top-[98px] right-[40px] z-40"
        />
      ) : null}
    </div>
  );

  if (!live) return body;
  return (
    <APIProvider apiKey={apiKey} onError={() => setStatus("unavailable")}>
      {body}
    </APIProvider>
  );
}

export default TripMap;
