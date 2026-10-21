import { cn } from "@/lib/ui/cn";

// A small ring that spins while something loads (filter pill of a running
// ask, a loading button). It takes the text color, so it works on ink and on
// light surfaces. Under reduced motion it stays still and still reads as
// "busy" because the ring is open on one side.
export function Spinner({ size = 14, label, className }: { size?: number; label?: string; className?: string }) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ width: size, height: size }}
      className={cn(
        "inline-block shrink-0 rounded-full border-2 border-current/30 border-t-current motion-safe:animate-spin",
        className,
      )}
    />
  );
}
