import { cn } from "@/lib/ui/cn";

// The placeholder for a card whose place is still streaming in. Same size and
// radius as PhotoCard so nothing moves when the real card replaces it; the
// copy says what is happening ("Reading why it fits Ana"). Static on purpose:
// the only authored motion is the rise-in of the real card.
export function SkeletonCard({ clientName, className }: { clientName: string; className?: string }) {
  return (
    <div
      role="status"
      aria-label={`Reading why it fits ${clientName}`}
      className={cn("relative overflow-hidden rounded-photo bg-avatar", className)}
    >
      <div aria-hidden className="absolute top-5 left-5 flex w-[280px] max-w-[calc(100%-40px)] flex-col gap-3">
        <span className="h-[30px] w-24 rounded-pill bg-surface/60" />
        <span className="h-24" />
        <span className="h-3 w-[200px] max-w-full rounded-md bg-surface/60" />
        <span className="h-[26px] w-60 max-w-full rounded-lg bg-surface/60" />
        <span className="text-ui-sm font-medium text-text-2">Reading why it fits {clientName}</span>
      </div>
    </div>
  );
}
