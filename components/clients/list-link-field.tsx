"use client";

import { useId, useState, type SyntheticEvent } from "react";

import { Button } from "@/components/ui/button";

// The box a shared Google Maps list is pasted into, on the new client screen
// and on the profile.

export function ListLinkField({
  label,
  busy = false,
  autoFocus = false,
  message,
  onSubmit,
  onCancel,
}: {
  /** Shown above the box. Without one the box is named for screen readers only. */
  label?: string;
  busy?: boolean;
  autoFocus?: boolean;
  /** A problem with the last attempt, as the server named it. */
  message?: string;
  onSubmit: (link: string) => void;
  onCancel?: () => void;
}) {
  const id = useId();
  const [link, setLink] = useState("");

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (link.trim()) onSubmit(link);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      {label ? (
        <label htmlFor={id} className="text-ui font-medium text-text-2">
          {label}
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={id}
          value={link}
          onChange={(event) => setLink(event.target.value)}
          placeholder="Paste the link to a shared list"
          aria-label={label ? undefined : "Link to a shared Google Maps list"}
          autoComplete="off"
          autoFocus={autoFocus}
          maxLength={2000}
          className="h-10 min-w-0 grow basis-64 rounded-pill border border-ink/14 bg-surface-raised px-4 text-ui text-ink placeholder:text-text-muted focus-visible:border-ink focus-visible:outline-none"
        />
        <Button type="submit" size="md" disabled={!link.trim() || busy} loading={busy}>
          Import list
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" size="md" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
      {message ? (
        <p role="alert" className="text-ui-sm text-text-2">
          {message}
        </p>
      ) : null}
    </form>
  );
}
