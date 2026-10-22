"use client";

import { useCallback, useEffect, useState } from "react";

import type { DetailsTier, GooglePlaceDetails } from "@/lib/google/contracts";
import type { TripPlaceProfile } from "@/lib/trips/profile-types";

// The sheet's two fetches. The profile (our own rows) loads when the sheet
// opens; Google details load through /api/places/<placeId>/google, `basic`
// when the sheet opens and `full` only once the caller asks for it (the Hours
// section scrolled into view). Google answers live in memory only. A missing
// Google key, a place without a Google id or any Google failure leaves the
// details empty: the sheet then shows the provider data alone, without an error.

type Keyed<T> = { key: string; value: T };

export function useTripPlaceProfile(open: boolean, tripPlaceId: string, initial?: TripPlaceProfile) {
  const [loaded, setLoaded] = useState<Keyed<TripPlaceProfile> | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const seeded = initial && initial.card.tripPlaceId === tripPlaceId ? initial : null;

  useEffect(() => {
    if (!open || (seeded && version === 0)) return;
    const controller = new AbortController();
    fetch(`/api/trip-places/${encodeURIComponent(tripPlaceId)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const value = (await response.json()) as TripPlaceProfile;
        setLoaded({ key: tripPlaceId, value });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.warn("[place-profile] profile did not load", error);
        setFailed(tripPlaceId);
      });
    return () => controller.abort();
  }, [open, tripPlaceId, seeded, version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const profile = loaded?.key === tripPlaceId ? loaded.value : seeded;
  return { profile, failed: failed === tripPlaceId && !profile, refresh };
}

export function useGoogleDetails(placeId: string | null, hasGoogle: boolean, open: boolean, wantFull: boolean) {
  const [basic, setBasic] = useState<Keyed<GooglePlaceDetails> | null>(null);
  const [full, setFull] = useState<Keyed<GooglePlaceDetails> | null>(null);

  useEffect(() => {
    if (!open || !placeId || !hasGoogle) return;
    return load(placeId, "basic", (value) => setBasic({ key: placeId, value }));
  }, [open, placeId, hasGoogle]);

  useEffect(() => {
    if (!open || !placeId || !hasGoogle || !wantFull) return;
    return load(placeId, "full", (value) => setFull({ key: placeId, value }));
  }, [open, placeId, hasGoogle, wantFull]);

  const fullValue = full?.key === placeId ? full.value : null;
  const basicValue = basic?.key === placeId ? basic.value : null;
  return { details: fullValue ?? basicValue, full: fullValue };
}

function load(placeId: string, tier: DetailsTier, done: (value: GooglePlaceDetails) => void): () => void {
  const controller = new AbortController();
  fetch(`/api/places/${encodeURIComponent(placeId)}/google?tier=${tier}`, { signal: controller.signal })
    .then(async (response) => {
      // 503 without a key, 404 without a Google listing: provider data only.
      if (!response.ok) return;
      done((await response.json()) as GooglePlaceDetails);
    })
    .catch(() => {});
  return () => controller.abort();
}
