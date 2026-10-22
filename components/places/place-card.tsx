"use client";

import { useState } from "react";
import { MoreHorizontal, PencilLine, Trash2 } from "lucide-react";

import { BookmarkMark } from "@/components/ui/bookmark-mark";
import { FilmImage } from "@/components/ui/film-image";
import { IconButton } from "@/components/ui/icon-button";
import { Menu, MenuItem } from "@/components/ui/menu";
import { updateNoteAction } from "@/lib/places/actions";
import type { AdvisorPlaceRow } from "@/lib/places/contracts";

import { cleanNote, lastUseLine, quoteNote, tripsLine, typeLine } from "./format";
import { NoteEditor } from "./note-editor";
import { usePlaces } from "./places-provider";

// One saved place on My places: the first provider photo (film grade) with
// the bookmark mark, the type and neighborhood line, the name in Hanken 300,
// the advisor's quoted note, and how it has been used. The menu edits the
// note in place or removes the place (with Undo in the toast).
export function PlaceCard({
  place,
  now,
  onRemove,
  priority = false,
}: {
  place: AdvisorPlaceRow;
  now: Date;
  onRemove: (place: AdvisorPlaceRow) => void;
  priority?: boolean;
}) {
  const { notify } = usePlaces();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  // The note as last saved here, until the refreshed row arrives.
  const [note, setNote] = useState<string | null>(null);
  const shownNote = note ?? place.note;
  const quoted = quoteNote(shownNote);
  const line = typeLine(place);

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
    <article className="flex min-w-0 flex-col gap-3.5" aria-label={place.name}>
      <div className="relative h-50 shrink-0 overflow-hidden rounded-[18px] bg-avatar">
        {place.imageUrl && !imageFailed ? (
          <FilmImage
            onError={() => setImageFailed(true)}
            src={place.imageUrl}
            alt={place.name}
            priority={priority}
            sizes="(min-width: 1440px) 320px, (min-width: 1024px) 30vw, 90vw"
          />
        ) : null}
        <BookmarkMark size={34} label="In your places" className="absolute top-3 right-3" />
      </div>

      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {line ? <p className="label-caps truncate leading-[14px] text-text-2">{line}</p> : null}
          <h3 className="text-card-sm leading-[30px] font-light tracking-[-0.01em] text-ink">{place.name}</h3>
        </div>
        <Menu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          label={`Actions for ${place.name}`}
          align="end"
          panelClassName="w-[272px] p-2!"
          trigger={(props) => (
            <IconButton
              {...props}
              label={`More actions for ${place.name}`}
              icon={<MoreHorizontal size={18} strokeWidth={2} aria-hidden />}
              variant="ghost"
              size={32}
              className="-mr-1.5"
            />
          )}
        >
          <MenuItem
            leading={<PencilLine size={16} strokeWidth={2} aria-hidden className="shrink-0 text-ink" />}
            title={shownNote.trim() ? "Edit note" : "Add a note"}
            onSelect={() => {
              setMenuOpen(false);
              setEditing(true);
            }}
          />
          <MenuItem
            leading={<Trash2 size={16} strokeWidth={2} aria-hidden className="shrink-0 text-ink" />}
            title="Remove from my places"
            onSelect={() => {
              setMenuOpen(false);
              onRemove(place);
            }}
          />
        </Menu>
      </div>

      {editing ? (
        <NoteEditor
          initialNote={shownNote}
          placeName={place.name}
          saving={saving}
          onSave={saveNote}
          onCancel={() => setEditing(false)}
        />
      ) : quoted ? (
        <p className="text-body leading-[21px] text-text-4">{quoted}</p>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="self-start text-body leading-[21px] text-text-muted underline decoration-rule-strong underline-offset-4 hover:text-ink hover:decoration-ink"
        >
          Add a private note
        </button>
      )}

      <div className="mt-auto flex items-baseline justify-between gap-3 border-t border-rule pt-2.5">
        <span className="text-ui-sm font-medium text-ink">{tripsLine(place.inTrips)}</span>
        <span className="truncate text-ui-sm text-text-2">{lastUseLine(place, now)}</span>
      </div>
    </article>
  );
}
