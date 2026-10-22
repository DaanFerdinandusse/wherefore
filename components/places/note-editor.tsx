"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";

import { NOTE_MAX_LENGTH } from "./format";

// Edit a private note in place: a textarea with Save and Cancel. Cmd or Ctrl
// plus Enter saves, Escape cancels. Used on My places cards; the place
// profile's "Your pick" block can reuse it.
export function NoteEditor({
  initialNote,
  placeName,
  saving = false,
  onSave,
  onCancel,
  className,
}: {
  initialNote: string;
  placeName: string;
  saving?: boolean;
  onSave: (note: string) => void;
  onCancel: () => void;
  className?: string;
}) {
  const [note, setNote] = useState(initialNote);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const field = ref.current;
    if (!field) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }, []);

  return (
    <form
      className={cn("flex flex-col gap-2.5", className)}
      onSubmit={(event) => {
        event.preventDefault();
        onSave(note);
      }}
    >
      <textarea
        ref={ref}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          }
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            onSave(note);
          }
        }}
        aria-label={`Your note on ${placeName}`}
        placeholder="Ask for the corner table"
        maxLength={NOTE_MAX_LENGTH}
        rows={3}
        className="w-full resize-none rounded-row border border-pill-outline bg-surface-raised px-3.5 py-3 text-body leading-[21px] text-ink placeholder:text-text-muted focus-visible:border-glow focus-visible:outline-none"
      />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" loading={saving}>
          Save note
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
