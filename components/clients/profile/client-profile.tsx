"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";

import { updateClientFieldsAction, type ClientFieldsInput } from "@/lib/clients/actions";

import type { SaveResult } from "../autosave";
import { firstName, monthYear, plural } from "../format";
import { InitialsAvatar } from "../initials-avatar";
import { useClientModal } from "../modal/client-modal";
import { FavoritesSection } from "./favorites-section";
import { GroundRules } from "./ground-rules";
import { HomeCityField, type HomeCity } from "./home-city-field";
import { InlineText } from "./inline-text";
import { NotesField } from "./notes-field";
import { ProfileFooter } from "./profile-footer";
import { SaveStatus } from "./save-status";
import { TasteCard } from "./taste-card";
import type { ClientProfileData } from "./types";
import { useAutosave } from "./use-autosave";
import { useClientTaste } from "./use-client-taste";
import { useSaveTracker } from "./use-save-tracker";

// C2 the client profile, in its sheet over the Clients list: who they are
// (name and home city edit in place), the places, artists and films they
// love, the taste those add up to, your private notes and ground rules, and
// their trips. Everything saves as you type; the header says so.

const FIELDS_DEBOUNCE_MS = 600;

type Near = { lat: number; lon: number } | null;

export function ClientProfile({ initial, today }: { initial: ClientProfileData; today: string }) {
  const modal = useClientModal();
  const { state, report, runOp } = useSaveTracker();
  const clientId = initial.id;

  const [name, setName] = useState(initial.name);
  const [savedName, setSavedName] = useState(initial.name);
  const nameAtFocus = useRef(initial.name);
  const [city, setCity] = useState(initial.homeCity);
  const [near, setNear] = useState<Near>(
    initial.homeLat !== null && initial.homeLon !== null ? { lat: initial.homeLat, lon: initial.homeLon } : null,
  );

  const taste = useClientTaste({
    clientId,
    near,
    initialFavorites: initial.favorites,
    initialMedia: initial.mediaFavorites,
    initialRules: initial.groundRules,
    initialTags: initial.tasteTags,
    runOp,
  });

  async function saveFields(patch: Partial<ClientFieldsInput>): Promise<SaveResult> {
    const updated = await updateClientFieldsAction(clientId, patch);
    if (!updated.ok) return updated;
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
    fields.schedule({ name: trimmed });
  }

  function onNameCommit() {
    if (!name.trim()) setName(savedName);
    void fields.flush();
  }

  function onNameCancel() {
    const before = nameAtFocus.current;
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
  const first = firstName(shownName);
  const tripCount = initial.trips.upcoming.length + initial.trips.past.length;
  const photos = taste.favorites.flatMap((favorite) =>
    favorite.match === "resolved" && favorite.imageUrl ? [favorite.imageUrl] : [],
  );

  return (
    <div className="flex min-h-0 grow flex-col">
      <div className="flex min-h-0 grow flex-col gap-6 overflow-y-auto px-10 pt-7 pb-8 max-lg:px-7">
        <header className="flex items-center justify-between gap-6 border-b border-ink/8 pb-5">
          <div className="flex min-w-0 items-center gap-[18px]">
            <InitialsAvatar name={shownName} size={64} tone="avatar" />
            <div className="flex min-w-0 flex-col gap-1">
              <InlineText
                value={name}
                onValueChange={onNameChange}
                onFocus={() => {
                  nameAtFocus.current = name;
                }}
                onCommit={onNameCommit}
                onCancel={onNameCancel}
                label="Client name"
                placeholder="Client name"
                maxLength={120}
                className="self-start"
                inputClassName="font-display text-[40px] leading-[44px] tracking-[-0.02em] text-ink"
              />
              <p className="flex flex-wrap items-baseline gap-x-1 text-body leading-5 text-text-2">
                <span>Lives in</span>
                <HomeCityField
                  value={city}
                  disabled={false}
                  placeholder="add home city"
                  onEditingChange={() => undefined}
                  onCommit={onCityCommit}
                />
                {initial.createdAt ? <span>· Client since {monthYear(new Date(initial.createdAt))}</span> : null}
                {tripCount > 0 ? <span>· {plural(tripCount, "trip")} with you</span> : null}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-4">
            <SaveStatus state={state} />
            <button
              type="button"
              aria-label="Close"
              title="Close"
              onClick={() => modal.close()}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-pill border border-ink/16 text-ink transition-colors hover:border-ink hover:bg-ink/5"
            >
              <X size={16} strokeWidth={2} aria-hidden />
            </button>
          </div>
        </header>

        <div className="grid grid-cols-[minmax(0,688fr)_minmax(280px,360fr)] items-start gap-8 max-lg:gap-6">
          <FavoritesSection title={`Places ${first} loves`} near={near} taste={taste} />
          <aside className="flex min-w-0 flex-col gap-4 pt-[60px]">
            <TasteCard first={first} tags={taste.tags} matched={taste.matched} photos={photos} updating={taste.tagsUpdating} />
            <NotesField clientId={clientId} initialNotes={initial.notes} report={report} />
            <GroundRules rules={taste.rules} disabled={false} onChange={taste.saveRules} />
          </aside>
        </div>
      </div>

      <ProfileFooter
        first={first}
        trips={initial.trips}
        today={today}
        newTripHref={`/clients?new=1&client=${encodeURIComponent(clientId)}`}
      />
    </div>
  );
}
