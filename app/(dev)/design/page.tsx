import type { Metadata } from "next";

import { Gallery } from "./gallery";

// Dev gallery: every UI primitive in every state with the copy from the Paper
// designs, so the integrator can compare it with the artboards side by side.
export const metadata: Metadata = {
  title: "Design gallery · Tastebrief",
  robots: { index: false, follow: false },
};

export default function DesignGalleryPage() {
  return <Gallery />;
}
