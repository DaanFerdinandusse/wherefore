import type { PlaceVerdict } from "@/lib/contracts";

/** The agent's line on a place: what suits the client highlighted, then the rest. */
export function VerdictLine({
  verdict,
  className,
  quiet = false,
}: {
  verdict: Pick<PlaceVerdict, "good" | "rest">;
  className?: string;
  /** A rejected place: nothing about it is highlighted. */
  quiet?: boolean;
}) {
  return (
    <span className={className}>
      <strong className={quiet ? "font-medium" : "font-semibold text-amber"}>{verdict.good}</strong>
      {verdict.rest ? ` ${verdict.rest}` : null}
    </span>
  );
}
