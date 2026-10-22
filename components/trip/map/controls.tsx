import { ArrowUp, MapMinus, Minus, Plus, Search } from "lucide-react";

import type { OffscreenDirection } from "@/lib/map/geo";
import { cn } from "@/lib/ui/cn";

// Controls that float over the Discover map: our own zoom buttons, "Search
// this area", the edge chip toward an off-screen place, and the notice shown
// while the map cannot load. All frosted (`glass-control`) as in Paper 02b.

export function ZoomControls({
  onZoomIn,
  onZoomOut,
  className,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  className?: string;
}) {
  const button = "flex h-[38px] w-9 items-center justify-center text-ink transition-colors hover:bg-ink/5";
  return (
    <div className={cn("glass-control flex flex-col overflow-hidden rounded-pill border border-rule-strong", className)}>
      <button type="button" aria-label="Zoom in" title="Zoom in" onClick={onZoomIn} className={button}>
        <Plus size={14} strokeWidth={2} />
      </button>
      <button type="button" aria-label="Zoom out" title="Zoom out" onClick={onZoomOut} className={cn(button, "border-t border-rule")}>
        <Minus size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

export function SearchAreaButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "glass-control inline-flex items-center gap-2 rounded-pill border border-rule-strong px-4 py-2.5 text-ui font-medium text-ink transition-colors hover:bg-surface rise-in",
        className,
      )}
    >
      <Search size={14} strokeWidth={2} />
      Search this area
    </button>
  );
}

/**
 * The chip on the map edge toward a highlighted or selected place that is out
 * of view: its day number or score, an arrow pointing at it, its name.
 * Direction only, never a distance.
 */
export function OffscreenChip({
  name,
  badge,
  direction,
  area,
  onClick,
}: {
  name: string;
  badge?: number;
  direction: OffscreenDirection;
  /** The inset area the chip sits on the edge of. */
  area: { left: number; top: number; right: number; bottom: number };
  onClick: () => void;
}) {
  // Keep the chip inside the area: pull it in from whichever edge it touches.
  const edge = (v: number, start: number, end: number) =>
    Math.abs(v - start) < 1 ? "0%" : Math.abs(v - end) < 1 ? "-100%" : "-50%";
  const tx = edge(direction.x, area.left, area.right);
  const ty = edge(direction.y, area.top, area.bottom);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Show ${name}, ${direction.compass} of this view`}
      style={{ left: direction.x, top: direction.y, transform: `translate(${tx}, ${ty})` }}
      className="absolute z-20 inline-flex items-center gap-1.5 rounded-pill border border-rule-strong bg-surface/92 py-1 pr-2.5 pl-1 text-ui-sm leading-4 font-medium whitespace-nowrap text-ink shadow-pin transition-colors hover:bg-surface"
    >
      {badge !== undefined ? (
        <span className="inline-flex size-6 items-center justify-center rounded-pill bg-ink text-meta leading-[14px] font-semibold text-surface">
          {badge}
        </span>
      ) : null}
      <ArrowUp size={12} strokeWidth={2} style={{ transform: `rotate(${Math.round(direction.angle)}deg)` }} />
      {name}
    </button>
  );
}

/** Shown when the map cannot load: pins stay usable on the plain background. */
export function MapUnavailableNotice({ className }: { className?: string }) {
  return (
    <p
      role="status"
      title="Places are drawn in their real positions on a plain background until the map loads."
      className={cn(
        "glass-control inline-flex items-center gap-2 rounded-pill border border-rule-strong py-2 pr-4 pl-3 text-ui-sm text-text-2",
        className,
      )}
    >
      <MapMinus size={14} strokeWidth={2} className="text-ink" />
      <span>
        <span className="font-semibold text-ink">Map is not available yet.</span> Places are shown in their real positions.
      </span>
    </p>
  );
}
