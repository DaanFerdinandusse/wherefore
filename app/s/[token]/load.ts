import "server-only";

import { cache } from "react";

import { getSharedTripView } from "@/lib/trips";
import { noteShareOpen } from "@/lib/trips/share-open";

/** The shared view by token, read once per request for the page, its metadata and its image. */
export const loadSharedTripView = cache(async (token: string) => {
  const view = await getSharedTripView(token);
  if (view) await noteShareOpen(token);
  return view;
});
