import { cn } from "@/lib/ui/cn";

import { CalendarIcon, StatusIcon } from "./icons";
import type { CardStatus } from "./status";

// The meta row of a card or list row: the dates with a calendar glyph, then
// the status line with its own glyph. Each piece is one fact.

export function DatesMeta({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-ui-sm text-text-2", className)}>
      <CalendarIcon size={14} className="shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}

const iconTone: Record<CardStatus["tone"], string> = {
  plain: "text-text-2",
  strong: "text-ink",
  accent: "text-ochre",
  warning: "text-amber",
};

const textTone: Record<CardStatus["tone"], string> = {
  plain: "text-text-2",
  strong: "font-semibold text-ink",
  accent: "font-semibold text-amber",
  warning: "font-semibold text-amber",
};

export function StatusMeta({ status, className }: { status: CardStatus; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-ui-sm", textTone[status.tone], className)}>
      <StatusIcon
        name={status.icon}
        size={14}
        className={cn("shrink-0", status.icon === "pin" ? "text-green" : iconTone[status.tone])}
      />
      <span className="truncate">{status.text}</span>
    </span>
  );
}
