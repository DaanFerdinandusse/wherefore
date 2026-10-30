import type { CSSProperties } from "react";

import { BookmarkMark } from "@/components/ui/bookmark-mark";
import { FilmImage } from "@/components/ui/film-image";
import { MatchPill } from "@/components/ui/match-pill";
import { ScoreDot } from "@/components/ui/score-dot";
import type { PinLabel as PinLabelText } from "@/lib/map/label";
import { HIGHLIGHT_SCALE, type PinModel } from "@/lib/map/pins";
import { cn } from "@/lib/ui/cn";

// Map pins as plain HTML, so the live map (as AdvancedMarker content) and the
// static fallback render the same thing. Every pin's box is its main disc and
// is anchored at the disc center; chips, the bookmark and the label hang
// outside the box. Sizes and looks from Paper 02b, F8 and F7b.

/** Scales the pin by 1.25 when highlighted: the one authored pin motion. */
function Grow({ highlighted, size, children }: { highlighted: boolean; size: number; children: React.ReactNode }) {
  return (
    <span
      style={{ width: size, height: size }}
      className={cn(
        "relative block transition-transform duration-320 ease-out-expo motion-reduce:transition-none",
        highlighted && "scale-125",
      )}
    >
      {children}
    </span>
  );
}

function PhotoPin({ pin }: { pin: PinModel }) {
  const faded = pin.tone === "faded";
  const glowing = pin.tone === "ask" || pin.highlighted;
  return (
    <Grow highlighted={pin.highlighted} size={pin.size}>
      <span
        className={cn(
          "absolute inset-0 overflow-hidden rounded-pill bg-avatar",
          pin.selected && !glowing ? "border-[3px] border-ink shadow-panel" : null,
          !pin.selected && !glowing && !faded ? "border-[3px] border-surface shadow-pin-photo" : null,
          faded && "border-2 border-surface",
          glowing && "glow-ring border-2 border-surface-raised",
        )}
      >
        {pin.imageUrl ? (
          <FilmImage src={pin.imageUrl} alt="" sizes={`${pin.size}px`} unoptimized />
        ) : (
          <span
            className={cn(
              "flex size-full items-center justify-center font-display leading-none! text-text-2",
              pin.size >= 70 ? "text-card-md" : pin.size >= 56 ? "text-card-sm" : "text-body-lg",
            )}
          >
            {pin.name.trim().charAt(0)}
          </span>
        )}
      </span>
      {faded || pin.score === undefined ? null : pin.selected ? (
        <MatchPill size="sm" score={pin.score} className="absolute top-[calc(100%-8px)] left-1/2 -translate-x-1/2" />
      ) : (
        <span
          className={cn(
            "absolute top-[calc(100%-8px)] left-1/2 inline-flex -translate-x-1/2 rounded-pill px-[9px] py-[3px] text-meta leading-[14px] font-semibold",
            pin.tone === "ask" ? "bg-ink text-surface" : "border border-pill-outline bg-surface text-ink",
          )}
        >
          {pin.score}
        </span>
      )}
      {pin.advisor && !faded ? <BookmarkMark size={24} ring className="absolute -top-1 -right-1.5" /> : null}
    </Grow>
  );
}

function NumberPin({ pin }: { pin: PinModel }) {
  return (
    <Grow highlighted={pin.highlighted} size={pin.size}>
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center rounded-pill border-2 border-surface bg-ink text-meta leading-[14px] font-semibold text-surface",
          pin.tone === "ask" || pin.highlighted ? "glow-ring" : "shadow-pin",
        )}
      >
        {pin.day}
      </span>
      {pin.showName || pin.highlighted || pin.selected ? (
        <span className="absolute top-1/2 left-[calc(100%+6px)] -translate-y-1/2 rounded-pill bg-surface/92 px-2.5 py-1 text-ui-sm leading-4 font-medium whitespace-nowrap text-ink">
          {pin.name}
        </span>
      ) : null}
    </Grow>
  );
}

function DotPin({ pin }: { pin: PinModel }) {
  if (pin.score === undefined) {
    return (
      <span
        style={{ width: pin.size / 2, height: pin.size / 2 }}
        className="block rounded-pill border-2 border-surface bg-ink shadow-pin"
      />
    );
  }
  if (pin.tone === "ask") {
    return (
      <ScoreDot
        score={pin.score}
        highlighted
        className="size-[42px]! border-2! border-surface-raised! bg-ink! text-surface!"
      />
    );
  }
  if (pin.tone === "faded") {
    return <ScoreDot score={pin.score} className="size-[30px]! text-micro!" />;
  }
  return <ScoreDot score={pin.score} />;
}

/** The dark label next to a highlighted pin: "Senhor Uva · 87" over "Your place · because Ana loves Via Carota". */
export function PinLabel({ label, style, className }: { label: PinLabelText; style?: CSSProperties; className?: string }) {
  return (
    <span
      style={style}
      className={cn(
        "pointer-events-none flex max-w-[280px] flex-col gap-0.5 rounded-row bg-ink px-3 py-2 text-left whitespace-nowrap shadow-menu rise-in",
        className,
      )}
    >
      <span className="text-ui font-semibold text-surface">{label.title}</span>
      {label.detail ? <span className="text-meta leading-[15px] text-surface/75">{label.detail}</span> : null}
    </span>
  );
}

/**
 * One pin by its model. The box is the disc; the label, when given, sits to
 * the left of the disc as in F7b and clears the 1.25x growth.
 */
export function PinView({ pin, label }: { pin: PinModel; label?: PinLabelText | null }) {
  const scale = pin.highlighted ? HIGHLIGHT_SCALE : 1;
  return (
    <span
      aria-hidden
      style={{ width: pin.size, height: pin.size }}
      className={cn("relative block", pin.tone === "faded" && "opacity-40")}
    >
      {pin.visual === "photo" ? <PhotoPin pin={pin} /> : pin.visual === "number" ? <NumberPin pin={pin} /> : <DotPin pin={pin} />}
      {label ? (
        <PinLabel
          label={label}
          className="absolute top-1/2 right-full -translate-y-1/2"
          style={{ marginRight: (pin.size * (scale - 1)) / 2 + 12 }}
        />
      ) : null}
    </span>
  );
}

/**
 * A pin on the trip panel's map (G2): the place photo in a light ring with
 * its itinerary day as a small ink badge and the name in a pill under it.
 * The selected pin is larger, wears the amber halo, and its pill carries the
 * match score. The box is the disc, so the pin anchors at the disc center.
 */
export function ItineraryPinView({ pin }: { pin: PinModel }) {
  const size = pin.selected ? 76 : 54;
  return (
    <span aria-hidden style={{ width: size, height: size }} className="relative block">
      <span
        className={cn(
          "absolute inset-0 overflow-hidden rounded-pill border-[3px] border-surface-raised bg-avatar",
          pin.selected
            ? "shadow-[0_0_0_14px_var(--color-glow-halo),0_10px_22px_rgb(22_19_15/0.25)] outline-2 outline-offset-4 outline-glow"
            : pin.highlighted
              ? "glow-ring"
              : "shadow-[0_6px_14px_rgb(22_19_15/0.25)]",
        )}
      >
        {pin.imageUrl ? (
          <FilmImage src={pin.imageUrl} alt="" sizes={`${size}px`} unoptimized />
        ) : (
          <span className="flex size-full items-center justify-center font-display text-card-sm leading-none! text-text-2">
            {pin.name.trim().charAt(0)}
          </span>
        )}
      </span>
      {pin.day !== undefined ? (
        <span className="absolute -top-1.5 -right-2 flex size-[22px] items-center justify-center rounded-pill border-2 border-surface-raised bg-ink text-meta leading-3 font-bold text-white">
          {pin.day}
        </span>
      ) : null}
      <span
        className={cn(
          "absolute top-full left-1/2 flex -translate-x-1/2 items-center gap-[5px] rounded-pill text-ui-sm leading-4 font-semibold whitespace-nowrap text-ink",
          pin.selected
            ? "mt-1.5 bg-why px-[11px] py-[5px] shadow-[0_4px_10px_rgb(22_19_15/0.15)]"
            : "mt-1 bg-surface-raised/97 px-2.5 py-1 shadow-[0_2px_6px_rgb(22_19_15/0.12)]",
        )}
      >
        {pin.selected && typeof pin.score === "number" ? <span className="font-bold text-amber">{Math.round(pin.score)}</span> : null}
        {pin.name}
      </span>
    </span>
  );
}

/** The dashed amber "…" pin that holds a place while ask results arrive (F7b). */
export function PlaceholderPin({ label, className, style }: { label: string; className?: string; style?: CSSProperties }) {
  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      style={style}
      className={cn(
        "flex size-[42px] items-center justify-center rounded-pill border-[1.5px] border-dashed border-glow bg-surface-raised/70 text-meta leading-[14px] font-semibold text-amber shadow-[0_0_14px_4px_var(--color-glow-halo)] rise-in",
        className,
      )}
    >
      <span aria-hidden>…</span>
    </span>
  );
}
