"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { FilterPill } from "@/components/ui/filter-pill";

import { CLIENT_FILTERS, type ClientFilter } from "../format";

// All / Trip coming up / Traveling now / No trip yet, with counts. The choice
// lives in ?show= so the server filters and the back button works.
export function ClientsFilters({ active, counts }: { active: ClientFilter; counts: Record<ClientFilter, number> }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function choose(filter: ClientFilter) {
    const params = new URLSearchParams(searchParams.toString());
    if (filter === "all") params.delete("show");
    else params.set("show", filter);
    params.delete("all");
    const search = params.toString();
    startTransition(() => router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false }));
  }

  return (
    <div role="group" aria-label="Filter clients" className="flex items-center gap-2">
      {CLIENT_FILTERS.map((filter) => (
        <FilterPill
          key={filter.key}
          label={filter.label}
          count={counts[filter.key]}
          active={active === filter.key}
          onClick={() => choose(filter.key)}
        />
      ))}
    </div>
  );
}
