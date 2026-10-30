"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Plus, UserPlus, X } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Stepper } from "@/components/ui/stepper";
import { UnderlineField } from "@/components/ui/underline-field";
import { searchTripBarClients, type TripBarClient } from "@/lib/trips/actions";
import { cn } from "@/lib/ui/cn";

import { DropLabel } from "./bar-segment";
import { type Draft, type DraftAction, type DraftGuest } from "./draft";
import { clientDescription, clientTravelerNote, companionNote } from "./format";
import { useDebouncedValue } from "./use-debounced-value";

// Travelers (N4): who is traveling. The client comes first with the Client
// tag and whose favorites drive the search. Companions follow: one of the
// advisor's clients (their favorites join the search) or a guest by name
// only. Guests do not get favorites of their own. Then Adults and Children.
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
  const clientName = draft.client?.name ?? null;

  return (
    <div className="flex flex-col gap-1">
      <DropLabel>Who is traveling</DropLabel>

      {draft.client ? (
        <TravelerRow
          avatar={<Avatar name={draft.client.name} src={draft.client.avatarUrl ?? undefined} size={44} />}
          name={draft.client.name}
          tag="client"
          {...clientTravelerNote(draft.client.name, draft.client.favoritesCount)}
        />
      ) : (
        <div className="flex min-h-16 items-center gap-3 px-4">
          <Circle>
            <UserPlus size={18} strokeWidth={2} aria-hidden />
          </Circle>
          <span className="flex-1 text-ui text-text-2">Choose the client first. Their favorites drive the search.</span>
          <Button variant="outline" size="sm" onClick={onChooseClient} className="h-9 px-3.5 text-ui">
            Choose a client
          </Button>
        </div>
      )}

      {draft.guests.map((guest) => (
        <TravelerRow
          key={guest.key}
          avatar={<Avatar name={guest.name} size={44} tone={guest.clientId ? "soft" : "dashed"} />}
          name={guest.name}
          tag={guest.clientId ? "client" : "guest"}
          text={companionNote(guest, clientName)}
          warning={false}
          trailing={
            <IconButton
              label={`Remove ${guest.name}`}
              variant="ghost"
              size={32}
              icon={<X size={14} strokeWidth={2} aria-hidden />}
              onClick={() => dispatch({ type: "removeGuest", key: guest.key })}
            />
          }
        />
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
          className="flex min-h-16 w-full items-center gap-3 rounded-[16px] px-4 text-left transition-colors hover:bg-glow/25 focus-visible:bg-glow/25 focus-visible:outline-none"
        >
          <Circle>
            <Plus size={18} strokeWidth={2} aria-hidden />
          </Circle>
          <span className="text-body-lg leading-[22px] font-semibold text-ink">Add a traveler</span>
        </button>
      )}

      <div className="mt-1 flex flex-col gap-1 border-t border-rule px-4 pt-3 pb-2">
        <Stepper
          label="Adults"
          value={draft.adults}
          min={1}
          onValueChange={(value) => dispatch({ type: "setAdults", value })}
          className="h-[52px] py-0"
        />
        <Stepper
          label="Children"
          value={draft.children}
          onValueChange={(value) => dispatch({ type: "setChildren", value })}
          className="h-[52px] py-0"
        />
      </div>
    </div>
  );
}

function Circle({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="flex size-11 shrink-0 items-center justify-center rounded-pill border border-ink/20 text-ink"
    >
      {children}
    </span>
  );
}

function TravelerRow({
  avatar,
  name,
  tag,
  text,
  warning,
  trailing,
}: {
  avatar: ReactNode;
  name: string;
  tag: "client" | "guest";
  text: string | null;
  warning: boolean;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex min-h-16 items-center gap-3 px-4">
      {avatar}
      <span className="w-[120px] shrink-0 truncate text-body-lg leading-[22px] font-semibold text-ink">{name}</span>
      <span className="flex w-16 shrink-0">
        <span
          className={cn(
            "inline-flex h-6 items-center rounded-pill px-2.5 text-meta font-semibold",
            tag === "client" ? "bg-glow/25 text-amber" : "border border-ink/20 text-text-3",
          )}
        >
          {tag === "client" ? "Client" : "Guest"}
        </span>
      </span>
      <span className={cn("min-w-0 flex-1 text-ui leading-5", warning ? "text-amber" : "text-text-3")}>{text}</span>
      {trailing}
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
    <form onSubmit={addGuest} className="mx-1 flex flex-col gap-1 rounded-[16px] bg-surface px-3 pt-1 pb-3">
      <UnderlineField
        value={name}
        onValueChange={setName}
        label="Traveler name"
        placeholder="Name, or find one of your clients"
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
          className="flex w-full items-center gap-3 rounded-row px-2 py-2 text-left hover:bg-glow/25 focus-visible:bg-glow/25 focus-visible:outline-none"
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
