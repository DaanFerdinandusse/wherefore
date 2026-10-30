import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, Hanken_Grotesk } from "next/font/google";

import { optionalEnv } from "@/lib/env";

import "./globals.css";

const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-bodoni",
  display: "swap",
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-hanken",
  display: "swap",
});

const DESCRIPTION = "Itineraries built from what your client already loves. Every place comes with the reason it was picked.";

export const metadata: Metadata = {
  metadataBase: new URL(optionalEnv("APP_URL") ?? "https://wherefore-travel.vercel.app"),
  title: "Wherefore",
  applicationName: "Wherefore",
  description: DESCRIPTION,
  openGraph: { title: "Wherefore", description: DESCRIPTION, type: "website", siteName: "Wherefore", locale: "en_US" },
  twitter: { card: "summary_large_image", title: "Wherefore", description: DESCRIPTION },
};

// The surface token in app/globals.css, for the browser's own chrome.
export const viewport: Viewport = { themeColor: "#f1ede6" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bodoni.variable} ${hanken.variable}`}>
      <body>{children}</body>
    </html>
  );
}
