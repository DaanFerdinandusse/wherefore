"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Spinner } from "@/components/ui/spinner";
import { UnderlineField } from "@/components/ui/underline-field";

// The Clients page search. Typing waits for a pause, then replaces ?q= in the
// URL; the server re-renders the list through listClients(owner, { q }).
// The input keeps its own value, so the round trip never eats keystrokes.

const DEBOUNCE_MS = 300;

export function ClientsSearch({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initialQuery);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function commit(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    const q = next.trim();
    if (q) params.set("q", q);
    else params.delete("q");
    params.delete("all");
    const search = params.toString();
    startTransition(() => {
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
    });
  }

  function onValueChange(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(next), DEBOUNCE_MS);
  }

  return (
    <UnderlineField
      value={value}
      onValueChange={onValueChange}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          if (timer.current) clearTimeout(timer.current);
          commit(value);
        } else if (event.key === "Escape" && value) {
          onValueChange("");
        }
      }}
      label="Search clients"
      placeholder="Search clients"
      clearLabel="Clear search"
      type="search"
      autoComplete="off"
      icon={pending ? <Spinner size={16} /> : undefined}
      className="w-[200px] py-[7px]!"
    />
  );
}
