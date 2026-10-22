import { Check, Pencil } from "lucide-react";

import { Spinner } from "@/components/ui/spinner";

import type { ProfileSaveState } from "./use-save-tracker";

// The quiet save line next to "New trip for Ana": "Click any field to edit"
// at rest, "Saved as you type" while editing, "Saving", "Saved", or the
// error that names the problem.
export function SaveStatus({ state, editing }: { state: ProfileSaveState; editing: boolean }) {
  const content =
    state.kind === "error" ? (
      <span className="text-amber">{state.message}</span>
    ) : state.kind === "saving" ? (
      <>
        <Spinner size={14} />
        <span>Saving</span>
      </>
    ) : state.kind === "saved" && !editing ? (
      <>
        <Check size={14} strokeWidth={2} aria-hidden />
        <span>Saved</span>
      </>
    ) : editing || state.kind === "saved" ? (
      <>
        <Check size={14} strokeWidth={2} aria-hidden />
        <span>Saved as you type</span>
      </>
    ) : (
      <>
        <Pencil size={14} strokeWidth={1.6} aria-hidden />
        <span>Click any field to edit</span>
      </>
    );

  return (
    <p role="status" aria-live="polite" className="flex max-w-[360px] items-center gap-2 px-3 text-ui font-medium text-text-4">
      {content}
    </p>
  );
}
