"use client";

import { Link2, Share } from "lucide-react";

import { Popover } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/ui/cn";

import { displayLink, type ShareLink } from "./use-share-link";

// "Share" in the trip panel header (T3, L2). Before sharing it opens the
// review sheet (the workspace mounts it over the panel). After sharing it
// reads "Shared" and opens the link popover: the link, Copy link and Stop
// sharing. Right after "Share and copy link" the popover opens on its own and
// says the link is copied.

const headerPill =
  "inline-flex h-[34px] items-center gap-[7px] rounded-pill bg-ink/5 pr-3 pl-2.5 text-ui-sm leading-4 font-semibold text-ink transition-colors hover:bg-ink/10";

export function ShareButton({
  link,
  client,
  onReview,
  open,
  onOpenChange,
  justShared,
  movedToShared,
  onCopied,
}: {
  link: ShareLink;
  /** The traveler's first name. */
  client: string;
  /** Opens the review sheet ("Before Ana sees it"). */
  onReview: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The link was just made and copied. */
  justShared: boolean;
  /** The trip moved from Planning to Shared with this share. */
  movedToShared: boolean;
  onCopied: () => void;
}) {
  const url = link.url;
  if (!url) {
    return (
      <button type="button" onClick={onReview} className={headerPill} aria-haspopup="dialog">
        {link.busy ? <Spinner size={14} /> : <Share size={15} strokeWidth={2} aria-hidden />}
        <span className="@max-[520px]:sr-only">Share</span>
      </button>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      label={`Shared with ${client}`}
      align="end"
      panelClassName="w-[340px] max-w-[calc(100vw-32px)] rounded-[18px]! border-0! bg-surface-raised! p-4! shadow-[0_12px_32px_rgb(22_19_15/0.14),0_0_0_1px_rgb(22_19_15/0.06)]!"
      trigger={(props) => (
        <button {...props} type="button" className={headerPill}>
          {link.busy ? <Spinner size={14} /> : <Link2 size={15} strokeWidth={2} aria-hidden />}
          <span className="@max-[520px]:sr-only">Shared</span>
        </button>
      )}
    >
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-0.5">
          <p className="text-action font-semibold text-ink">
            {justShared ? `Shared with ${client}. Link copied.` : `Shared with ${client}`}
          </p>
          <p className="text-ui-sm leading-[18px] text-text-2">
            {justShared && movedToShared ? "The trip moved to Shared. " : ""}
            {justShared ? "Anyone with the link can view it." : "Anyone with this link can view the itinerary."}
          </p>
        </div>
        <p className="flex h-10 items-center gap-2 rounded-[12px] bg-ink/5 px-3">
          <Link2 size={14} strokeWidth={2} aria-hidden className="shrink-0 text-text-2" />
          <span className="sr-only">Traveler link: </span>
          <span className="min-w-0 flex-1 truncate text-ui-sm leading-[18px] text-ink select-all">{displayLink(url)}</span>
        </p>
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={link.busy}
            onClick={async () => {
              if (await link.copy()) onCopied();
            }}
            className="inline-flex h-9 items-center rounded-pill bg-ink px-4 text-ui font-semibold text-surface transition-colors hover:bg-text-4 disabled:opacity-45"
          >
            Copy link
          </button>
          <button
            type="button"
            disabled={link.busy}
            onClick={async () => {
              if (await link.stop()) onOpenChange(false);
            }}
            className={cn(
              "text-ui font-medium text-ink underline decoration-1 underline-offset-[3px] hover:text-text-3 disabled:opacity-45",
            )}
          >
            Stop sharing
          </button>
        </div>
      </div>
    </Popover>
  );
}
