"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, MapPin, Plus } from "lucide-react";
import { z } from "zod";

import { BookmarkGlyph } from "@/components/ui/bookmark-mark";
import { Button } from "@/components/ui/button";
import { FilmImage } from "@/components/ui/film-image";
import { Popover } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { UnderlineField } from "@/components/ui/underline-field";
import { savePlaceAction } from "@/lib/places/actions";
import { cn } from "@/lib/ui/cn";

import { NOTE_MAX_LENGTH } from "./format";
import { usePlaces } from "./places-provider";

// "Save a place": search places by name (biased to the city in view), pick
// one, add a private note and the city, save. Results already in My places
// say so and cannot be picked again. The server re-reads the place by its id
// before saving, so nothing from the browser lands in the place cache.

const SEARCH_DEBOUNCE_MS = 250;
const MIN_QUERY = 2;

const candidateSchema = z.object({
  entityId: z.string(),
  name: z.string(),
  address: z.string().optional(),
  imageUrl: z.string().optional(),
  place: z.object({ city: z.string().nullable().optional() }).loose().optional(),
});
const searchSchema = z.object({ candidates: z.array(candidateSchema) });
const savedSchema = z.object({ saved: z.record(z.string(), z.object({ id: z.string(), city: z.string() })) });
const localitySchema = z.object({ candidates: z.array(z.object({ lat: z.number(), lon: z.number() })) });

type Candidate = z.infer<typeof candidateSchema>;
type Near = { lat: number; lon: number };

async function getJson<T>(url: string, schema: z.ZodType<T>, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return schema.parse(await response.json());
}

export function SavePlaceButton({
  city,
  near,
  variant = "outline-strong",
}: {
  /** The city in view: biases the search and prefills the city field. */
  city?: string | null;
  /** The middle of the advisor's places in that city, when known. */
  near?: Near | null;
  variant?: "outline-strong" | "primary";
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label="Save a place"
      align="end"
      panelClassName="w-[440px] p-5! text-left"
      trigger={(props) => (
        <Button
          {...props}
          variant={variant}
          icon={<Plus size={14} strokeWidth={2.4} aria-hidden />}
          className="h-9! gap-1.5! px-4!"
        >
          Save a place
        </Button>
      )}
    >
      {open ? <SavePlacePanel city={city ?? null} near={near ?? null} onDone={() => setOpen(false)} /> : null}
    </Popover>
  );
}

function SavePlacePanel({ city, near, onDone }: { city: string | null; near: Near | null; onDone: () => void }) {
  const { notify, tasteChanged } = usePlaces();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [saved, setSaved] = useState<Record<string, { id: string; city: string }>>({});
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchedFor, setSearchedFor] = useState("");
  const [chosen, setChosen] = useState<Candidate | null>(null);
  const [note, setNote] = useState("");
  const [cityValue, setCityValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const nearRef = useRef<Near | null>(near);
  const triedLocality = useRef(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // The picked row unmounts with the results; move focus to the note.
  useEffect(() => {
    if (chosen) noteRef.current?.focus();
  }, [chosen]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setSearchError(null);
      try {
        // No saved places with coordinates in this city yet: look the city up once.
        if (!nearRef.current && city && !triedLocality.current) {
          triedLocality.current = true;
          const { candidates } = await getJson(
            `/api/localities/search?q=${encodeURIComponent(city)}`,
            localitySchema,
            controller.signal,
          ).catch(() => ({ candidates: [] }));
          nearRef.current = candidates[0] ?? null;
        }
        const params = new URLSearchParams({ q, types: "place", take: "6" });
        if (nearRef.current) {
          params.set("lat", String(nearRef.current.lat));
          params.set("lon", String(nearRef.current.lon));
        }
        const { candidates } = await getJson(`/api/entities/search?${params}`, searchSchema, controller.signal);
        const ids = candidates.map((c) => c.entityId);
        const already = ids.length
          ? (await getJson(`/api/advisor-places?entityIds=${encodeURIComponent(ids.join(","))}`, savedSchema, controller.signal)).saved
          : {};
        setResults(candidates);
        setSaved(already);
        setSearchedFor(q);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error(error);
        setSearchError("Search is not answering right now. Try again in a moment.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, city]);

  function choose(candidate: Candidate) {
    setChosen(candidate);
    setNote("");
    setCityValue(candidate.place?.city ?? city ?? "");
    setSaveError(null);
  }

  async function save() {
    if (!chosen) return;
    if (!cityValue.trim()) {
      setSaveError("Add the city this place is in.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    const result = await savePlaceAction({ entityId: chosen.entityId, note, city: cityValue.trim() });
    setSaving(false);
    if (!result.ok) {
      setSaveError(result.error);
      return;
    }
    onDone();
    notify(`Saved ${result.name} to your places`);
    tasteChanged();
  }

  if (chosen) {
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="flex items-center gap-3.5">
          <Thumb src={chosen.imageUrl} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="truncate text-body-lg leading-5 font-semibold text-ink">{chosen.name}</p>
            {chosen.address ? <p className="truncate text-ui-sm text-text-2">{chosen.address}</p> : null}
          </div>
        </div>

        <label className="flex flex-col gap-2">
          <span className="label-caps leading-[14px] text-text-2">Your note</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Ask for the corner table"
            maxLength={NOTE_MAX_LENGTH}
            rows={3}
            ref={noteRef}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void save();
              }
            }}
            className="w-full resize-none rounded-row border border-pill-outline bg-surface-raised px-3.5 py-3 text-body leading-[21px] text-ink placeholder:text-text-muted focus-visible:border-glow focus-visible:outline-none"
          />
          <span className="text-ui-sm text-text-2">Only you see this note. It shows on the card when this place comes up on a trip.</span>
        </label>

        <div className="flex flex-col gap-1">
          <span className="label-caps leading-[14px] text-text-2">City</span>
          <UnderlineField
            value={cityValue}
            onValueChange={setCityValue}
            label="City"
            placeholder="Lisbon"
            icon={<MapPin size={16} strokeWidth={2} />}
            clearLabel="Clear city"
          />
        </div>

        {saveError ? (
          <p role="alert" className="text-ui-sm text-amber">
            {saveError}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<ArrowLeft size={14} strokeWidth={2} aria-hidden />}
            onClick={() => setChosen(null)}
            disabled={saving}
          >
            Back to results
          </Button>
          <Button type="submit" loading={saving}>
            Save to my places
          </Button>
        </div>
      </form>
    );
  }

  const q = query.trim();
  const showResults = q.length >= MIN_QUERY && searchedFor === q;
  return (
    <div className="flex flex-col gap-3">
      <UnderlineField
        value={query}
        onValueChange={setQuery}
        label="Search for a place"
        placeholder={city ? `Search places in ${city}` : "Search for a place by name"}
        autoFocus
        clearLabel="Clear search"
      />
      <div aria-live="polite" className="flex min-h-10 flex-col">
        {q.length < MIN_QUERY ? (
          <p className="px-1 py-2 text-ui-sm text-text-2">
            Type a name{city ? `. Results near ${city} come first` : ""}.
          </p>
        ) : searchError ? (
          <p role="alert" className="px-1 py-2 text-ui-sm text-amber">
            {searchError}
          </p>
        ) : loading && !showResults ? (
          <p className="flex items-center gap-2 px-1 py-2 text-ui-sm text-text-2">
            <Spinner size={14} /> Searching
          </p>
        ) : showResults && results.length === 0 ? (
          <p className="px-1 py-2 text-ui-sm text-text-2">
            No places match {"“"}
            {q}
            {"”"}. Check the spelling or add the neighborhood.
          </p>
        ) : (
          <ul className={cn("-mx-2 flex flex-col", loading && "opacity-60")}>
            {results.map((candidate) => {
              const already = saved[candidate.entityId];
              return (
                <li key={candidate.entityId}>
                  <button
                    type="button"
                    disabled={Boolean(already)}
                    onClick={() => choose(candidate)}
                    className="flex w-full items-center gap-3.5 rounded-row px-2 py-2 text-left transition-colors hover:bg-canvas focus-visible:bg-canvas focus-visible:-outline-offset-2 disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <Thumb src={candidate.imageUrl} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-body leading-5 font-semibold text-ink">{candidate.name}</span>
                      {already ? (
                        <span className="flex items-center gap-1.5 text-ui-sm text-text-2">
                          <BookmarkGlyph size={11} /> Already in your places
                        </span>
                      ) : candidate.address ? (
                        <span className="truncate text-ui-sm text-text-2">{candidate.address}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** A 48px photo; decorative, the name sits next to it. */
function Thumb({ src }: { src?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span aria-hidden className="relative size-12 shrink-0 overflow-hidden rounded-row bg-avatar">
      {src && !failed ? <FilmImage src={src} alt="" sizes="48px" onError={() => setFailed(true)} /> : null}
    </span>
  );
}
