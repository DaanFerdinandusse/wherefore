"use client";

import { useState } from "react";

import { BookmarkMark } from "@/components/ui/bookmark-mark";
import { Button } from "@/components/ui/button";

import { savedLabel, tripsLabel } from "./profile-format";

// "Your pick": the advisor's own note on a saved place, when it was saved and
// how many trips use it. "Edit note" turns the quote into a field in place.

export function YourPick({
  note,
  savedAt,
  inTrips,
  onSaveNote,
}: {
  note: string;
  savedAt?: string;
  inTrips?: number;
  /** Omitted: the note is read only. */
  onSaveNote?: (note: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = [savedAt ? savedLabel(savedAt) : null, inTrips !== undefined ? tripsLabel(inTrips) : null].filter(
    (part): part is string => Boolean(part),
  );

  async function save() {
    if (!onSaveNote) return;
    setSaving(true);
    setError(null);
    try {
      await onSaveNote(draft.trim());
      setEditing(false);
    } catch {
      setError("The note did not save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="Your pick" className="flex items-start gap-4 rounded-photo border border-ink/28 px-6 py-5">
      <BookmarkMark size={36} />
      <div className="flex min-w-0 grow flex-col gap-1.5">
        <h3 className="label-caps leading-[14px] text-ink">Your pick</h3>
        {editing ? (
          <div className="flex flex-col gap-2.5">
            <label className="sr-only" htmlFor="your-pick-note">
              Your note
            </label>
            <textarea
              id="your-pick-note"
              value={draft}
              autoFocus
              onFocus={(event) => event.currentTarget.setSelectionRange(draft.length, draft.length)}
              rows={3}
              maxLength={2000}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setDraft(note);
                  setEditing(false);
                }
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void save();
              }}
              className="w-full resize-none rounded-row border border-nav-pill bg-surface-raised px-3 py-2 text-body-lg leading-[22px] text-ink focus-visible:border-glow focus-visible:outline-none"
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => void save()} loading={saving}>
                Save note
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft(note);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
            {error ? (
              <p role="alert" className="text-ui-sm text-amber">
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          <>
            {note ? (
              <p className="text-body-lg leading-[22px] text-ink">{`“${note}”`}</p>
            ) : (
              <p className="text-body-lg leading-[22px] text-text-2">No note yet.</p>
            )}
            <p className="text-ui-sm leading-[18px] text-text-2">
              {meta.join(" · ")}
              {onSaveNote ? (
                <>
                  {meta.length > 0 ? " · " : null}
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(note);
                      setEditing(true);
                    }}
                    className="underline-offset-2 hover:text-ink hover:underline"
                  >
                    {note ? "Edit note" : "Add a note"}
                  </button>
                </>
              ) : null}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
