"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";

import { SegmentedToggle, type SegmentOption } from "@/components/ui/segmented-toggle";

import { BoardIcon, ListIcon } from "./icons";
import { tripsViewHref, type TripsView } from "./view";

// Board / List in the panel header. The view lives in the URL (?view=list)
// so a reload or a shared link keeps it; the toggle answers at once while
// the page renders the other view.
const OPTIONS: SegmentOption<TripsView>[] = [
  { value: "board", label: "Board", icon: <BoardIcon size={15} /> },
  { value: "list", label: "List", icon: <ListIcon size={15} /> },
];

export function TripsViewToggle({ view }: { view: TripsView }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(view);

  return (
    <SegmentedToggle
      variant="panel"
      label="View"
      options={OPTIONS}
      value={shown}
      onValueChange={(next) =>
        startTransition(() => {
          setShown(next);
          router.replace(tripsViewHref(next), { scroll: false });
        })
      }
    />
  );
}
