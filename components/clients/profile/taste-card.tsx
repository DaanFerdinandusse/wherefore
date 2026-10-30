import { Heart } from "lucide-react";

import { FilmImage } from "@/components/ui/film-image";
import { Spinner } from "@/components/ui/spinner";
import type { TasteTag } from "@/lib/contracts";

import { plural } from "../format";

// C2 "Ana's taste": the taste tags computed from the places they love, and
// where they come from (the matched favorites' photos and their count).
// "Ana's taste so far" with fewer than three matched places.

const SHOWN_TAGS = 8;
const SHOWN_PHOTOS = 5;
const SO_FAR_BELOW = 3;

export function TasteCard({
  first,
  tags,
  matched,
  photos,
  updating,
}: {
  /** The client's first name. */
  first: string;
  tags: TasteTag[];
  /** Matched favorites, the portrait's inputs. */
  matched: number;
  /** Photos of the matched favorites, in order. */
  photos: string[];
  updating: boolean;
}) {
  return (
    <section aria-labelledby="client-taste" className="flex flex-col gap-[18px] rounded-card bg-amber-wash p-[22px]">
      <h3 id="client-taste" className="flex items-center gap-2.5 text-body-lg leading-5 font-semibold text-ink">
        <Heart size={18} strokeWidth={2} aria-hidden className="shrink-0 text-amber" />
        {matched < SO_FAR_BELOW ? `${first}'s taste so far` : `${first}'s taste`}
        {updating ? <Spinner size={13} label="Updating taste tags" /> : null}
      </h3>

      {tags.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {tags.slice(0, SHOWN_TAGS).map((tag) => (
            <li key={tag.tagId} className="rounded-pill bg-surface-raised px-[13px] py-[7px] text-ui font-medium text-ink">
              {tag.name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ui leading-[19px] text-text-3">
          {matched === 0
            ? `Tags appear once a place ${first} loves is matched.`
            : updating
              ? `Reading ${first}'s places.`
              : "No tags yet."}
        </p>
      )}

      {matched > 0 ? (
        <div className="flex items-center gap-3 border-t border-amber/20 pt-3.5">
          {photos.length > 0 ? (
            <span aria-hidden className="flex shrink-0 gap-0.5">
              {photos.slice(0, SHOWN_PHOTOS).map((url, i) => (
                <span key={`${i}-${url}`} className="relative size-[26px] overflow-hidden rounded-pill border-2 border-amber-wash bg-avatar">
                  <FilmImage src={url} alt="" sizes="26px" />
                </span>
              ))}
            </span>
          ) : null}
          <p className="text-ui leading-[19px] text-text-3">
            From {first}&apos;s {plural(matched, "favorite")}. Add more to sharpen it.
          </p>
        </div>
      ) : null}
    </section>
  );
}
