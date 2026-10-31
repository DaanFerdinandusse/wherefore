"use client";

import { useSearchParams } from "next/navigation";
import { useId, useRef, useState } from "react";
import { ArrowRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClientWithFavoritesAction } from "@/lib/clients/actions";

import { firstName } from "../format";
import { holdListImport } from "../held-list-import";
import { ListLinkField } from "../list-link-field";
import { useClientModal } from "../modal/client-modal";
import { fieldBoxClasses, fieldLabelClasses } from "./field";
import { PlacesPicker, type PlacePick } from "./places-picker";
import { planTripHref, safeReturn, withClient } from "./return-to";

// C1 New client: a name and the places they love, searched one by one or
// imported from a shared Google Maps list. "Save client" closes back to the list
// (or to the New trip panel that asked, with the client chosen); "Save and plan
// a trip" opens the New trip panel for them; "Import list" saves the client and
// opens their profile, where the import runs with its count on screen.

type Intent = "save" | "plan" | "import";

export function NewClientForm() {
  const modal = useClientModal();
  const params = useSearchParams();
  const returnTo = safeReturn(params.get("return"));
  const ids = { name: useId(), places: useId() };
  const nameRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [picks, setPicks] = useState<PlacePick[]>([]);
  const [saving, setSaving] = useState<Intent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const first = name.trim() ? firstName(name) : null;

  async function save(intent: Intent, listLink?: string) {
    if (saving) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(intent === "import" ? "Add a name, then import the list." : "Add a name to save the client.");
      nameRef.current?.focus();
      return;
    }
    setError(null);
    setSaving(intent);
    const result = await createClientWithFavoritesAction({
      name: trimmedName,
      favorites: picks.map((pick) => ({ query: pick.query, entityId: pick.entityId, near: pick.near })),
    }).catch(() => ({ ok: false as const, error: "Could not save. Check your connection and try again." }));
    if (!result.ok) {
      setSaving(null);
      setError(result.error);
      return;
    }
    const id = result.data.id;
    if (intent === "import" && listLink) {
      holdListImport(id, listLink);
      modal.leaveTo(`/clients/${id}`);
    } else if (intent === "plan") modal.leaveTo(planTripHref(returnTo, id));
    else if (returnTo) modal.leaveTo(withClient(returnTo, id));
    else modal.close({ refresh: true });
  }

  return (
    <div className="flex min-h-0 grow flex-col">
      <div className="flex min-h-0 grow flex-col gap-[30px] overflow-y-auto px-10 pt-9 pb-8 max-lg:px-7">
        <header className="flex items-start justify-between gap-6">
          <div className="flex min-w-0 flex-col gap-2">
            <h2 className="font-display text-[46px] leading-[52px] tracking-[-0.02em] text-ink">New client</h2>
            <p className="text-body leading-5 text-text-2">
              {first
                ? `${first}'s favorite places shape every recommendation you get.`
                : "Their favorite places shape every recommendation you get for them."}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close without saving"
            title="Close without saving"
            onClick={() => (returnTo ? modal.leaveTo(returnTo) : modal.close())}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-pill border border-ink/16 text-ink transition-colors hover:border-ink hover:bg-ink/5"
          >
            <X size={16} strokeWidth={2} aria-hidden />
          </button>
        </header>

        <div className="flex flex-col gap-2">
          <label htmlFor={ids.name} className={fieldLabelClasses}>
            Name
          </label>
          <div className={fieldBoxClasses}>
            <input
              ref={nameRef}
              id={ids.name}
              value={name}
              autoFocus
              required
              maxLength={120}
              autoComplete="off"
              placeholder="Full name"
              aria-invalid={error !== null && !name.trim() ? true : undefined}
              onChange={(event) => {
                setName(event.target.value);
                if (error && event.target.value.trim()) setError(null);
              }}
              className="h-full min-w-0 grow bg-transparent text-body-lg leading-5 font-medium text-ink placeholder:font-normal placeholder:text-text-muted focus-visible:outline-none"
            />
          </div>
        </div>

        <section aria-labelledby={`${ids.places}-title`} className="flex flex-col gap-3.5">
          <h3 id={`${ids.places}-title`} className="font-display text-[28px] leading-[34px] tracking-[-0.01em] text-ink">
            <label htmlFor={ids.places}>{first ? `Places ${first} loves` : "Places they love"}</label>
          </h3>
          <PlacesPicker
            inputId={ids.places}
            near={null}
            picks={picks}
            placeholder="Search a restaurant, bar or hotel by name"
            onAdd={(pick) => setPicks((list) => (list.some((p) => p.entityId === pick.entityId) ? list : [...list, pick]))}
            onRemove={(entityId) => setPicks((list) => list.filter((p) => p.entityId !== entityId))}
          />
          <ListLinkField
            label="Or import a Google Maps list"
            busy={saving === "import"}
            onSubmit={(link) => void save("import", link)}
          />
        </section>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-6 border-t border-ink/8 px-10 py-[18px] max-lg:px-7">
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            onClick={() => void save("save")}
            loading={saving === "save"}
            disabled={saving !== null}
            className="h-11! border-ink/20! px-5! text-action!"
          >
            Save client
          </Button>
          <Button
            type="button"
            loading={saving === "plan"}
            disabled={saving !== null}
            onClick={() => void save("plan")}
            className="h-11! px-[22px]! text-action!"
          >
            Save and plan a trip
            <ArrowRight size={16} strokeWidth={2} aria-hidden />
          </Button>
        </div>
        {error ? (
          <p role="alert" className="min-w-0 text-right text-ui font-medium text-amber">
            {error}
          </p>
        ) : picks.length === 0 ? (
          <p className="min-w-0 text-right text-ui text-text-muted max-md:hidden">
            You can add places later too.
          </p>
        ) : null}
      </footer>
    </div>
  );
}
