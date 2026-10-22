import { X } from "lucide-react";

import { BookmarkMark } from "@/components/ui/bookmark-mark";
import { Button } from "@/components/ui/button";
import { FilmImage } from "@/components/ui/film-image";
import { IconButton } from "@/components/ui/icon-button";
import { YourNoteRow } from "@/components/ui/your-note-row";
import type { TripPlaceCard } from "@/lib/contracts";
import { becauseLine, typeLine } from "@/lib/map/label";
import { cn } from "@/lib/ui/cn";

// The map preview card for the selected pin (02b, F8): photo with a close
// button, type line, score, name, why it fits, the advisor's note, and the
// action that opens the full profile. Clicking the card body opens it too.
export function MapPreviewCard({
  card,
  clientName,
  onOpen,
  onClose,
  className,
}: {
  card: TripPlaceCard;
  clientName: string;
  onOpen: () => void;
  onClose: () => void;
  className?: string;
}) {
  const type = typeLine(card);
  const because = becauseLine(card, clientName);
  const note = card.yourPlace?.note.trim();

  return (
    <article
      aria-label={`${card.name} preview`}
      onClick={onOpen}
      className={cn(
        "flex w-[320px] cursor-pointer flex-col overflow-hidden rounded-card border border-rule-strong bg-surface shadow-menu rise-in",
        className,
      )}
    >
      <div className="relative flex h-[116px] shrink-0 justify-end bg-avatar p-3">
        {card.imageUrl ? <FilmImage src={card.imageUrl} alt="" sizes="320px" unoptimized /> : null}
        <IconButton
          label="Close preview"
          variant="glass"
          size={32}
          icon={<X size={14} strokeWidth={2} />}
          className="relative"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        />
      </div>

      <div className="flex flex-col gap-3 px-5 pt-[18px] pb-5">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-3">
            <span className="label-caps text-text-2">{type}</span>
            {typeof card.score === "number" ? (
              <span className="flex items-baseline gap-[5px]">
                <span className="font-display text-card-sm text-ink">{card.score}</span>
                <span className="label-caps text-text-2">Match</span>
              </span>
            ) : null}
          </div>
          <h3 className="text-card-md font-light tracking-[-0.01em] text-ink">{card.name}</h3>
        </div>

        {because || card.yourPlace ? (
          <div className="flex flex-col gap-3 border-t border-rule-strong pt-3">
            {because ? <p className="text-ui leading-[19px] text-ink">{because}</p> : null}
            {card.yourPlace ? (
              note ? (
                <YourNoteRow note={note} label="Your place. Your note" tone="surface" />
              ) : (
                <p className="flex items-center gap-2.5 text-ui text-ink">
                  <BookmarkMark size={26} />
                  Your place
                </p>
              )
            ) : null}
          </div>
        ) : null}

        <Button
          className="w-full"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          Open profile
        </Button>
      </div>
    </article>
  );
}
