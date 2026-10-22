"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Search } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { Spinner } from "@/components/ui/spinner";
import { UnderlineField } from "@/components/ui/underline-field";
import { searchTripBarClients, type TripBarClient } from "@/lib/trips/actions";
import { cn } from "@/lib/ui/cn";

import { RowIcon } from "./bar-segment";
import { clientDescription } from "./format";
import { useDebouncedValue } from "./use-debounced-value";

// For who (F1): the four most recent clients, "Find a client" (a search over
// all clients by name or home city) and "New client", which opens the client
// screen and comes back here through `return`.
export function WhoMenu({
  recentClients,
  loading,
  selectedId,
  newClientHref,
  onSelect,
}: {
  recentClients: TripBarClient[];
  loading: boolean;
  selectedId: string | null;
  newClientHref: string;
  onSelect: (client: TripBarClient) => void;
}) {
  const [mode, setMode] = useState<"recent" | "search">("recent");

  if (mode === "search") {
    return <FindClient selectedId={selectedId} onSelect={onSelect} onBack={() => setMode("recent")} />;
  }

  return (
    <>
      <MenuLabel>Recent clients</MenuLabel>
      {loading ? (
        <p className="flex items-center gap-2 px-3 py-4 text-ui text-text-2">
          <Spinner size={14} /> Loading your clients
        </p>
      ) : recentClients.length === 0 ? (
        <p className="px-3 py-3 text-ui text-text-2">No clients yet. Add your first one below.</p>
      ) : (
        recentClients.map((client) => (
          <ClientRow key={client.id} client={client} selected={client.id === selectedId} onSelect={onSelect} />
        ))
      )}
      <MenuSeparator className="mx-0" />
      <MenuItem
        leading={
          <RowIcon>
            <Search size={16} strokeWidth={2} />
          </RowIcon>
        }
        title="Find a client"
        description="Search by name or home city"
        chevron
        onSelect={() => setMode("search")}
        className="p-3"
      />
      <MenuItem
        leading={
          <RowIcon tone="ink">
            <Plus size={16} strokeWidth={2} />
          </RowIcon>
        }
        title="New client"
        description="Name, home city and the places they love"
        href={newClientHref}
        className="p-3"
      />
    </>
  );
}

function ClientRow({
  client,
  selected,
  onSelect,
}: {
  client: TripBarClient;
  selected: boolean;
  onSelect: (client: TripBarClient) => void;
}) {
  return (
    <MenuItem
      leading={<Avatar name={client.name} size={44} />}
      title={client.name}
      description={clientDescription(client)}
      chevron
      onSelect={() => onSelect(client)}
      className={cn(selected && "bg-canvas")}
    />
  );
}

function FindClient({
  selectedId,
  onSelect,
  onBack,
}: {
  selectedId: string | null;
  onSelect: (client: TripBarClient) => void;
  onBack: () => void;
}) {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), 250);
  const [results, setResults] = useState<{ q: string; clients: TripBarClient[] } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!debounced) return;
    let live = true;
    searchTripBarClients(debounced)
      .then((clients) => {
        if (!live) return;
        setError(false);
        setResults({ q: debounced, clients });
      })
      .catch(() => {
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, [debounced]);

  const current = debounced && results?.q === debounced ? results.clients : null;
  const searching = Boolean(query.trim()) && !error && (debounced !== query.trim() || current === null);

  return (
    <>
      <div className="flex items-center gap-2 px-1 pb-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to recent clients"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-pill text-text-3 hover:bg-ink/5 hover:text-ink"
        >
          <ArrowLeft size={16} strokeWidth={2} aria-hidden />
        </button>
        <UnderlineField
          value={query}
          onValueChange={setQuery}
          label="Find a client"
          placeholder="Find a client by name or home city"
          autoFocus
          className="flex-1"
        />
      </div>
      {!query.trim() ? (
        <p className="px-3 py-3 text-ui text-text-2">Type a name or a home city.</p>
      ) : error ? (
        <p role="alert" className="px-3 py-3 text-ui text-amber">
          Could not search your clients. Try again.
        </p>
      ) : searching ? (
        <p className="flex items-center gap-2 px-3 py-3 text-ui text-text-2">
          <Spinner size={14} /> Searching
        </p>
      ) : current && current.length > 0 ? (
        current.map((client) => (
          <ClientRow key={client.id} client={client} selected={client.id === selectedId} onSelect={onSelect} />
        ))
      ) : (
        <p className="px-3 py-3 text-ui text-text-2">No client matches “{query.trim()}”.</p>
      )}
    </>
  );
}
