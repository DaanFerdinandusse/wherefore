import { cn } from "@/lib/ui/cn";

import { BookmarkMark } from "./bookmark-mark";

// The advisor's own note on a place: the bookmark mark and the quoted note.
// `photo` is white type on a card photo; `surface` is ink type on the map
// preview card. The note is the advisor's text, quoted as written.
export function YourNoteRow({
  note,
  label = "Your note",
  tone = "photo",
  className,
}: {
  note: string;
  /** Text before the quote: "Your note", or "Your place. Your note" on the map card. */
  label?: string;
  tone?: "photo" | "surface";
  className?: string;
}) {
  return (
    <p className={cn("flex gap-2.5 text-ui", tone === "photo" ? "items-center text-white" : "items-start leading-[19px] text-ink", className)}>
      <BookmarkMark size={26} tone={tone === "photo" ? "surface" : "ink"} />
      <span className={tone === "surface" ? "pt-[3px]" : undefined}>
        {label}: {"“"}
        {note}
        {"”"}
      </span>
    </p>
  );
}
