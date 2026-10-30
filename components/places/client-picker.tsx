"use client";

import { useState } from "react";
import { Check, ChevronDown, UserRound } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { initials } from "@/lib/ui/initials";

import { placesHref, type PlacesQuery } from "./format";

// "Scored for Ana Ruiz": which client the city's places are scored for. The
// choice lives in ?client= ("none" turns scoring off). Clients with a trip
// to this city come first, with when they go.

export type PickerClient = { id: string; name: string; avatarUrl: string | null; line: string | null };

export function ClientPicker({
  clients,
  selected,
  city,
  query,
}: {
  clients: PickerClient[];
  selected: { id: string; name: string } | null;
  city: string;
  query: PlacesQuery;
}) {
  const [open, setOpen] = useState(false);
  if (clients.length === 0) return null;

  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      label="Score these places for"
      align="end"
      panelClassName="w-[320px] max-h-[420px] overflow-y-auto p-2!"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className="flex shrink-0 items-center gap-2 rounded-pill border border-ink/14 py-1 pr-3 pl-1 transition-colors hover:border-ink/40"
        >
          <span
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center rounded-pill bg-canvas text-meta font-semibold text-ink"
          >
            {selected ? initials(selected.name) : <UserRound size={13} strokeWidth={2} />}
          </span>
          <span className="text-ui-sm font-medium text-ink">
            {selected ? `Scored for ${selected.name}` : "Score for a client"}
          </span>
          <ChevronDown size={12} strokeWidth={2} aria-hidden className="text-text-muted" />
        </button>
      )}
    >
      <MenuLabel>Score {city} places for</MenuLabel>
      {clients.map((client) => (
        <MenuItem
          key={client.id}
          href={placesHref({ ...query, client: client.id })}
          onSelect={() => setOpen(false)}
          leading={<Avatar name={client.name} src={client.avatarUrl ?? undefined} size={32} />}
          title={client.name}
          description={client.line ?? undefined}
          trailing={
            selected?.id === client.id ? <Check size={16} strokeWidth={2} aria-label="Selected" className="text-ink" /> : null
          }
        />
      ))}
      {selected ? (
        <>
          <MenuSeparator />
          <MenuItem
            href={placesHref({ ...query, client: "none" })}
            onSelect={() => setOpen(false)}
            title="Do not score"
            description="Show the places without a match score"
          />
        </>
      ) : null}
    </Menu>
  );
}
