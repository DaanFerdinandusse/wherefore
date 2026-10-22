"use client";

import { useState } from "react";

import { PlaceProfile } from "@/components/trip/place-profile/place-profile";
import { Button } from "@/components/ui/button";
import type { ItinerarySlot, TripPlaceCard, TripSnapshot } from "@/lib/contracts";
import type { TripPlaceProfile } from "@/lib/trips/profile-types";

export type LabCase = {
  id: string;
  title: string;
  trip: TripSnapshot["trip"];
  clientName: string;
  slots: ItinerarySlot[];
  card: TripPlaceCard;
  profile: TripPlaceProfile;
};

// The lab's state: which case is open, and the local copies the actions
// change (slots, the card's "Your place", the log of calls).
export function ProfileLab({ cases }: { cases: LabCase[] }) {
  const [openId, setOpenId] = useState<string | null>(cases[0]?.id ?? null);
  const [cards, setCards] = useState<Record<string, TripPlaceCard>>(() =>
    Object.fromEntries(cases.map((c) => [c.id, c.card])),
  );
  const [slots, setSlots] = useState<Record<string, ItinerarySlot[]>>(() =>
    Object.fromEntries(cases.map((c) => [c.id, c.slots])),
  );
  const [log, setLog] = useState<string[]>([]);
  const note = (line: string) => setLog((lines) => [line, ...lines].slice(0, 8));

  return (
    <main className="flex min-h-dvh flex-col gap-6 bg-canvas p-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-title">Profile lab</h1>
        <p className="text-body text-text-2">
          The place profile sheet on real and fixture data. Actions change local state only.
        </p>
      </header>
      <ul className="flex flex-wrap gap-2">
        {cases.map((c) => (
          <li key={c.id}>
            <Button variant={openId === c.id ? "primary" : "outline"} onClick={() => setOpenId(c.id)}>
              {c.title}
            </Button>
          </li>
        ))}
      </ul>
      {log.length > 0 ? (
        <ol className="flex flex-col gap-1 text-ui text-text-3">
          {log.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
      ) : null}

      {cases.map((c) => {
        const card = cards[c.id] ?? c.card;
        return (
          <PlaceProfile
            key={c.id}
            open={openId === c.id}
            onClose={() => setOpenId(null)}
            trip={c.trip}
            card={card}
            clientName={c.clientName}
            slots={slots[c.id] ?? []}
            initialProfile={c.profile}
            onAddToSlot={(tripPlaceId, day, slot) => {
              note(`Add ${card.name} to day ${day}, ${slot}`);
              setSlots((all) => ({
                ...all,
                [c.id]: [
                  ...(all[c.id] ?? []).filter((s) => !(s.day === day && s.slot === slot) && s.tripPlaceId !== tripPlaceId),
                  { id: `${day}-${slot}`, day, slot, tripPlaceId, note: "", position: 0 },
                ],
              }));
            }}
            onRemove={(tripPlaceId, replace) => note(`Remove ${tripPlaceId}${replace ? " and replace it" : ""}`)}
            onToggleMyPlace={(_tripPlaceId, saved) => {
              note(saved ? `Save ${card.name} to my places` : `Remove ${card.name} from my places`);
              setCards((all) => ({
                ...all,
                [c.id]: {
                  ...card,
                  yourPlace: saved
                    ? { advisorPlaceId: c.profile.advisorPlace?.id ?? "local", note: c.profile.advisorPlace?.note ?? "" }
                    : undefined,
                },
              }));
            }}
            onEditNote={(advisorPlaceId, text) => {
              note(`Note on ${advisorPlaceId}: ${text}`);
              setCards((all) => ({
                ...all,
                [c.id]: card.yourPlace ? { ...card, yourPlace: { ...card.yourPlace, note: text } } : card,
              }));
            }}
          />
        );
      })}
    </main>
  );
}
