import "server-only";

// Barrel for the Google Places client (server only).

export { googleServerKey, isGoogleConfigured } from "./config";
export type * from "./contracts";
export * from "./errors";
export { BASIC_FIELDS, FULL_FIELDS, createPlaceDetails, fieldMask, isPlaceId, placeDetails } from "./places";
export { PHOTO_PROXY_PATH, clampPhotoWidth, fetchPhoto, isPhotoName, photoProxyUrl } from "./photos";
