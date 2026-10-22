"use client";

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";

// Ground rules ("No tasting menus", "Likes to walk") as removable chips, with
// "+ Add" that turns into an inline field: Enter adds, Escape cancels.

export function GroundRules({
  rules,
  disabled,
  onChange,
}: {
  rules: string[];
  disabled: boolean;
  onChange: (next: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const addRef = useRef<HTMLButtonElement>(null);
  const cancelled = useRef(false);

  function commit() {
    const rule = draft.trim();
    if (rule && !rules.some((r) => r.toLowerCase() === rule.toLowerCase())) onChange([...rules, rule]);
    setDraft("");
  }

  function close() {
    setAdding(false);
    setDraft("");
    requestAnimationFrame(() => addRef.current?.focus());
  }

  return (
    <section aria-labelledby="ground-rules" className="flex flex-col gap-2.5">
      <h3 id="ground-rules" className="label-caps leading-4 text-text-muted">
        Ground rules
      </h3>
      <ul className="flex flex-wrap items-center gap-2">
        {rules.map((rule, index) => (
          <li
            key={`${rule}-${index}`}
            className="inline-flex h-[30px] items-center gap-1 rounded-pill border border-pill-outline pr-1 pl-3 text-ui-sm font-medium text-ink"
          >
            {rule}
            <button
              type="button"
              aria-label={`Remove ${rule}`}
              onClick={() => onChange(rules.filter((_, i) => i !== index))}
              className="inline-flex size-[22px] items-center justify-center rounded-pill text-text-muted transition-colors hover:bg-ink/5 hover:text-ink"
            >
              <X size={12} strokeWidth={2.2} aria-hidden />
            </button>
          </li>
        ))}
        <li className="flex">
          {adding ? (
            <input
              autoFocus
              value={draft}
              aria-label="New ground rule"
              placeholder="No tasting menus"
              maxLength={80}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commit();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  cancelled.current = true;
                  close();
                }
              }}
              onBlur={() => {
                if (cancelled.current) {
                  cancelled.current = false;
                  return;
                }
                commit();
                setAdding(false);
              }}
              className="h-[30px] w-[180px] rounded-pill border border-ink bg-surface-raised px-3 text-ui-sm font-medium text-ink placeholder:text-text-muted focus-visible:outline-none"
            />
          ) : (
            <button
              ref={addRef}
              type="button"
              disabled={disabled}
              title={disabled ? "Add a name first" : undefined}
              onClick={() => setAdding(true)}
              className="inline-flex h-[30px] items-center gap-1 rounded-pill border border-pill-outline px-3 text-ui-sm font-medium text-ink transition-colors hover:border-ink hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={12} strokeWidth={2.4} aria-hidden />
              Add
            </button>
          )}
        </li>
      </ul>
    </section>
  );
}
