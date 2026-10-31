"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { holdListImport } from "@/components/clients/held-list-import";
import { ListLinkField } from "@/components/clients/list-link-field";
import { buttonClasses } from "@/components/ui/button";
import { createClientWithFavoritesAction, readSharedListAction } from "@/lib/clients/actions";

const NO_SERVER = "Could not reach the server. Check your connection and try again.";

// The landing page's second action: the list link goes in right here. The link
// is read before a client is saved, so a bad link leaves nothing behind, then
// the profile takes over and runs the import where the places can be seen.
export function OwnListImport() {
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function importList(link: string) {
    const clientName = name.trim();
    if (!clientName) {
      setError("Add your name, then import the list.");
      nameRef.current?.focus();
      return;
    }
    setError(undefined);
    setBusy(true);
    const list = await readSharedListAction(link).catch(() => null);
    if (!list?.ok) {
      setBusy(false);
      setError(list?.error ?? NO_SERVER);
      return;
    }
    const client = await createClientWithFavoritesAction({ name: clientName, favorites: [] }).catch(() => null);
    if (!client?.ok) {
      setBusy(false);
      setError(client?.error ?? NO_SERVER);
      return;
    }
    holdListImport(client.data.id, link);
    router.push(`/clients/${client.data.id}`);
  }

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="own-list"
        onClick={() => setOpen((value) => !value)}
        className={buttonClasses({ variant: "outline", size: "lg", className: "w-full" })}
      >
        Use my own Google Maps list
      </button>
      {open ? (
        <div id="own-list" className="rise-in w-full">
          <ListLinkField busy={busy} message={error} onSubmit={(link) => void importList(link)}>
            <input
              ref={nameRef}
              value={name}
              autoFocus
              maxLength={120}
              autoComplete="given-name"
              aria-label="Your name"
              placeholder="Your name"
              onChange={(event) => setName(event.target.value)}
              className="h-10 w-full rounded-pill border border-ink/14 bg-surface-raised px-4 text-ui text-ink placeholder:text-text-muted focus-visible:border-ink focus-visible:outline-none"
            />
          </ListLinkField>
          <p className="mt-2 text-ui-sm text-text-2">In Google Maps, open a list, choose Share and copy the link.</p>
        </div>
      ) : null}
    </>
  );
}
