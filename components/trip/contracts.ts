// Props contracts between the trip workspace (the composition root) and the
// leaf components that other agents build in parallel: the map, the place
// profile sheet and the chat dock. The workspace imports them through
// components/trip/slots.tsx, which the integrator points at the real
// implementations as they merge. Add fields, never rename or remove.

import type { Ask, ChatSnapshot, ItinerarySlot, TripPlaceCard, TripSnapshot } from "@/lib/contracts";

/**
 * The right-hand panel: "itinerary" (the default), "map", or "traveler" (the
 * traveler preview). "board" is the retired Discover board; it reads as
 * "itinerary" so old links still open.
 */
export type TripView = "board" | "map" | "itinerary" | "traveler";
export type BoardTab = "all" | "eat" | "drink" | "coffee" | "see" | "stay" | `ask:${string}`;

export type MapCamera = { lat: number; lon: number; zoom: number };

/** The Discover map (02b, F8, F7b). Pure: everything comes in as props. */
export type TripMapProps = {
  trip: TripSnapshot["trip"];
  places: TripPlaceCard[];
  asks: Ask[];
  slots: ItinerarySlot[];
  /** "all", a category, or "ask:<id>"; result pins of the active ask glow. */
  activeTab: BoardTab;
  /** Ids of trip places that belong to the active ask (empty when a category tab is active). */
  activeAskPlaceIds: string[];
  /** A place arriving from a running tool, before its coordinates are known. */
  pendingPlaceholder?: { label: string } | null;
  highlightedPlaceId: string | null;
  selectedPlaceId: string | null;
  camera?: MapCamera | null;
  onHover: (tripPlaceId: string | null) => void;
  onSelect: (tripPlaceId: string | null) => void;
  onOpenProfile: (tripPlaceId: string) => void;
  onCameraChange?: (camera: MapCamera) => void;
  /** Shown after the user pans; reruns the active ask around the new center. */
  onSearchArea?: (center: { lat: number; lon: number; radiusM: number }) => void;
  className?: string;
};

/** The place profile sheet (03 and 03b) over a scrim. */
export type PlaceProfileProps = {
  trip: TripSnapshot["trip"];
  card: TripPlaceCard;
  clientName: string;
  slots: ItinerarySlot[];
  open: boolean;
  onClose: () => void;
  /** Add to a slot. The sheet offers a slot picker and a default next free slot. */
  onAddToSlot: (tripPlaceId: string, day: number, slot: ItinerarySlot["slot"]) => Promise<void> | void;
  /** "Not for Ana": removes the place and asks for a replacement. */
  onRemove: (tripPlaceId: string, replace: boolean) => Promise<void> | void;
  /** Toggles the advisor's own library ("In my places"). */
  onToggleMyPlace: (tripPlaceId: string, saved: boolean) => Promise<void> | void;
  onEditNote?: (advisorPlaceId: string, note: string) => Promise<void> | void;
};

/**
 * What a streamed tool output says about the places it carries. `label`,
 * `count`, `elapsedMs` and `loosened` mirror FindPlacesOutput so the ask tab
 * can show its label and count before the next snapshot.
 */
export type PlacesMeta = {
  askId?: string;
  toolCallId: string;
  /** ToolPhase: "searching" | "scoring" | "explaining" | "done", or "error". */
  phase: string;
  label?: string;
  count?: number;
  elapsedMs?: number;
  loosened?: string[];
  /** The itinerary slot the search is for, when the advisor named one. */
  target?: Ask["target"];
};

/** The glass chat dock. Owned by the chat runtime. */
export type ChatDockProps = {
  chatId: string;
  tripId: string;
  initial: ChatSnapshot;
  /** Places streamed by tools (preliminary and final), for the board and map. */
  onPlaces?: (places: TripPlaceCard[], meta: PlacesMeta) => void;
  onPlacesHover?: (tripPlaceId: string | null) => void;
  onPlaceClick?: (tripPlaceId: string) => void;
  /** Rendered centered above the dock (the Board / Map toggle). */
  toggle?: React.ReactNode;
  className?: string;
};

/** What the workspace store exposes to any component that needs it. */
export type TripWorkspaceState = {
  trip: TripSnapshot["trip"];
  travelers: TripSnapshot["travelers"];
  places: Record<string, TripPlaceCard>;
  asks: Record<string, Ask>;
  slots: ItinerarySlot[];
  view: TripView;
  activeTab: BoardTab;
  highlightedPlaceId: string | null;
  selectedPlaceId: string | null;
  camera: MapCamera | null;
};
