import type { ItinerarySlot } from "@/lib/contracts";
import { cn } from "@/lib/ui/cn";

// Notes the agent wrote into a slot. The advisor sees them marked "Agent
// note" in the itinerary view, the rail and the profile's slot picker; they
// never reach the traveler. Rewriting the text makes the note the advisor's,
// and only then can it be shared.

export const AGENT_NOTE_HINT = "Written by the agent; rewrite it to share it";

/** True when the slot holds a note the agent wrote. */
export function isAgentNote(slot: Pick<ItinerarySlot, "note" | "noteSource"> | undefined): boolean {
  return slot?.noteSource === "agent" && slot.note.trim().length > 0;
}

export function AgentNoteLabel({ note, className }: { note?: string; className?: string }) {
  return (
    <span
      title={note}
      className={cn(
        "inline-flex shrink-0 items-center rounded-pill border border-dashed border-pill-outline px-2 py-px text-meta font-medium text-text-2",
        className,
      )}
    >
      Agent note
    </span>
  );
}
