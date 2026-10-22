"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Spinner } from "@/components/ui/spinner";
import { UnderlineField } from "@/components/ui/underline-field";

import { placesHref, type PlacesQuery } from "./format";

// Search over the advisor's own places (name, city and note), bound to ?q=.
// The URL updates 300 ms after the last keystroke, keeping the city filter.
const DEBOUNCE_MS = 300;

export function PlacesSearch({ query }: { query: Required<PlacesQuery> }) {
  const router = useRouter();
  const [value, setValue] = useState(query.q ?? "");
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function push(next: string) {
    startTransition(() => {
      router.replace(placesHref({ ...query, q: next }), { scroll: false });
    });
  }

  function onValueChange(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => push(next), DEBOUNCE_MS);
  }

  return (
    <div className="flex items-center gap-3">
      <UnderlineField
        type="search"
        value={value}
        onValueChange={onValueChange}
        onClear={() => push("")}
        label="Search your places"
        placeholder="Search your places and notes"
        clearLabel="Clear search"
        className="w-[360px] max-w-full"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            if (timer.current) clearTimeout(timer.current);
            push(value);
          }
        }}
      />
      {pending ? <Spinner size={14} label="Searching your places" /> : null}
    </div>
  );
}
