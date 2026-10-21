"use client";

import { useRef, type InputHTMLAttributes, type ReactNode, type RefObject } from "react";
import { Search, X } from "lucide-react";

import { cn } from "@/lib/ui/cn";

// The underlined text field: the app bar search ("Search clients, trips or
// places"), the trip bar inputs, "Add a place". A leading icon slot (search
// by default), a 1px underline that turns amber on focus, and a clear button
// once there is text. Controlled: pass `value` and `onValueChange`.
export function UnderlineField({
  value,
  onValueChange,
  label,
  placeholder,
  icon,
  clearLabel = "Clear",
  onClear,
  inputRef,
  className,
  inputClassName,
  ...inputProps
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "size"> & {
  value: string;
  onValueChange: (value: string) => void;
  /** Accessible name, needed because there is no visible label. */
  label: string;
  /** Leading icon; pass null for none. */
  icon?: ReactNode | null;
  clearLabel?: string;
  /** Called after the clear button empties the field. */
  onClear?: () => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  inputClassName?: string;
}) {
  const ownRef = useRef<HTMLInputElement | null>(null);
  const ref = inputRef ?? ownRef;

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 border-b border-nav-pill py-[11px] pr-1 pl-0.5 transition-colors",
        "focus-within:border-glow focus-within:shadow-[0_1px_0_0_var(--color-glow)] hover:border-ink",
        className,
      )}
    >
      {icon === null ? null : (
        <span aria-hidden className="flex shrink-0 text-text-muted">
          {icon ?? <Search size={16} strokeWidth={2} />}
        </span>
      )}
      <input
        ref={ref}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        aria-label={label}
        placeholder={placeholder}
        className={cn(
          "min-w-0 flex-1 bg-transparent text-ui text-ink placeholder:text-text-muted focus-visible:outline-none",
          "[&::-webkit-search-cancel-button]:hidden",
          inputClassName,
        )}
        {...inputProps}
      />
      <button
        type="button"
        aria-label={clearLabel}
        tabIndex={value ? 0 : -1}
        onClick={() => {
          onValueChange("");
          onClear?.();
          ref.current?.focus();
        }}
        className={cn(
          "-my-[3px] inline-flex size-6 shrink-0 items-center justify-center rounded-pill text-text-muted transition-colors hover:bg-ink/5 hover:text-ink",
          !value && "invisible",
        )}
      >
        <X size={14} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}
