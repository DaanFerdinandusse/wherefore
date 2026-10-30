import "server-only";

// Barrel for the Unsplash client (server only).

export { firstCoverPhoto, type CoverPhoto } from "./map";
export { findCoverPhoto, markCoverPhotoUsed } from "./search";
