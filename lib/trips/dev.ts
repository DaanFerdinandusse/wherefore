// Trips made by the development fixtures (the chat lab, the e2e seed trip)
// carry a "Dev: " title prefix. The Trips overview and the trip switcher
// leave them out; in development they show in a small "Dev" group at the
// bottom, in production never. Pure, so pages and tests share one rule.

export const DEV_TRIP_PREFIX = "Dev: ";

/** "Dev: Lisbon for Ana (chat lab)". */
export function devTripTitle(title: string): string {
  return isDevTripTitle(title) ? title : `${DEV_TRIP_PREFIX}${title}`;
}

export function isDevTripTitle(title: string): boolean {
  return title.startsWith(DEV_TRIP_PREFIX);
}

/** True outside production: only then are dev trips listed at all. */
export function showDevTrips(env: string | undefined = process.env.NODE_ENV): boolean {
  return env !== "production";
}
