"use client";

import Image from "next/image";
import { useState } from "react";
import { Plus, X } from "lucide-react";

import { MEDIA_KIND_LABEL, type MediaKind } from "@/lib/clients/candidates";
import type { MediaFavorite } from "@/lib/contracts";

import { EntityCombobox } from "./entity-combobox";
import { useEntitySearch, type TypedCandidate } from "./use-entity-search";

// "Also into": artists and films the client loves, as chips with a photo and
// the kind. "+ Add" opens a search over artists and films together.

const MEDIA_TYPES = ["artist", "movie"] as const;

function kindOf(candidate: TypedCandidate): MediaKind {
  return candidate.type === "movie" ? "movie" : "artist";
}

export function AlsoInto({
  media,
  disabled,
  onAdd,
  onRemove,
}: {
  media: MediaFavorite[];
  disabled: boolean;
  onAdd: (candidate: TypedCandidate, kind: MediaKind, query: string) => void;
  onRemove: (index: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const { results, state } = useEntitySearch(editing ? query : "", { types: MEDIA_TYPES, near: null, take: 4 });

  function close() {
    setEditing(false);
    setQuery("");
  }

  return (
    <section aria-labelledby="also-into" className="flex flex-col gap-2.5">
      <h3 id="also-into" className="label-caps leading-4 text-text-muted">
        Also into
      </h3>
      <ul className="relative flex flex-wrap items-center gap-2">
        {media.map((item, index) => (
          <li
            key={`${item.entityId ?? item.query}-${index}`}
            className="group flex h-[38px] items-center gap-2 rounded-pill border border-pill-outline py-1 pr-1.5 pl-1"
          >
            <span className="relative size-7 shrink-0 overflow-hidden rounded-pill bg-avatar">
              {item.imageUrl ? <Image src={item.imageUrl} alt="" fill sizes="28px" className="film object-cover" /> : null}
            </span>
            <span className="text-ui font-medium text-ink">{item.name ?? item.query}</span>
            <span className="text-meta text-text-muted">{MEDIA_KIND_LABEL[item.kind]}</span>
            <button
              type="button"
              aria-label={`Remove ${item.name ?? item.query}`}
              onClick={() => onRemove(index)}
              className="inline-flex size-6 items-center justify-center rounded-pill text-text-muted transition-colors hover:bg-ink/5 hover:text-ink"
            >
              <X size={12} strokeWidth={2.2} aria-hidden />
            </button>
          </li>
        ))}
        <li className="flex">
          {editing ? (
            <EntityCombobox
              value={query}
              onValueChange={setQuery}
              label="Add an artist or film"
              placeholder="Artist or film"
              results={results}
              state={state}
              meta={(candidate) => MEDIA_KIND_LABEL[kindOf(candidate)]}
              onPick={(candidate) => {
                onAdd(candidate, kindOf(candidate), query);
                close();
              }}
              onCancel={close}
              icon={null}
              fieldClassName="w-[220px] py-1.5!"
              dropdownClassName="top-full left-0 w-[390px] max-w-[calc(100vw-32px)]"
            />
          ) : (
            <button
              type="button"
              disabled={disabled}
              title={disabled ? "Add a name first" : undefined}
              onClick={() => setEditing(true)}
              className="inline-flex h-[30px] items-center gap-1 rounded-pill border border-pill-outline px-3 text-ui-sm font-medium text-ink transition-colors hover:border-ink hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={12} strokeWidth={2.4} aria-hidden />
              {media.length === 0 ? "Add an artist or film" : "Add"}
            </button>
          )}
        </li>
      </ul>
    </section>
  );
}
