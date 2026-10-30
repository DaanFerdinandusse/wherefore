import type { PlaceVerdict } from "@/lib/contracts";

/** The agent's line on a place: what suits the client highlighted, then the rest. */
export function VerdictLine({ verdict, className }: { verdict: Pick<PlaceVerdict, "good" | "rest">; className?: string }) {
  return (
    <span className={className}>
      <strong className="font-semibold text-amber">{verdict.good}</strong>
      {verdict.rest ? ` ${verdict.rest}` : null}
    </span>
  );
}
