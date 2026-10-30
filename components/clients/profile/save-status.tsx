import { Check } from "lucide-react";

import { Spinner } from "@/components/ui/spinner";

import type { ProfileSaveState } from "./use-save-tracker";

// The autosave line in the C2 header: "Saved" at rest (everything on the
// profile saves as you type), "Saving" while a change is in flight, or the
// error that names the problem.
export function SaveStatus({ state }: { state: ProfileSaveState }) {
  return (
    <p role="status" aria-live="polite" className="flex max-w-[360px] items-center gap-2 text-ui text-text-2">
      {state.kind === "error" ? (
        <span className="font-medium text-amber">{state.message}</span>
      ) : state.kind === "saving" ? (
        <>
          <Spinner size={14} />
          <span>Saving</span>
        </>
      ) : (
        <>
          <Check size={16} strokeWidth={2.2} aria-hidden className="text-green" />
          <span>Saved</span>
        </>
      )}
    </p>
  );
}
