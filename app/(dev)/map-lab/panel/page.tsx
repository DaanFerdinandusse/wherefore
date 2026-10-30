import type { Metadata } from "next";
import { Suspense } from "react";

import { PanelLab } from "./panel-lab";

// Dev page for the trip panel's map: day tabs and search tabs over the Lisbon
// fixture with seven searches, at the widths the panel can take. The store
// reads the URL, so the page streams in.
export const metadata: Metadata = {
  title: "Map panel lab · Wherefore",
  robots: { index: false, follow: false },
};

export default function MapPanelLabPage() {
  return (
    <Suspense>
      <PanelLab />
    </Suspense>
  );
}
