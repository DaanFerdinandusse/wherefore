import type { Metadata } from "next";

import { MapLab } from "./map-lab";

// Dev page for the Discover map: TripMap over a Lisbon fixture with buttons
// for every state (highlight, select, ask tab, placeholder, plain background),
// to compare with Paper 02b, F8 and F7b.
export const metadata: Metadata = {
  title: "Map lab · Tastebrief",
  robots: { index: false, follow: false },
};

export default function MapLabPage() {
  return <MapLab />;
}
