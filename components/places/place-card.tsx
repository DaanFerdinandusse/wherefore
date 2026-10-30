"use client";

import { useState, type ComponentType } from "react";
import { BedDouble, Coffee, Landmark, MapPin, Martini, PencilLine, Store, Utensils, type LucideProps } from "lucide-react";

import { BookmarkGlyph } from "@/components/ui/bookmark-mark";
import { FilmImage } from "@/components/ui/film-image";
import type { Category } from "@/lib/contracts";
import { updateNoteAction } from "@/lib/places/actions";
import type { AdvisorPlaceRow } from "@/lib/places/contracts";
import { cn } from "@/lib/ui/cn";

import { cleanNote, lastUseLine, noteText, placeTypeLabel, tripsLine } from "./format";
import { NoteEditor } from "./note-editor";
import { usePlaces } from "./places-provider";
import { ScorePill } from "./scores";

// One saved place on My places (H4): the provider photo with the saved
// bookmark (click to remove, with Undo), the type and neighborhood, the name
// in Bodoni with the client's score, the advisor's note as an italic quote
// (click to edit), and how the place has been used.

const CATEGORY_ICON: Record<Category, ComponentType<LucideProps>> = {
  stay: BedDouble,
  eat: Utensils,
  drink: Martini,
  coffee: Coffee,
  see: Landmark,
  other: Store,
};

export function PlaceCard({
  place,
  now,
  onRemove,
  priority = false,
  className,
}: {
  place: AdvisorPlaceRow;
  now: Date;
  onRemove: (place: AdvisorPlaceRow) => void;
  priority?: boolean;
  className?: string;
}) {
  const { notify } = usePlaces();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  // The note as last saved here, until the refreshed row arrives.
  const [note, setNote] = useState<string | null>(null);
  const shownNote = note ?? place.note;
  const text = noteText(shownNote);
  const type = placeTypeLabel(place.primaryType);
  const neighborhood = place.neighborhood?.trim() || null;
  const TypeIcon = CATEGORY_ICON[place.category];

  async function saveNote(next: string) {
    const clean = cleanNote(next);
    if (clean === shownNote.trim()) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const result = await updateNoteAction({ id: place.id, note: clean });
    setSaving(false);
    if (!result.ok) {
      notify(result.error);
      return;
    }
    setNote(result.note);
    setEditing(false);
    notify(`Note saved for ${place.name}`);
  }

  return (
    <article
      aria-label={place.name}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-[18px] bg-surface-raised shadow-[0_1px_3px_rgb(22_19_15/0.06),0_0_0_1px_rgb(22_19_15/0.04)]",
        className,
      )}
    >
      <div className="relative aspect-[3/2] shrink-0 bg-avatar">
        {place.imageUrl ? (
          <FilmImage
            src={place.imageUrl}
            alt={place.name}
            priority={priority}
            sizes="(min-width: 1280px) 330px, (min-width: 1024px) 30vw, 90vw"
            className="object-cover"
          />
        ) : null}
        <button
          type="button"
          onClick={() => onRemove(place)}
          aria-label={`Remove ${place.name} from my places`}
          title="Saved. Click to remove from your places."
          className="absolute top-2.5 right-2.5 flex size-7.5 items-center justify-center rounded-pill bg-ink/70 text-surface-raised transition-colors hover:bg-ink"
        >
          <BookmarkGlyph size={12} />
        </button>
      </div>

      <div className="flex grow flex-col gap-2 px-3.5 pt-3 pb-3.5">
        {type || neighborhood ? (
          <p className="flex min-w-0 items-center gap-3.5 text-ui-sm font-medium text-text-2">
            {type ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <TypeIcon size={14} strokeWidth={2} aria-hidden className="shrink-0" />
                <span className="truncate">{type}</span>
              </span>
            ) : null}
            {neighborhood ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <MapPin size={14} strokeWidth={2} aria-hidden className="shrink-0" />
                <span className="truncate">{neighborhood}</span>
              </span>
            ) : null}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <h3 className="min-w-0 font-display text-card-xs tracking-[-0.02em] text-ink">{place.name}</h3>
          <ScorePill entityId={place.entityId} />
        </div>

        {editing ? (
          <NoteEditor
            initialNote={shownNote}
            placeName={place.name}
            saving={saving}
            onSave={saveNote}
            onCancel={() => setEditing(false)}
            className="grow"
          />
        ) : text ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Edit your note on ${place.name}: ${text}`}
            className="group flex grow items-start gap-2 rounded-row text-left"
          >
            <span aria-hidden className="shrink-0 font-display text-card-md leading-7 text-amber">
              {"“"}
            </span>
            <span className="min-w-0 flex-1 font-display text-body-lg leading-[22px] tracking-normal text-ink italic">
              {text}
            </span>
            <PencilLine
              size={14}
              strokeWidth={2}
              aria-hidden
              className="mt-1 shrink-0 text-text-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            />
          </button>
        ) : (
          <div className="grow">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-ui-sm text-text-2 underline decoration-rule-strong underline-offset-4 hover:text-ink hover:decoration-ink"
            >
              Add a private note
            </button>
          </div>
        )}

        <div className="flex items-baseline justify-between gap-3 border-t border-ink/8 pt-2">
          <span className="shrink-0 text-meta font-semibold text-ink">{tripsLine(place.inTrips)}</span>
          <span className="truncate text-meta text-text-2">{lastUseLine(place, now)}</span>
        </div>
      </div>
    </article>
  );
}
