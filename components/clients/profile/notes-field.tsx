"use client";

import { useId, useState } from "react";
import { Lock } from "lucide-react";

import { updateClientFieldsAction } from "@/lib/clients/actions";

import { useAutosave } from "./use-autosave";
import type { Report } from "./use-save-tracker";

// "Notes for you": the advisor's private notes on the client, a plain
// textarea saved as you type. Never shown to the traveler.

const NOTES_DEBOUNCE_MS = 800;

export function NotesField({ clientId, initialNotes, report }: { clientId: string; initialNotes: string; report: Report }) {
  const id = useId();
  const [notes, setNotes] = useState(initialNotes);

  const saver = useAutosave<{ notes: string }>((patch) => updateClientFieldsAction(clientId, patch), {
    delayMs: NOTES_DEBOUNCE_MS,
    onStatus: (status) => report("notes", status),
  });

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-meta font-semibold tracking-[0.08em] text-text-2 uppercase">
          Notes for you
        </label>
        <span className="flex items-center gap-1.5 text-ui-sm text-text-2">
          <Lock size={13} strokeWidth={2} aria-hidden />
          Only you see this
        </span>
      </div>
      <textarea
        id={id}
        value={notes}
        maxLength={5000}
        placeholder="Who they travel with, what they said last time, what to avoid."
        onChange={(event) => {
          setNotes(event.target.value);
          saver.schedule({ notes: event.target.value });
        }}
        onBlur={() => void saver.flush()}
        className="h-[194px] resize-y rounded-2xl border border-ink/14 bg-surface-raised px-4 py-3.5 text-body-lg leading-[22px] text-ink placeholder:text-text-muted focus-visible:border-ink focus-visible:outline-none"
      />
    </section>
  );
}
