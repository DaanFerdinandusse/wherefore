import { StarburstOrnament } from "@/components/ui/starburst-ornament";

// An unknown or revoked share link. The two read the same on purpose, so a
// token cannot be probed.
export default function SharedTripNotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-surface px-4 text-center">
      <StarburstOrnament size={44} />
      <h1 className="font-display text-section text-ink md:text-title">This link is not active</h1>
      <p className="max-w-[420px] text-body-lg text-text-2">
        Your advisor may have stopped sharing this itinerary or sent you a newer link. Ask them for the latest one.
      </p>
      <p className="font-display text-wordmark text-ink">Tastebrief</p>
    </main>
  );
}
