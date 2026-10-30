import type { MetadataRoute } from "next";

// The surface and ink tokens in app/globals.css. The tiles are full-bleed with
// the mark inside the safe zone, so the same file serves as the maskable icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wherefore",
    short_name: "Wherefore",
    description: "Itineraries built from what your client already loves.",
    start_url: "/",
    display: "standalone",
    background_color: "#f1ede6",
    theme_color: "#f1ede6",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
