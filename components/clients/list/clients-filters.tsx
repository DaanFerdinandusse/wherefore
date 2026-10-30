"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { SegmentedToggle } from "@/components/ui/segmented-toggle";

import { CLIENT_FILTERS, type ClientFilter } from "../format";

// All / Trip coming up / No trip yet, with counts, as the panel header's
// segmented switch. The choice lives in ?show= so the server filters and the
// back button works.
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
    <SegmentedToggle
      variant="panel"
      label="Filter clients"
      value={active}
      onValueChange={choose}
      options={CLIENT_FILTERS.map((filter) => ({ value: filter.key, label: `${filter.label} ${counts[filter.key]}` }))}
    />
  );
}
