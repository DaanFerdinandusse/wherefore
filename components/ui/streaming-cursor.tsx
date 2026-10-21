import { cn } from "@/lib/ui/cn";

// The caret at the end of text that is still streaming in. A 2 x 18 ink bar
// that sits on the text baseline. It does not blink: nothing animates except
// the rise-in of new places.
export function StreamingCursor({ className }: { className?: string }) {
  return <span aria-hidden className={cn("ml-0.5 inline-block h-[18px] w-0.5 translate-y-[3px] bg-ink", className)} />;
}
