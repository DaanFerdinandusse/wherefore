"use client";

import { useState } from "react";
import { Download, Plus } from "lucide-react";

import { cn } from "@/lib/ui/cn";

import { EntityCombobox } from "./entity-combobox";
import { useEntitySearch, type TypedCandidate } from "./use-entity-search";

// The last tile of "Places they love". At rest a dashed "Add a place"; on
// click it becomes a search field whose results open under the grid, biased
// to the client's home city. Picking a result adds it matched; Enter on the
// text alone keeps it as typed (an unmatched favorite with candidates).

const PLACE_TYPES = ["place"] as const;

export function AddPlaceTile({
  near,
  disabledReason,
  onPick,
  onSubmitText,
}: {
  near: { lat: number; lon: number } | null;
  /** Why adding is not possible yet ("Add a name first"); null when it is. */
  disabledReason: string | null;
  onPick: (candidate: TypedCandidate, query: string) => void;
  onSubmitText: (query: string, results: TypedCandidate[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const { results, state } = useEntitySearch(editing ? query : "", { types: PLACE_TYPES, near });

  function close() {
    setEditing(false);
    setQuery("");
  }

  if (!editing) {
    return (
      <li className="flex w-32 shrink-0">
        <button
          type="button"
          disabled={disabledReason !== null}
          title={disabledReason ?? undefined}
          onClick={() => setEditing(true)}
          className="flex h-24 w-32 flex-col items-center justify-center gap-1 rounded-2xl border-[1.5px] border-dashed border-rule-strong text-ui-sm font-medium text-text-muted transition-colors hover:border-nav-pill hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plus size={16} strokeWidth={2.2} aria-hidden />
          {disabledReason ?? "Add a place"}
        </button>
      </li>
    );
  }

  return (
    <li className="flex w-32 shrink-0">
      <EntityCombobox
        value={query}
        onValueChange={setQuery}
        label="Add a place they love"
        placeholder="Place name"
        results={results}
        state={state}
        onPick={(candidate) => {
          onPick(candidate, query.trim());
          close();
        }}
        onSubmitText={(text) => {
          onSubmitText(text, results);
          close();
        }}
        onCancel={close}
        icon={<Plus size={14} strokeWidth={2.2} />}
        className="flex h-24 w-32 items-center rounded-2xl border-[1.5px] border-ink bg-surface-raised px-2.5"
        fieldClassName="w-full gap-1.5! border-rule-strong! py-1.5! pr-0! pl-0!"
        inputClassName="text-body! font-medium"
        dropdownClassName="top-full right-0 w-[390px] max-w-[calc(100vw-32px)]"
        footer={
          <div aria-disabled className="flex items-center gap-2.5 px-3 py-2.5 text-ui-sm leading-4 font-semibold text-text-muted">
            <Download size={14} strokeWidth={1.6} aria-hidden />
            <span className="grow">Import Google Maps saved places</span>
            <span className={cn("label-caps rounded-pill border border-rule-strong px-2 py-0.5 leading-3")}>Soon</span>
          </div>
        }
      />
    </li>
  );
}
