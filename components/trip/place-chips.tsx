import type { TripPlaceCard } from "@/lib/contracts";
import { isLessKnown } from "@/lib/qloo/normalize";

// "Less known" and "Michelin", from the place's facts: nothing to show when
// the fact is unknown, and never the number behind "Less known". Michelin
// names the listing only: stars are often missing, so no star appears here.

type Place = Pick<TripPlaceCard, "popularity" | "michelin">;

export function placeChipLabels(place: Place): string[] {
  return [...(isLessKnown(place.popularity) ? ["Less known"] : []), ...(place.michelin ? ["Michelin"] : [])];
}

const WRAP = {
  /** Sits among the other chips of a card's photo strip. */
  photo: "contents",
  /** Over the photo of a search tile, in the corner the other badges leave free. */
  tile: "absolute top-1.5 right-1.5 flex flex-col items-end gap-1",
};

const CHIP = {
  photo: "inline-flex items-center rounded-pill bg-photo-chip px-2.75 py-1.5 text-ui-sm leading-4 font-semibold text-white",
  tile: "rounded-pill bg-photo-chip px-2 py-0.75 text-meta leading-3.5 font-semibold text-white",
};

/** `row` is a plain line under the name of a compact search row, too narrow for pills. */
export function PlaceChips({ place, variant }: { place: Place; variant: keyof typeof CHIP | "row" }) {
  const labels = placeChipLabels(place);
  if (labels.length === 0) return null;
  if (variant === "row") {
    return (
      <span className="truncate text-meta text-text-2" data-testid="place-chip-label">
        {labels.join(" · ")}
      </span>
    );
  }
  return (
    <span className={WRAP[variant]}>
      {labels.map((label) => (
        <span key={label} className={CHIP[variant]} data-testid="place-chip-label">
          {label}
        </span>
      ))}
    </span>
  );
}
