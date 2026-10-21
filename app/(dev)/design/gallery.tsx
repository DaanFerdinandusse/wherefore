"use client";

import { useState, type ReactNode } from "react";
import { Calendar as CalendarIcon, ChevronDown, LayoutGrid, Map as MapIcon, Mic, Paperclip, Plus, Search, Sparkle, X, ArrowUp } from "lucide-react";

import attaboy from "@/design/images/attaboy.jpg";
import buna from "@/design/images/buna.jpg";
import contramar from "@/design/images/contramar.jpg";
import contramarDish from "@/design/images/contramar-dish.jpg";
import contramarRoom from "@/design/images/contramar-room.jpg";
import heroCdmx from "@/design/images/hero-cdmx.jpg";
import lilia from "@/design/images/lilia.jpg";
import limantour from "@/design/images/limantour.jpg";
import park from "@/design/images/park.jpg";
import rosetta from "@/design/images/rosetta.jpg";
import viaCarota from "@/design/images/via-carota.jpg";

import { AppBar } from "@/components/shell/app-bar";
import { PageHeader } from "@/components/shell/page-header";
import type { SearchResults } from "@/components/shell/search-results";
import { TripTopBar, type TripView } from "@/components/shell/trip-top-bar";
import { ArchPhoto } from "@/components/ui/arch-photo";
import { Avatar } from "@/components/ui/avatar";
import { BecauseRow } from "@/components/ui/because-row";
import { BookmarkMark } from "@/components/ui/bookmark-mark";
import { Button } from "@/components/ui/button";
import { Calendar, type DatesMode } from "@/components/ui/calendar";
import { EmptyState } from "@/components/ui/empty-state";
import { FilmImage } from "@/components/ui/film-image";
import { FilterPill } from "@/components/ui/filter-pill";
import { GlassDock } from "@/components/ui/glass-dock";
import { IconButton } from "@/components/ui/icon-button";
import { MatchPill } from "@/components/ui/match-pill";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { PhotoCard } from "@/components/ui/photo-card";
import { Pill } from "@/components/ui/pill";
import { Popover } from "@/components/ui/popover";
import { Rule } from "@/components/ui/rule";
import { ScoreDot } from "@/components/ui/score-dot";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { Sheet } from "@/components/ui/sheet";
import { SkeletonCard } from "@/components/ui/skeleton-card";
import { StarburstOrnament } from "@/components/ui/starburst-ornament";
import { Stepper } from "@/components/ui/stepper";
import { StreamingCursor } from "@/components/ui/streaming-cursor";
import { Switch } from "@/components/ui/switch";
import { Tabs } from "@/components/ui/tabs";
import { Toast, ToastAction } from "@/components/ui/toast";
import { UnderlineField } from "@/components/ui/underline-field";
import { NewFromAskBadge, YourPlaceBadge } from "@/components/ui/your-place-badge";
import { YourNoteRow } from "@/components/ui/your-note-row";
import type { DateRange, YearMonth } from "@/lib/ui/dates";

const noop = () => undefined;

const SEARCH_RESULTS: SearchResults = {
  clients: [
    { id: "ana", title: "Ana Ruiz", subtitle: "New York · 6 favorites · Mexico City in Nov", href: "/clients/ana" },
    { id: "marcus", title: "Marcus Lee", subtitle: "London · 5 favorites · Tokyo in Dec", href: "/clients/marcus" },
  ],
  trips: [{ id: "cdmx", title: "Ana Ruiz · Mexico City", subtitle: "12 to 16 Nov · 4 nights", href: "/trips/cdmx", imageUrl: park.src }],
  places: [{ id: "contramar", title: "Contramar", subtitle: "Seafood · Roma Norte", href: "/places", imageUrl: contramar.src }],
};

function Section({ id, title, artboard, children }: { id: string; title: string; artboard: string; children: ReactNode }) {
  return (
    <section id={id} className="flex flex-col gap-6 border-t border-rule px-7 py-10">
      <div className="flex items-baseline justify-between gap-6">
        <h2 className="font-display text-section text-ink">{title}</h2>
        <p className="label-caps text-text-2">{artboard}</p>
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      {label ? <p className="text-meta font-medium text-text-2">{label}</p> : null}
      <div className="flex flex-wrap items-center gap-4">{children}</div>
    </div>
  );
}

function ShellDemos() {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<TripView>("discover");
  const [homeView, setHomeView] = useState("board");
  const [filter, setFilter] = useState("all");
  const filtered: SearchResults = query.trim()
    ? SEARCH_RESULTS
    : { clients: [], trips: [], places: [] };

  return (
    <>
      <Section id="app-bar" title="App bar and page header" artboard="A Trips overview (home)">
        <div className="-mx-7 bg-canvas">
          <AppBar
            userName="Sofía Marín"
            active="trips"
            query={query}
            onQueryChange={setQuery}
            results={filtered}
            onSelectResult={noop}
            onNewTrip={noop}
            onSignOut={noop}
          />
          <PageHeader
            title="Good morning, Sofía"
            subtitle="8 trips in progress. Priya is on day 2 in Lisbon, and Marcus hasn't opened his Tokyo plan yet."
            actions={
              <SegmentedToggle
                label="Trips view"
                variant="quiet"
                value={homeView}
                onValueChange={setHomeView}
                options={[
                  { value: "board", label: "Board" },
                  { value: "calendar", label: "Calendar" },
                  { value: "list", label: "List" },
                ]}
              />
            }
          />
        </div>
      </Section>

      <Section id="trip-bar" title="Trip top bar" artboard="02 Discover board">
        <div className="-mx-7 bg-canvas">
          <TripTopBar
            trip={{ title: "Ana Ruiz · Mexico City", datesLabel: "12 to 16 Nov · 4 nights", imageSrc: park }}
            otherTrips={[
              { id: "lisbon", title: "Priya Shah · Lisbon", subtitle: "20 to 25 Oct · traveling now", href: "/trips/lisbon", imageSrc: heroCdmx },
              { id: "tokyo", title: "Marcus Lee · Tokyo", subtitle: "3 to 9 Dec", href: "/trips/tokyo", imageSrc: rosetta },
            ]}
            view={view}
            onViewChange={setView}
            onHowWeGotThis={noop}
            onShare={noop}
            userName="Sofía Marín"
            onSignOut={noop}
          />
          <PageHeader
            title="18 places for Ana"
            subtitle="Matched to the 5 places she loves. 3 are your own places."
            actions={
              <>
                {[
                  ["all", "All", 18],
                  ["eat", "Eat", 7],
                  ["drink", "Drink", 4],
                  ["coffee", "Coffee", 3],
                  ["see", "See", 2],
                  ["stay", "Stay", 2],
                ].map(([key, label, count]) => (
                  <FilterPill
                    key={key}
                    label={String(label)}
                    count={Number(count)}
                    active={filter === key}
                    onClick={() => setFilter(String(key))}
                  />
                ))}
              </>
            }
          />
        </div>
      </Section>
    </>
  );
}

function ControlDemos() {
  const [tab, setTab] = useState("discover");
  const [underline, setUnderline] = useState("about");
  const [boardView, setBoardView] = useState("board");
  const [mine, setMine] = useState("mine");
  const [blend, setBlend] = useState(false);
  const [blendOn, setBlendOn] = useState(true);
  const [saved, setSaved] = useState(true);
  const [savedOff, setSavedOff] = useState(false);
  const [field, setField] = useState("");
  const [filled, setFilled] = useState("Contramar");
  const [askActive, setAskActive] = useState(true);

  return (
    <>
      <Section id="buttons" title="Buttons" artboard="A, 02, 03, E, F3">
        <Row label="Primary, md and lg; sm is a dock suggestion">
          <Button icon={<Plus size={16} strokeWidth={2} aria-hidden />}>New trip</Button>
          <Button size="lg" icon={<Plus size={16} strokeWidth={2} aria-hidden />} className="w-60">
            Add to itinerary
          </Button>
          <Button size="sm">Add Contramar to Day 2 lunch</Button>
          <Button>Next: travelers</Button>
        </Row>
        <Row label="Outline, outline-strong, ghost, soft, chip">
          <Button variant="outline">Profile</Button>
          <Button variant="outline" size="sm" className="px-3!">
            Add favorites
          </Button>
          <Button variant="outline-strong" size="sm" className="h-[35px]! px-4! text-ui!" icon={<Plus size={14} strokeWidth={2} aria-hidden />}>
            Save a place
          </Button>
          <Button variant="ghost" size="lg" className="px-4!">
            Not for Ana
          </Button>
          <Button
            variant="soft"
            size="lg"
            icon={<CalendarIcon size={16} strokeWidth={2} aria-hidden />}
            className="px-[18px]!"
          >
            Day 2 · Lunch
            <ChevronDown size={14} strokeWidth={2} aria-hidden className="text-text-muted" />
          </Button>
          <Button variant="chip" size="sm">
            Show 3 other lunch options
          </Button>
        </Row>
        <Row label="Loading and disabled (no width change)">
          <Button loading>Share itinerary</Button>
          <Button variant="outline" loading>
            Profile
          </Button>
          <Button disabled>Create trip</Button>
          <Button variant="outline" disabled>
            Profile
          </Button>
        </Row>
        <Row label="Icon buttons">
          <IconButton label="Add Rosetta to the itinerary" icon={<Plus size={16} strokeWidth={2} />} />
          <IconButton label="Close" variant="soft" icon={<X size={16} strokeWidth={2} />} />
          <IconButton label="Close new trip" variant="outline" size={40} icon={<X size={16} strokeWidth={2} />} />
          <IconButton label="Attach a file" variant="ghost" size={40} icon={<Paperclip size={18} strokeWidth={2} />} />
          <IconButton label="Dictate" variant="ghost" size={40} icon={<Mic size={18} strokeWidth={2} />} />
          <IconButton label="Send" variant="ink" size={44} icon={<ArrowUp size={18} strokeWidth={2} />} />
        </Row>
      </Section>

      <Section id="pills" title="Pills and filters" artboard="02 Discover board, F7, 03 Place profile">
        <Row label="Pill (taste tags), sm and md">
          {["Seafood", "Lively", "Long lunches", "Good for groups", "Natural light"].map((tag) => (
            <Pill key={tag}>{tag}</Pill>
          ))}
          <Pill size="md">Lisbon 11</Pill>
        </Row>
        <Row label="FilterPill: inactive, active, running ask with spinner, done ask with count and ×">
          <FilterPill label="All" count={20} />
          <FilterPill label="Eat" count={8} active />
          <FilterPill
            label="Natural wine · Sat"
            icon={<Sparkle size={12} strokeWidth={2} fill="currentColor" aria-hidden />}
            loading
            active
          />
          <FilterPill
            label="Natural wine · Sat"
            icon={<Sparkle size={12} strokeWidth={2} fill="currentColor" aria-hidden />}
            count={12}
            active={askActive}
            onClick={() => setAskActive((v) => !v)}
            onRemove={noop}
          />
        </Row>
      </Section>

      <Section id="toggles" title="Tabs, toggles, switch" artboard="02 Discover board, E My places, 03 Place profile">
        <Row label="Tabs: pill (trip top bar) and underline">
          <Tabs
            label="Trip views"
            value={tab}
            onValueChange={setTab}
            items={[
              { value: "discover", label: "Discover" },
              { value: "itinerary", label: "Itinerary" },
              { value: "traveler", label: "Traveler view" },
            ]}
          />
          <Tabs
            label="Place sections"
            variant="underline"
            value={underline}
            onValueChange={setUnderline}
            items={[
              { value: "about", label: "About" },
              { value: "hours", label: "Hours" },
              { value: "reviews", label: "Reviews" },
            ]}
          />
        </Row>
        <Row label="SegmentedToggle: glass over a photo, outline, quiet">
          <div className="relative flex h-24 w-[360px] items-center justify-center overflow-hidden rounded-photo">
            <FilmImage src={limantour} alt="" sizes="360px" />
            <SegmentedToggle
              label="View"
              variant="glass"
              value={boardView}
              onValueChange={setBoardView}
              className="relative"
              options={[
                { value: "board", label: "Board", icon: <LayoutGrid size={16} strokeWidth={2} aria-hidden /> },
                { value: "map", label: "Map", icon: <MapIcon size={16} strokeWidth={2} aria-hidden /> },
              ]}
            />
          </div>
          <SegmentedToggle
            label="Whose places"
            value={mine}
            onValueChange={setMine}
            options={[
              { value: "mine", label: "Mine 52" },
              { value: "team", label: "Team 140" },
            ]}
          />
        </Row>
        <Row label="Switch: track off and on, pill on and off">
          <div className="flex w-[311px] items-center justify-between">
            <span className="text-body-lg leading-5 font-semibold text-ink">Blend my taste into searches</span>
            <Switch label="Blend my taste into searches" checked={blend} onCheckedChange={setBlend} />
          </div>
          <Switch label="Blend my taste into searches" checked={blendOn} onCheckedChange={setBlendOn} />
          <Switch variant="pill" label="In my places" checked={saved} onCheckedChange={setSaved} />
          <Switch variant="pill" label="In my places" checked={savedOff} onCheckedChange={setSavedOff} />
        </Row>
        <Row label="UnderlineField: empty and filled">
          <UnderlineField
            className="w-[420px]"
            label="Search clients, trips or places"
            placeholder="Search clients, trips or places"
            value={field}
            onValueChange={setField}
          />
          <UnderlineField className="w-[420px]" label="Add a place" placeholder="Add a place" value={filled} onValueChange={setFilled} />
        </Row>
      </Section>
    </>
  );
}

function IdentityDemos() {
  return (
    <>
      <Section id="avatars" title="Avatars" artboard="A, F1, F4, C2">
        <Row>
          <Avatar name="Tom and Elise Varga" size={26} />
          <Avatar name="Sofía Marín" size={38} tone="ink" />
          <Avatar name="Ana Ruiz" size={44} />
          <Avatar name="Clara" size={44} tone="dashed" />
          <Avatar name="Sofía Marín" size={48} tone="ink" />
          <Avatar name="Lena Okafor" size="profile" tone="dashed" />
          <Avatar name="Ana Ruiz" size="profile" />
          <Avatar name="Ana Ruiz" size={44} src={viaCarota} />
        </Row>
      </Section>

      <Section id="cards" title="Photo cards" artboard="02 Discover board, F7">
        <div className="grid grid-cols-[640px_340px] gap-5">
          <PhotoCard
            src={contramar}
            alt="Grilled fish on a table at Contramar"
            name="Contramar"
            typeLine="Seafood · Roma Norte · $$$"
            size="lg"
            className="h-[340px]"
            priority
            badges={
              <>
                <MatchPill score={94} />
                <YourPlaceBadge />
              </>
            }
            action={
              <Button variant="light" icon={<Plus size={16} strokeWidth={2} aria-hidden />} className="h-[38px]! px-4!">
                Add to Day 2
              </Button>
            }
          >
            <BecauseRow
              photos={[
                { src: viaCarota, alt: "Via Carota" },
                { src: lilia, alt: "Lilia" },
              ]}
              text="Because she loves Via Carota and Lilia"
            />
            <YourNoteRow note="Book the 1:30 sitting. The tuna tostadas sell out by 3." />
          </PhotoCard>
          <PhotoCard
            src={rosetta}
            alt="Pasta at Rosetta"
            name="Rosetta"
            typeLine="Italian · Roma Norte · $$$"
            className="h-[340px]"
            badges={<MatchPill score={91} />}
            action={<IconButton label="Add Rosetta to the itinerary" icon={<Plus size={16} strokeWidth={2} />} />}
          >
            <BecauseRow size={24} photos={[{ src: lilia, alt: "Lilia" }]} text="Because she loves Lilia" />
          </PhotoCard>
        </div>
        <div className="grid grid-cols-[320px_320px_320px] gap-5">
          <PhotoCard
            src={limantour}
            alt="A bartender pours a martini"
            name="Licorería Limantour"
            typeLine="Cocktail bar · Roma Norte · $$"
            className="h-[300px]"
            badges={
              <>
                <MatchPill score={89} />
                <YourPlaceBadge />
              </>
            }
            action={<IconButton label="Add Licorería Limantour to the itinerary" icon={<Plus size={16} strokeWidth={2} />} />}
          >
            <BecauseRow size={24} photos={[{ src: attaboy, alt: "Attaboy" }]} text="Because she loves Attaboy" />
          </PhotoCard>
          <PhotoCard
            src={buna}
            alt="Coffee bar at Buna"
            name="Buna"
            typeLine="Coffee · Roma Norte · $"
            size="sm"
            highlighted
            className="h-[300px]"
            badges={
              <>
                <MatchPill score={84} />
                <NewFromAskBadge />
              </>
            }
            action={<IconButton label="Add Buna to the itinerary" icon={<Plus size={16} strokeWidth={2} />} />}
          />
          <SkeletonCard clientName="Ana" className="h-[300px]" />
        </div>
      </Section>

      <Section id="arch" title="Arch photo" artboard="03 Place profile">
        <div className="flex flex-col gap-3">
          <ArchPhoto src={contramar} alt="Contramar dining room" caption="1 of 214 photos" className="h-[520px] w-[580px]" />
          <div className="flex gap-3">
            <div className="relative h-[296px] w-[284px] overflow-hidden rounded-photo">
              <FilmImage src={contramarDish} alt="Grilled fish plate" sizes="284px" />
            </div>
            <div className="relative h-[296px] w-[284px] overflow-hidden rounded-photo">
              <FilmImage src={contramarRoom} alt="Dining area" sizes="284px" />
            </div>
          </div>
        </div>
      </Section>

      <Section id="marks" title="Scores and marks" artboard="02, 02b Discover map, F7">
        <div className="relative flex h-28 items-center gap-4 overflow-hidden rounded-photo px-6">
          <FilmImage src={contramar} alt="" sizes="1000px" />
          <div aria-hidden className="photo-shade absolute inset-0" />
          <div className="relative flex items-center gap-4">
            <MatchPill score={94} />
            <MatchPill score={94} tone="light" />
            <MatchPill score={91} showLabel={false} />
            <YourPlaceBadge />
            <NewFromAskBadge />
            <MatchPill score={91} size="xs" />
          </div>
        </div>
        <Row label="Map: score chip, score dots, bookmark marks">
          <MatchPill score={94} size="sm" />
          <ScoreDot score={82} />
          <ScoreDot score={79} highlighted />
          <BookmarkMark size={24} ring />
          <BookmarkMark size={20} />
          <BookmarkMark size={26} />
          <BookmarkMark size={28} />
          <BookmarkMark size={34} />
          <BookmarkMark size={36} />
        </Row>
        <Row label="Your note row on a surface (map preview card)">
          <div className="w-[280px]">
            <YourNoteRow tone="surface" label="Your place. Your note" note="Book the 1:30 sitting." />
          </div>
          <div className="w-[280px]">
            <BecauseRow
              tone="surface"
              photos={[
                { src: viaCarota, alt: "Via Carota" },
                { src: lilia, alt: "Lilia" },
              ]}
              text="Because she loves Via Carota and Lilia"
            />
          </div>
        </Row>
        <Row label="Streaming text and hairline rules">
          <p className="max-w-[640px] text-body leading-[22px] text-ink">
            Black Sheep is the strongest so far at 91, and Senhor Uva is one of your places. Reading why the oth
            <StreamingCursor />
          </p>
        </Row>
        <div className="flex w-[640px] flex-col gap-4">
          <Rule />
          <Rule strong />
        </div>
      </Section>
    </>
  );
}

function OverlayDemos() {
  const [forWho, setForWho] = useState(false);
  const [travelersOpen, setTravelersOpen] = useState(false);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [sheet, setSheet] = useState<"right" | "center" | null>(null);
  const [month, setMonth] = useState<YearMonth>({ year: 2027, month: 4 });
  const [range, setRange] = useState<DateRange>({ start: "2027-05-14", end: "2027-05-18" });
  const [mode, setMode] = useState<DatesMode>("exact");
  const [inPlaces, setInPlaces] = useState(true);
  const [dockView, setDockView] = useState("board");

  return (
    <>
      <Section id="menus" title="Menu and popover" artboard="F1 New trip: for who, F4 New trip: travelers">
        <div className="flex h-[520px] items-start gap-8">
          <Menu
            open={forWho}
            onOpenChange={setForWho}
            label="Choose a client"
            panelClassName="w-[460px] pt-3"
            trigger={(props) => (
              <button {...props} type="button" className="flex w-[262px] flex-col rounded-pill border border-rule-strong bg-surface-raised px-6 py-3.5 text-left">
                <span className="label-caps text-ink">For who</span>
                <span className="text-body-lg text-text-muted">Choose a client</span>
              </button>
            )}
          >
            <MenuLabel>Recent clients</MenuLabel>
            <MenuItem chevron leading={<Avatar name="Ana Ruiz" size={44} />} title="Ana Ruiz" description="New York · 6 favorites · Mexico City in Nov" onSelect={() => setForWho(false)} />
            <MenuItem chevron leading={<Avatar name="Priya Shah" size={44} />} title="Priya Shah" description="San Francisco · 9 favorites · in Lisbon now" onSelect={() => setForWho(false)} />
            <MenuItem chevron leading={<Avatar name="Marcus Lee" size={44} />} title="Marcus Lee" description="London · 5 favorites · Tokyo in Dec" onSelect={() => setForWho(false)} />
            <MenuItem chevron leading={<Avatar name="Tom and Elise Varga" size={44} />} title="Tom and Elise Varga" description="Amsterdam · 7 favorites · Copenhagen in Jan" onSelect={() => setForWho(false)} />
            <MenuSeparator />
            <MenuItem
              chevron
              leading={
                <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill border border-pill-outline">
                  <Search size={16} strokeWidth={2} aria-hidden />
                </span>
              }
              title="Find a client"
              description="Search all 24 by name or home city"
            />
            <MenuItem
              leading={
                <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill bg-ink text-surface">
                  <Plus size={16} strokeWidth={2} aria-hidden />
                </span>
              }
              title="New client"
              description="Name, home city and the places they love"
            />
          </Menu>

          <Popover
            open={travelersOpen}
            onOpenChange={setTravelersOpen}
            label="Who is traveling"
            panelClassName="w-[460px] pt-5 pb-4"
            trigger={(props) => (
              <button {...props} type="button" className="flex w-[197px] flex-col rounded-pill border border-rule-strong bg-surface-raised px-6 py-3.5 text-left">
                <span className="label-caps text-ink">Travelers</span>
                <span className="text-body-lg text-ink">Ana and Clara</span>
              </button>
            )}
          >
            <p className="label-caps px-3 pb-2 leading-[14px] text-text-2">Who is traveling</p>
            <div className="flex items-center gap-3.5 px-3 py-2.5">
              <Avatar name="Ana Ruiz" size={44} />
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-body-lg leading-5 font-semibold">Ana Ruiz</span>
                <span className="text-ui-sm text-text-2">Client · her 6 favorites drive the search</span>
              </span>
            </div>
            <div className="flex items-center gap-3.5 px-3 py-2.5">
              <Avatar name="Clara" size={44} tone="dashed" />
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-body-lg leading-5 font-semibold">Clara</span>
                <span className="text-ui-sm text-amber">Guest · no favorites yet</span>
              </span>
              <Button variant="outline" size="sm" className="h-[30px]! px-3!">
                Add favorites
              </Button>
            </div>
            <div className="mt-1 flex flex-col gap-0.5 border-t border-rule px-3 pt-3">
              <Stepper label="Adults" value={adults} onValueChange={setAdults} min={1} />
              <Stepper label="Children" value={children} onValueChange={setChildren} />
            </div>
          </Popover>
        </div>
      </Section>

      <Section id="calendar" title="Calendar" artboard="F3 New trip: when">
        <div className="w-[720px] rounded-menu border border-rule-strong bg-surface px-8 pt-5 pb-6 shadow-menu">
          <Calendar
            month={month}
            onMonthChange={setMonth}
            value={range}
            onValueChange={setRange}
            mode={mode}
            onModeChange={setMode}
            onClear={() => setRange({})}
            action={
              <Button size="sm" className="h-[38px]! px-[18px]! text-ui!">
                Next: travelers
              </Button>
            }
          />
        </div>
      </Section>

      <Section id="dock" title="Glass dock" artboard="02 Discover board">
        <div className="relative h-[420px] w-[1000px] overflow-hidden rounded-photo">
          <FilmImage src={heroCdmx} alt="" sizes="1000px" />
          <GlassDock
            className="absolute bottom-6 left-10"
            toggle={
              <SegmentedToggle
                label="View"
                variant="glass"
                value={dockView}
                onValueChange={setDockView}
                options={[
                  { value: "board", label: "Board", icon: <LayoutGrid size={16} strokeWidth={2} aria-hidden /> },
                  { value: "map", label: "Map", icon: <MapIcon size={16} strokeWidth={2} aria-hidden /> },
                ]}
              />
            }
          >
            <div className="flex items-start gap-3 px-1">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-pill bg-ink text-white">
                <Sparkle size={16} strokeWidth={2} fill="currentColor" aria-hidden />
              </span>
              <div className="flex flex-1 flex-col gap-2.5">
                <p className="text-body leading-[22px] text-ink">
                  Day 2 lunch is open. Contramar is one of your places, and it scores 94 for Ana because she loves Via Carota and Lilia.
                </p>
                <div className="flex gap-2">
                  <Button size="sm">Add Contramar to Day 2 lunch</Button>
                  <Button size="sm" variant="chip">
                    Show 3 other lunch options
                  </Button>
                  <Button size="sm" variant="chip">
                    Only show my places
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2.5 rounded-pill border border-ink/6 bg-white/90 py-2 pr-2 pl-5">
              <span className="flex-1 text-body leading-5 text-text-muted">
                Ask for a change, like {"“"}a quieter dinner on Day 2{"”"} or {"“"}more coffee near Condesa{"”"}
              </span>
              <IconButton label="Attach a file" variant="ghost" size={40} icon={<Paperclip size={18} strokeWidth={2} />} />
              <IconButton label="Dictate" variant="ghost" size={40} icon={<Mic size={18} strokeWidth={2} />} />
              <IconButton label="Send" variant="ink" size={44} icon={<ArrowUp size={18} strokeWidth={2} />} />
            </div>
          </GlassDock>
        </div>
      </Section>

      <Section id="sheet" title="Sheet" artboard="03 Place profile">
        <Row>
          <Button onClick={() => setSheet("right")}>Open place profile</Button>
          <Button variant="outline" onClick={() => setSheet("center")}>
            Open centered sheet
          </Button>
        </Row>
        <Sheet open={sheet === "right"} onClose={() => setSheet(null)} label="Contramar" side="right" className="flex gap-10 py-5 pr-9 pl-5">
          <div className="flex w-[580px] shrink-0 flex-col gap-3">
            <ArchPhoto src={contramar} alt="Contramar dining room" caption="1 of 214 photos" className="h-[520px] w-[580px]" priority />
            <div className="flex gap-3">
              <div className="relative h-[296px] w-[284px] overflow-hidden rounded-photo">
                <FilmImage src={contramarDish} alt="Grilled fish plate" sizes="284px" />
              </div>
              <div className="relative h-[296px] w-[284px] overflow-hidden rounded-photo">
                <FilmImage src={contramarRoom} alt="Dining area" sizes="284px" />
              </div>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-6 pt-4">
            <div className="flex items-center gap-2.5">
              <p className="flex-1 text-ui font-medium text-text-muted">Seafood restaurant · Roma Norte</p>
              <Switch variant="pill" label="In my places" checked={inPlaces} onCheckedChange={setInPlaces} />
              <IconButton label="Close" variant="soft" icon={<X size={16} strokeWidth={2} />} onClick={() => setSheet(null)} />
            </div>
            <h2 className="font-display text-place leading-[70px] text-ink">Contramar</h2>
            <p className="text-body-lg text-text-2">Busy, sunlit seafood spot for long lunches, known for tuna tostadas and grilled fish served half red, half green.</p>
          </div>
        </Sheet>
        <Sheet open={sheet === "center"} onClose={() => setSheet(null)} label="Stop sharing" side="center">
          <div className="flex flex-col gap-4">
            <h2 className="font-display text-empty text-ink">Stop sharing this itinerary?</h2>
            <p className="text-body text-text-2">Ana&apos;s link stops working. You can share again later.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setSheet(null)}>
                Keep sharing
              </Button>
              <Button onClick={() => setSheet(null)}>Stop sharing</Button>
            </div>
          </div>
        </Sheet>
      </Section>

      <Section id="misc" title="Ornament, toast, empty state" artboard="05 Traveler view, C2 Client profile">
        <Row>
          <StarburstOrnament />
          <Toast position="static" message="Contramar added to Day 2 lunch" action={<ToastAction>Undo</ToastAction>} />
          <Toast position="static" message="Link copied" />
        </Row>
        <EmptyState
          className="h-[300px] w-[880px]"
          title="Her trips will show up here"
          body="Add at least three places she loves, then plan her first trip."
          action={
            <Button className="h-11! text-action!" icon={<Plus size={14} strokeWidth={2} aria-hidden />}>
              Plan her first trip
            </Button>
          }
        />
      </Section>
    </>
  );
}

export function Gallery() {
  return (
    <main className="min-h-dvh min-w-[1024px] bg-canvas pb-24">
      <header className="flex items-end justify-between px-7 pt-10 pb-8">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-title leading-[54px] text-ink">Design gallery</h1>
          <p className="text-body text-text-muted">Every primitive in every state, with the copy from the Paper designs.</p>
        </div>
        <StarburstOrnament size={36} />
      </header>
      <ShellDemos />
      <ControlDemos />
      <IdentityDemos />
      <OverlayDemos />
    </main>
  );
}
