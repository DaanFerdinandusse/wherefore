"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Plus } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Button, buttonClasses } from "@/components/ui/button";
import { createClientAction, updateClientFieldsAction, type ClientFieldsInput } from "@/lib/clients/actions";

import type { SaveResult } from "../autosave";
import { firstName, monthYear, plural } from "../format";
import { matchedCount } from "../favorites";
import { HomeCityField, type HomeCity } from "./home-city-field";
import { InlineText } from "./inline-text";
import { NotesField } from "./notes-field";
import { SaveStatus } from "./save-status";
import { TastePanel } from "./taste-panel";
import { TripsPanel } from "./trips-panel";
import type { ClientProfileData } from "./types";
import { useAutosave } from "./use-autosave";
import { useSaveTracker } from "./use-save-tracker";

// C and C2: one screen for an existing client and a new one, edited in place
// and saved as you type. On /clients/new the first keystroke of the name
// creates the client and the URL becomes /clients/<id> without a reload.

const FIELDS_DEBOUNCE_MS = 600;

type Near = { lat: number; lon: number } | null;

export function ClientProfile({
  initial,
  isNew,
  today,
}: {
  initial: ClientProfileData;
  isNew: boolean;
  /** Today (YYYY-MM-DD) from the server, for the trip cards; null on /clients/new, which has none. */
  today: string | null;
}) {
  const { state, report, runOp } = useSaveTracker();

  const [clientId, setClientId] = useState(initial.id);
  const idRef = useRef(initial.id);
  const [name, setName] = useState(initial.name);
  const [savedName, setSavedName] = useState(initial.name);
  const nameAtFocus = useRef(initial.name);
  const [city, setCity] = useState(initial.homeCity);
  const [near, setNear] = useState<Near>(
    initial.homeLat !== null && initial.homeLon !== null ? { lat: initial.homeLat, lon: initial.homeLon } : null,
  );
  const [editing, setEditing] = useState(false);
  const [matched, setMatched] = useState(matchedCount(initial.favorites));

  async function saveFields(patch: Partial<ClientFieldsInput>): Promise<SaveResult> {
    const id = idRef.current;
    if (!id) {
      const created = await createClientAction(patch);
      if (!created.ok) return created;
      idRef.current = created.data.id;
      setClientId(created.data.id);
      window.history.replaceState(null, "", `/clients/${created.data.id}`);
    } else {
      const updated = await updateClientFieldsAction(id, patch);
      if (!updated.ok) return updated;
    }
    if (patch.name) setSavedName(patch.name);
    return { ok: true };
  }

  const fields = useAutosave<ClientFieldsInput>(saveFields, {
    delayMs: FIELDS_DEBOUNCE_MS,
    onStatus: (status) => report("fields", status),
  });

  function onNameChange(next: string) {
    setName(next);
    const trimmed = next.trim();
    if (!trimmed) {
      fields.cancel();
      return;
    }
    fields.schedule({ name: trimmed }, { immediate: !idRef.current && !fields.busy() });
  }

  function onNameCommit() {
    setEditing(false);
    if (!name.trim()) setName(savedName);
    void fields.flush();
  }

  function onNameCancel() {
    setEditing(false);
    const before = nameAtFocus.current;
    if (!before.trim()) return; // A new client's first name: Escape keeps what was typed.
    setName(before);
    if (before.trim() !== savedName.trim()) fields.schedule({ name: before.trim() }, { immediate: true });
    else fields.cancel();
  }

  function onCityCommit(next: HomeCity) {
    setCity(next.name);
    setNear(next.lat !== null && next.lon !== null ? { lat: next.lat, lon: next.lon } : null);
    fields.schedule({ homeCity: next.name || null, homeLat: next.lat, homeLon: next.lon }, { immediate: true });
  }

  const shownName = name.trim() || savedName;
  // Once the client exists the URL is /clients/<id> on both routes (/new replaces it).
  const newTripHref = clientId ? `/clients/${clientId}?new=1&client=${clientId}` : null;
  const tripCount = initial.trips.upcoming.length + initial.trips.past.length;
  const newTripLabel = shownName ? `New trip for ${firstName(shownName)}` : "New trip";

  return (
    <div className="flex flex-col">
      <header className="flex items-center justify-between gap-8 px-7 pt-2 pb-7">
        <div className="flex min-w-0 items-center gap-[22px]">
          <Avatar name={shownName || "New client"} size="profile" tone={isNew ? "dashed" : "soft"} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <nav aria-label="Breadcrumb" className="text-ui text-text-muted">
              <Link href="/clients" className="hover:text-ink">
                Clients
              </Link>
              {" / "}
              <span aria-current="page">{isNew ? "New client" : savedName}</span>
            </nav>
            <InlineText
              value={name}
              onValueChange={onNameChange}
              onFocus={() => {
                nameAtFocus.current = name;
                setEditing(true);
              }}
              onCommit={onNameCommit}
              onCancel={onNameCancel}
              label="Client name"
              placeholder="Client name"
              underline={!name}
              autoFocus={isNew && !initial.id}
              maxLength={120}
              className="self-start"
              inputClassName="font-display text-name leading-[62px] text-ink"
            />
            <p className="flex flex-wrap items-baseline gap-x-1 text-body leading-[22px] text-text-3">
              <span>Lives in</span>
              <HomeCityField
                value={city}
                disabled={!clientId}
                placeholder={clientId ? "add home city" : "add a name first"}
                onEditingChange={setEditing}
                onCommit={onCityCommit}
              />
              {initial.createdAt ? <span>· Client since {monthYear(new Date(initial.createdAt))}</span> : null}
              {tripCount > 0 ? <span>· {plural(tripCount, "trip")} with you</span> : null}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <SaveStatus state={state} editing={editing || (isNew && !clientId)} />
          {newTripHref ? (
            <Link href={newTripHref} className={buttonClasses({ size: "lg", className: "h-11!" })}>
              <Plus size={16} strokeWidth={2.4} aria-hidden />
              {newTripLabel}
            </Link>
          ) : (
            <Button size="lg" disabled className="h-11!" icon={<Plus size={16} strokeWidth={2.4} aria-hidden />}>
              {newTripLabel}
            </Button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,880fr)_minmax(380px,480fr)] items-start gap-6 px-7 pb-7">
        <div className="flex min-w-0 flex-col gap-6">
          <TripsPanel
            clientName={shownName}
            trips={initial.trips}
            newTripHref={newTripHref}
            matchedFavorites={matched}
            today={today}
          />
          <NotesField clientId={clientId} initialNotes={initial.notes} report={report} />
        </div>
        <TastePanel
          clientId={clientId}
          homeCity={city}
          near={near}
          initialFavorites={initial.favorites}
          initialMedia={initial.mediaFavorites}
          initialRules={initial.groundRules}
          initialTags={initial.tasteTags}
          runOp={runOp}
          onMatchedChange={setMatched}
        />
      </div>
    </div>
  );
}
