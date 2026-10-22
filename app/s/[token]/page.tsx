import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { shareDescription, TravelerView } from "@/components/trip/traveler-view";

import { loadSharedTripView } from "./load";

// /s/[token]: the itinerary a traveler opens from the advisor's link. Public
// (outside the auth matcher), never indexed, rendered on the server from the
// shared view only, so nothing advisor-private can reach it. An unknown or
// revoked token renders the not-found page next to this file. loading.tsx
// is the Suspense boundary Cache Components asks for around the token read.

type Props = { params: Promise<{ token: string }> };

const NOT_INDEXED: Metadata["robots"] = { index: false, follow: false, googleBot: { index: false, follow: false } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const view = await loadSharedTripView(token);
  if (!view) return { title: "Link not active · Tastebrief", robots: NOT_INDEXED };
  const title = view.title;
  const description = shareDescription(view);
  return {
    title: `${title} · Tastebrief`,
    description,
    robots: NOT_INDEXED,
    referrer: "no-referrer",
    openGraph: { title, description, type: "website", siteName: "Tastebrief" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharedTripPage({ params }: Props) {
  const { token } = await params;
  const view = await loadSharedTripView(token);
  if (!view) notFound();
  return <TravelerView view={view} embedded={false} />;
}
