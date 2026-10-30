import Link from "next/link";

import { cn } from "@/lib/ui/cn";

import { tabIsActive, type CategoryFilter, type CategoryTab } from "./city";
import { placesHref, type PlacesQuery } from "./format";

// All / Hotels / Restaurants / Bars ... with counts, only the categories the
// city has. Links, so the tab lives in ?category= and the page stays a
// server component. The track and the active ink pill match the panel
// variant of SegmentedToggle.
export function CategoryTabs({
  tabs,
  total,
  filter,
  query,
}: {
  tabs: CategoryTab[];
  total: number;
  filter: CategoryFilter | null;
  query: PlacesQuery;
}) {
  const items = [
    { key: "all", label: `All ${total}`, href: placesHref({ ...query, category: null }), active: filter === null },
    ...tabs.map((tab) => ({
      key: tab.slug,
      label: `${tab.label} ${tab.count}`,
      href: placesHref({ ...query, category: tab.slug }),
      active: tabIsActive(tab.slug, filter),
    })),
  ];

  return (
    <nav aria-label="Kinds of places" className="max-w-full overflow-x-auto">
      <ul className="flex w-max items-center gap-0.5 rounded-pill bg-canvas p-1">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              scroll={false}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "block rounded-pill py-2 text-ui whitespace-nowrap transition-colors",
                item.active
                  ? "bg-ink px-4 font-semibold text-surface-raised"
                  : "px-3.5 font-medium text-text-3 hover:bg-ink/5 hover:text-ink",
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
