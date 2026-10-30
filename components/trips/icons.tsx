import type { SVGProps } from "react";
import { AlertTriangle, Calendar, Check, Eye, EyeOff, Heart, Link2, MapPin, Search } from "lucide-react";

import type { StatusIcon as StatusIconName } from "./status";

// The small glyphs of the Trips page. Most are lucide; three are drawn here
// because the design draws them its own way: the board view, the slot grid
// with one open slot, and the four point sparkle.

type IconProps = { size?: number; className?: string };

function svgProps(size: number, className?: string): SVGProps<SVGSVGElement> {
  return { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true, className, focusable: false };
}

export function BoardIcon({ size = 15, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M4 4h6v16H4zM14 4h6v9h-6z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function ListIcon({ size = 15, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path
        d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SlotsIcon({ size = 14, className }: IconProps) {
  const rect = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <svg {...svgProps(size, className)}>
      <rect x="3" y="3" width="7" height="7" rx="1" {...rect} />
      <rect x="14" y="3" width="7" height="7" rx="1" {...rect} />
      <rect x="3" y="14" width="7" height="7" rx="1" {...rect} />
      <rect x="14" y="14" width="7" height="7" rx="1" {...rect} strokeDasharray="2 2" />
    </svg>
  );
}

export function SparkleIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M12 2c.4 4.6 3.4 7.6 8 8-4.6.4-7.6 3.4-8 8-.4-4.6-3.4-7.6-8-8 4.6-.4 7.6-3.4 8-8z" fill="currentColor" />
    </svg>
  );
}

export function CalendarIcon({ size = 14, className }: IconProps) {
  return <Calendar size={size} strokeWidth={2} aria-hidden className={className} />;
}

/** The glyph in front of a status line. */
export function StatusIcon({ name, size = 14, className }: IconProps & { name: StatusIconName }) {
  const common = { size, strokeWidth: 2, "aria-hidden": true, className } as const;
  switch (name) {
    case "slots":
      return <SlotsIcon size={size} className={className} />;
    case "sparkle":
      return <SparkleIcon size={size} className={className} />;
    case "eye":
      return <Eye {...common} />;
    case "eye-off":
      return <EyeOff {...common} />;
    case "link":
      return <Link2 {...common} />;
    case "pin":
      return <MapPin {...common} />;
    case "heart":
      return <Heart {...common} />;
    case "search":
      return <Search {...common} />;
    case "warning":
      return <AlertTriangle {...common} />;
    case "check":
      return <Check {...common} />;
  }
}
