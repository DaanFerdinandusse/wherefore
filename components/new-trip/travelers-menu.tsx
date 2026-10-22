"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Plus, UserPlus, X } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Button, buttonClasses } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Stepper } from "@/components/ui/stepper";
import { UnderlineField } from "@/components/ui/underline-field";
import { createGuestClient, searchTripBarClients, type TripBarClient } from "@/lib/trips/actions";
import { cn } from "@/lib/ui/cn";

import { RowIcon } from "./bar-segment";
import { guestsWithoutFavorites, type Draft, type DraftAction, type DraftGuest } from "./draft";
import { clientDescription, clientTravelerNote, guestTravelerNote, missingFavoritesNote } from "./format";
import { useDebouncedValue } from "./use-debounced-value";

// Travelers (F4): the client, whose favorites drive the search; companions,
// either one of the advisor's clients or a guest by name ("Add favorites"
// turns a guest into a client row with status guest, to fill in on the client
// screen); adults and children. Companions without favorites are flagged.
export function TravelersMenu({
  draft,
  dispatch,
  onChooseClient,
}: {
  draft: Draft;
  dispatch: (action: DraftAction) => void;
  onChooseClient: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const missing = guestsWithoutFavorites(draft);
  const note = missingFavoritesNote(
    missing.map((g) => g.name),
    draft.client?.name ?? null,
  );

  return (
    <div className="flex flex-col gap-1">
      <p className="label-caps px-3 pb-2 leading-[14px] text-text-2">Who is traveling</p>

      {draft.client ? (
        <TravelerRow
          avatar={<Avatar name={draft.client.name} size={44} />}
          name={draft.client.name}
          {...clientTravelerNote(draft.client.favoritesCount)}
        />
      ) : (
        <div className="flex items-center gap-3.5 px-3 py-2.5">
          <RowIcon>
            <UserPlus size={16} strokeWidth={2} />
          </RowIcon>
          <span className="flex-1 text-ui text-text-2">Choose the client first. Their favorites drive the search.</span>
          <Button variant="outline" size="sm" onClick={onChooseClient}>
            Choose a client
          </Button>
        </div>
      )}

      {draft.guests.map((guest) => (
        <GuestRow key={guest.key} guest={guest} dispatch={dispatch} />
      ))}

      {adding ? (
        <AddTraveler
          draft={draft}
          onAdd={(guest) => {
            dispatch({ type: "addGuest", guest });
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex w-full items-center gap-3.5 rounded-row px-3 py-2.5 text-left transition-colors hover:bg-canvas focus-visible:bg-canvas"
        >
          <RowIcon>
            <Plus size={16} strokeWidth={2} />
          </RowIcon>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-body-lg leading-5 font-semibold text-ink">Add a traveler</span>
            <span className="text-ui-sm text-text-2">Pick one of your clients or add a guest</span>
          </span>
        </button>
      )}

      <div className="mt-1 flex flex-col gap-0.5 border-t border-rule-strong px-3 pt-3">
        <Stepper label="Adults" value={draft.adults} min={1} onValueChange={(value) => dispatch({ type: "setAdults", value })} />
        <Stepper label="Children" value={draft.children} onValueChange={(value) => dispatch({ type: "setChildren", value })} />
        <p className={cn("pt-2 text-ui-sm", note ? "text-amber" : "text-text-2")}>
          {note ?? "Travelers without favorites are flagged on the trip, so you know whose taste is missing."}
        </p>
      </div>
    </div>
  );
}

function TravelerRow({
  avatar,
  name,
  text,
  warning,
  trailing,
}: {
  avatar: React.ReactNode;
  name: string;
  text: string;
  warning: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3.5 px-3 py-2.5">
      {avatar}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-body-lg leading-5 font-semibold text-ink">{name}</span>
        <span className={cn("text-ui-sm", warning ? "text-amber" : "text-text-2")}>{text}</span>
      </span>
      {trailing}
    </div>
  );
}

function GuestRow({ guest, dispatch }: { guest: DraftGuest; dispatch: (action: DraftAction) => void }) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const note = guestTravelerNote(guest);

  async function addFavorites() {
    setCreating(true);
    setError(null);
    try {
      const client = await createGuestClient(guest.name);
      dispatch({ type: "updateGuest", key: guest.key, patch: { clientId: client.id } });
    } catch {
      setError("Could not save this guest. Try again.");
    } finally {
      setCreating(false);
    }
  }

  const action = !guest.clientId ? (
    <Button variant="outline" size="sm" loading={creating} onClick={addFavorites}>
      Add favorites
    </Button>
  ) : guest.favoritesCount === 0 ? (
    <Link
      href={`/clients/${guest.clientId}`}
      target="_blank"
      rel="noopener"
      className={buttonClasses({ variant: "outline", size: "sm" })}
    >
      Pick favorites
    </Link>
  ) : null;

  return (
    <div>
      <TravelerRow
        avatar={<Avatar name={guest.name} size={44} tone={note.warning ? "dashed" : "soft"} />}
        name={guest.name}
        text={note.text}
        warning={note.warning}
        trailing={
          <span className="flex shrink-0 items-center gap-1">
            {action}
            <IconButton
              label={`Remove ${guest.name}`}
              variant="ghost"
              size={32}
              icon={<X size={14} strokeWidth={2} aria-hidden />}
              onClick={() => dispatch({ type: "removeGuest", key: guest.key })}
            />
          </span>
        }
      />
      {error ? (
        <p role="alert" className="px-3 pb-2 pl-[70px] text-ui-sm text-amber">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function AddTraveler({
  draft,
  onAdd,
  onCancel,
}: {
  draft: Draft;
  onAdd: (guest: DraftGuest) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const q = name.trim();
  const debounced = useDebouncedValue(q, 250);
  const [matches, setMatches] = useState<{ q: string; clients: TripBarClient[] } | null>(null);

  useEffect(() => {
    if (debounced.length < 2) return;
    let live = true;
    searchTripBarClients(debounced)
      .then((clients) => {
        if (live) setMatches({ q: debounced, clients });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [debounced]);

  const taken = new Set([draft.client?.id, ...draft.guests.map((g) => g.clientId)].filter(Boolean));
  const clientMatches =
    q.length >= 2 && matches?.q === debounced ? matches.clients.filter((c) => !taken.has(c.id)).slice(0, 3) : [];

  function addGuest(event?: FormEvent) {
    event?.preventDefault();
    if (!q) return;
    onAdd({ key: crypto.randomUUID(), name: q, clientId: null, favoritesCount: 0 });
  }

  return (
    <form onSubmit={addGuest} className="flex flex-col gap-1 rounded-row bg-canvas/60 px-3 pt-1 pb-3">
      <UnderlineField
        value={name}
        onValueChange={setName}
        label="Traveler name"
        placeholder="Name"
        icon={null}
        autoFocus
      />
      {clientMatches.map((client) => (
        <button
          key={client.id}
          type="button"
          onClick={() =>
            onAdd({ key: crypto.randomUUID(), name: client.name, clientId: client.id, favoritesCount: client.favoritesCount })
          }
          className="flex w-full items-center gap-3 rounded-row px-2 py-2 text-left hover:bg-canvas focus-visible:bg-canvas"
        >
          <Avatar name={client.name} size={32} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-ui font-semibold text-ink">{client.name}</span>
            <span className="truncate text-ui-sm text-text-2">{clientDescription(client)}</span>
          </span>
        </button>
      ))}
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!q}>
          {q ? `Add ${q} as a guest` : "Add as a guest"}
        </Button>
      </div>
    </form>
  );
}
