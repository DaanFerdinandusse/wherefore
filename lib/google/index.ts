import "server-only";

// Barrel for the Google Places client (server only).

export { googleServerKey, isGoogleConfigured } from "./config";
export type * from "./contracts";
export * from "./errors";
export { BASIC_FIELDS, FULL_FIELDS, createPlaceDetails, fieldMask, isPlaceId, placeDetails } from "./places";
export {
  MAX_PHOTO_BYTES,
  MAX_PHOTO_WIDTH,
  PHOTO_PROXY_PATH,
  clampPhotoWidth,
  fetchPhoto,
  fullPhotoWidth,
  isPhotoName,
  photoPlaceId,
  photoProxyUrl,
  tilePhotoWidth,
} from "./photos";
export type { PhotoStream } from "./photos";
