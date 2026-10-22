"use client";

import Image from "next/image";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

import { UnderlineField } from "@/components/ui/underline-field";
import { candidateDetail } from "@/lib/clients/candidates";
import { cn } from "@/lib/ui/cn";

import { MIN_QUERY, type SearchState, type TypedCandidate } from "./use-entity-search";

// The search field behind "Add a place" and "Also into": an UnderlineField
// that is a combobox over a results dropdown (photo, name, address line,
// "Add"). Arrow keys move through the results, Enter adds the active one
// (or, with none active, `onSubmitText` keeps the text as typed), Escape
// cancels. The dropdown positions against the nearest positioned ancestor,
// so the caller decides where it opens.

export function EntityCombobox({
  value,
  onValueChange,
  label,
  placeholder,
  results,
  state,
  onPick,
  onSubmitText,
  onCancel,
  meta,
  footer,
  icon,
  className,
  fieldClassName,
  inputClassName,
  dropdownClassName,
}: {
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  placeholder: string;
  results: TypedCandidate[];
  state: SearchState;
  onPick: (candidate: TypedCandidate) => void;
  /** Enter with no active result. Omit to make Enter do nothing then. */
  onSubmitText?: (text: string) => void;
  /** Escape, or focus leaving the field and its dropdown. */
  onCancel: () => void;
  /** Extra text after the address line ("Artist"). */
  meta?: (candidate: TypedCandidate) => string | null;
  /** A last row under the results (the import row). */
  footer?: ReactNode;
  icon?: ReactNode | null;
  className?: string;
  fieldClassName?: string;
  inputClassName?: string;
  dropdownClassName?: string;
}) {
  const listId = useId();
  const [active, setActive] = useState(-1);
  const q = value.trim();
  const showList = (q.length >= MIN_QUERY || Boolean(footer));
  const activeResult = active >= 0 ? results[active] : undefined;
  const optionId = (index: number) => `${listId}-option-${index}`;

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp" && results.length > 0) {
      event.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeResult) onPick(activeResult);
      else if (q.length > 0) onSubmitText?.(q);
    }
  }

  return (
    <div
      className={className}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onCancel();
      }}
    >
      <UnderlineField
        value={value}
        onValueChange={(next) => {
          onValueChange(next);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
        label={label}
        placeholder={placeholder}
        icon={icon}
        clearLabel="Clear"
        autoFocus
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeResult ? optionId(active) : undefined}
        className={fieldClassName}
        inputClassName={inputClassName}
      />

      {showList ? (
        <div
          className={cn(
            "rise-in absolute z-50 mt-2 flex flex-col rounded-[18px] border border-rule-strong bg-surface-raised p-1.5 shadow-menu",
            dropdownClassName,
          )}
        >
          <ul id={listId} role="listbox" aria-label={label} className="flex max-h-[320px] flex-col overflow-auto">
            {results.map((candidate, index) => {
              const detail = [candidateDetail(candidate), meta?.(candidate)].filter(Boolean).join(" · ");
              return (
                <li
                  key={`${candidate.type}-${candidate.entityId}`}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === active}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => onPick(candidate)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3.5 rounded-xl px-3 py-2.5 transition-colors",
                    index === active && "bg-surface-hover",
                  )}
                >
                  <span className="relative size-11 shrink-0 overflow-hidden rounded-[10px] bg-avatar">
                    {candidate.imageUrl ? (
                      <Image src={candidate.imageUrl} alt="" fill sizes="44px" className="film object-cover" />
                    ) : null}
                  </span>
                  <span className="flex min-w-0 grow flex-col gap-0.5">
                    <span className="truncate text-body-lg leading-5 font-semibold text-ink">{candidate.name}</span>
                    {detail ? <span className="truncate text-ui-sm text-text-2">{detail}</span> : null}
                  </span>
                  <span className="shrink-0 text-ui-sm leading-4 font-semibold text-ink">Add</span>
                </li>
              );
            })}
          </ul>
          {q.length >= MIN_QUERY && results.length === 0 ? (
            <p role="status" className="px-3 py-2.5 text-ui text-text-2">
              {state === "loading"
                ? "Searching"
                : state === "error"
                  ? "Search is unavailable right now. Try again in a moment."
                  : onSubmitText
                    ? `Nothing found for “${q}”. Press Enter to keep it as typed.`
                    : `Nothing found for “${q}”.`}
            </p>
          ) : null}
          {footer ? <div className={cn(results.length > 0 || q.length >= MIN_QUERY ? "border-t border-rule" : "")}>{footer}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
