import { Pill } from "@/components/ui/pill";
import { Spinner } from "@/components/ui/spinner";
import type { TasteTag } from "@/lib/contracts";

// "Top taste tags" (or "Their taste so far" with fewer than three matched
// places) as outline pills. Recomputed from the matched favorites.

const SHOWN = 8;
const SO_FAR_BELOW = 3;

export function TasteTags({ tags, matched, updating }: { tags: TasteTag[]; matched: number; updating: boolean }) {
  const title = matched < SO_FAR_BELOW ? "Their taste so far" : "Top taste tags";
  return (
    <section aria-labelledby="taste-tags" className="flex flex-col gap-2.5">
      <h3 id="taste-tags" className="label-caps flex items-center gap-2 leading-4 text-text-muted">
        {title}
        {updating ? <Spinner size={11} label="Updating taste tags" /> : null}
      </h3>
      {tags.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {tags.slice(0, SHOWN).map((tag) => (
            <li key={tag.tagId}>
              <Pill className="h-[31px]! font-semibold!">{tag.name}</Pill>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ui text-text-muted">
          {matched === 0 ? "Tags appear once a place they love is matched." : updating ? "Reading their places" : "No tags yet."}
        </p>
      )}
    </section>
  );
}
