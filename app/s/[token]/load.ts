import "server-only";

import { cache } from "react";

import { getSharedTripView } from "@/lib/trips";

/** The shared view by token, read once per request for the page, its metadata and its image. */
export const loadSharedTripView = cache(getSharedTripView);
