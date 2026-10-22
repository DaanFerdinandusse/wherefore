"use client";

import { useId, useState } from "react";

import { updateClientFieldsAction } from "@/lib/clients/actions";

import { useAutosave } from "./use-autosave";
import type { Report } from "./use-save-tracker";

// The advisor's private notes on the client: a plain textarea, saved as you type.

const NOTES_DEBOUNCE_MS = 800;

export function NotesField({ clientId, initialNotes, report }: { clientId: string | null; initialNotes: string; report: Report }) {
  const id = useId();
  const [notes, setNotes] = useState(initialNotes);

  const saver = useAutosave<{ notes: string }>(
    async (patch) => {
      if (!clientId) return { ok: false, error: "Add a name first." };
      return updateClientFieldsAction(clientId, patch);
    },
    { delayMs: NOTES_DEBOUNCE_MS, onStatus: (status) => report("notes", status) },
  );

  return (
    <section className="flex flex-col gap-2.5">
      <label htmlFor={id} className="label-caps leading-4 text-text-muted">
        Notes
      </label>
      <textarea
        id={id}
        value={notes}
        disabled={!clientId}
        maxLength={5000}
        rows={4}
        placeholder={clientId ? "Who they travel with, what they said last time, what to avoid." : "Add a name first."}
        onChange={(event) => {
          setNotes(event.target.value);
          saver.schedule({ notes: event.target.value });
        }}
        onBlur={() => void saver.flush()}
        className="min-h-[112px] resize-y rounded-[22px] border border-transparent bg-surface px-5 py-4 text-body leading-[22px] text-ink placeholder:text-text-muted hover:border-rule-strong focus-visible:border-ink focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      />
    </section>
  );
}
