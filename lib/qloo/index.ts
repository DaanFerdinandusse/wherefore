import "server-only";

// Barrel for the recommendation client. Server code imports from here; client
// components that only need the pure helpers (categoryOf, displayScore)
// import "@/lib/qloo/normalize" directly.

export * from "./api";
export { createQlooClient, getQlooClient, qlooGet } from "./client";
export type { GetOptions, GetResult, QlooClient, QlooClientOptions } from "./client";
export * from "./errors";
export * from "./normalize";
export { PARAM_ALLOWLIST, TTL_SECONDS, latLon, point } from "./params";
export type { QlooEndpoint, QlooParams } from "./params";
export type * from "./contracts";
