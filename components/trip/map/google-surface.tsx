"use client";

import { AdvancedMarker, Map, RenderingType, useMap, type MapCameraChangedEvent } from "@vis.gl/react-google-maps";
import { useEffect, useRef, useState } from "react";

import type { Camera } from "@/lib/map/geo";

import { clampZoom, MAX_ZOOM, MIN_ZOOM, type MoveCause, type SurfaceProps } from "./surface";

// The live map: vector rendering with the cloud style behind the map id, no
// default UI, greedy gestures, pins as AdvancedMarkers with our own HTML.
// Must render inside an APIProvider (TripMap owns it).

/** A working map builds its `.gm-style` layer right away; without it by then, it failed. */
const MAP_DOM_TIMEOUT_MS = 3000;

function cameraOf(map: google.maps.Map): Camera | null {
  const center = map.getCenter();
  const zoom = map.getZoom();
  if (!center || zoom === undefined) return null;
  return { lat: center.lat(), lon: center.lng(), zoom };
}

export function GoogleSurface({
  mapId,
  initialCamera,
  pins,
  renderPin,
  pinTitle,
  onReady,
  onCamera,
  onPinEnter,
  onPinLeave,
  onPinClick,
  onBackgroundClick,
  hidden,
  onTilesLoaded,
  onFailure,
}: SurfaceProps & {
  mapId: string;
  /** Loaded underneath the plain background until the first tiles arrive. */
  hidden: boolean;
  onTilesLoaded: () => void;
  onFailure: () => void;
}) {
  const map = useMap();
  // Why the camera is moving; reset to "user" when the map settles.
  const cause = useRef<MoveCause>("fit");
  // Markers wait for the first tiles: a rejected key never gets there, and
  // markers added to a map that failed throw when they are removed.
  const [tilesLoaded, setTilesLoaded] = useState(false);

  // A rejected key or a disabled API leaves the map without its own DOM: no
  // div, an error box, or no `.gm-style` layer shortly after it is created.
  // gm_authFailure is not called for every such error, so watch for these.
  useEffect(() => {
    if (!map || tilesLoaded) return;
    const div = map.getDiv() as HTMLElement | undefined;
    if (!div || div.querySelector(".gm-err-container")) {
      onFailure();
      return;
    }
    const observer = new MutationObserver(() => {
      if (div.querySelector(".gm-err-container")) onFailure();
    });
    observer.observe(div, { childList: true, subtree: true });
    const timer = window.setTimeout(() => {
      if (!div.querySelector(".gm-style")) onFailure();
    }, MAP_DOM_TIMEOUT_MS);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
    // onFailure only flips a status flag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, tilesLoaded]);

  useEffect(() => {
    if (!map) return;
    onReady({
      fit: (bounds, fallback, padding) => {
        cause.current = "fit";
        if (bounds) map.fitBounds(bounds, padding);
        else map.moveCamera({ center: { lat: fallback.lat, lng: fallback.lon }, zoom: fallback.zoom });
      },
      panTo: (p) => {
        cause.current = "pan";
        map.panTo({ lat: p.lat, lng: p.lon });
      },
      moveTo: (c) => {
        cause.current = "pan";
        map.moveCamera({ center: { lat: c.lat, lng: c.lon }, zoom: c.zoom });
      },
      zoomBy: (delta) => {
        cause.current = "user";
        map.setZoom(clampZoom((map.getZoom() ?? 13) + delta));
      },
    });
    // onReady is called once per map instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return (
    <Map
      mapId={mapId}
      renderingType={RenderingType.VECTOR}
      gestureHandling="greedy"
      disableDefaultUI
      clickableIcons={false}
      minZoom={MIN_ZOOM}
      maxZoom={MAX_ZOOM}
      defaultCenter={{ lat: initialCamera.lat, lng: initialCamera.lon }}
      defaultZoom={initialCamera.zoom}
      className={hidden ? "invisible absolute inset-0" : "absolute inset-0 bg-canvas"}
      onCameraChanged={(e: MapCameraChangedEvent) =>
        onCamera({ lat: e.detail.center.lat, lon: e.detail.center.lng, zoom: e.detail.zoom }, cause.current, false)
      }
      onDragstart={() => {
        cause.current = "user";
      }}
      onIdle={(e) => {
        const camera = cameraOf(e.map);
        if (camera) onCamera(camera, cause.current, true);
        cause.current = "user";
      }}
      onClick={() => onBackgroundClick()}
      onTilesLoaded={(e) => {
        // A failed map reports tiles too; a working one has its own layer.
        const div = e.map.getDiv() as HTMLElement | undefined;
        if (!div?.querySelector(".gm-style")) return;
        setTilesLoaded(true);
        onTilesLoaded();
      }}
    >
      {(tilesLoaded ? pins : []).map((pin) => (
        <AdvancedMarker
          key={pin.id}
          position={{ lat: pin.lat, lng: pin.lon }}
          zIndex={pin.zIndex}
          anchorLeft="-50%"
          anchorTop="-50%"
          title={pinTitle(pin)}
          onClick={() => onPinClick(pin.id)}
          onMouseEnter={() => onPinEnter(pin.id)}
          onMouseLeave={() => onPinLeave(pin.id)}
        >
          {renderPin(pin)}
        </AdvancedMarker>
      ))}
    </Map>
  );
}
