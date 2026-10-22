import attaboy from "@/design/images/attaboy.jpg";
import contramar from "@/design/images/contramar.jpg";
import contramarDish from "@/design/images/contramar-dish.jpg";
import contramarRoom from "@/design/images/contramar-room.jpg";
import lilia from "@/design/images/lilia.jpg";
import limantour from "@/design/images/limantour.jpg";
import viaCarota from "@/design/images/via-carota.jpg";
import type { TripPlaceCard, TripSnapshot } from "@/lib/contracts";
import type { TripPlaceProfile } from "@/lib/trips/profile-types";

import type { LabCase } from "./lab";

// Fixture data for the profile lab: the copy of the Paper artboards (03, 03b)
// so the sheet can be compared with the design side by side, and a second
// place that exercises the edges ("Other favorites", no Google listing, one
// photo, no saved note). Dev only; never shown in the product.

const trip: TripSnapshot["trip"] = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Mexico City for Ana",
  clientId: "00000000-0000-4000-8000-000000000002",
  clientName: "Ana Ruiz",
  destination: { name: "Mexico City", disambiguation: "Mexico", lat: 19.4326, lon: -99.1332, radiusM: 9000 },
  startDate: "2026-11-12",
  endDate: "2026-11-16",
  datesMode: "exact",
  stage: "planning",
  seedStatus: "done",
  chatId: "00000000-0000-4000-8000-000000000003",
};

const contramarCard: TripPlaceCard = {
  tripPlaceId: "00000000-0000-4000-8000-000000000010",
  placeId: "00000000-0000-4000-8000-000000000011",
  entityId: "fixture-contramar",
  name: "Contramar",
  category: "eat",
  neighborhood: "Roma Norte",
  address: "Calle de Durango 200, Roma Norte, Mexico City",
  lat: 19.4194,
  lon: -99.1674,
  imageUrl: contramar.src,
  score: 94,
  because: [
    { entityId: "fixture-via-carota", name: "Via Carota", share: 52 },
    { entityId: "fixture-lilia", name: "Lilia", share: 34 },
    { entityId: "fixture-attaboy", name: "Attaboy", share: 14 },
  ],
  sharedTags: ["Seafood", "Lively", "Long lunches", "Good for groups", "Natural light"].map((name) => ({
    tagId: `fixture:${name}`,
    name,
  })),
  yourPlace: { advisorPlaceId: "00000000-0000-4000-8000-000000000012", note: "Book the 1:30 sitting. The tuna tostadas sell out by 3." },
  status: "suggested",
  source: "seed",
  askIds: [],
};

const contramarProfile: TripPlaceProfile = {
  card: contramarCard,
  place: {
    id: contramarCard.placeId,
    entityId: contramarCard.entityId,
    name: "Contramar",
    address: "Calle de Durango 200, Roma Norte, Mexico City",
    city: "Mexico City",
    neighborhood: "Roma Norte",
    lat: 19.4194,
    lon: -99.1674,
    kind: "Seafood restaurant",
    priceLevel: 3,
    rating: 4.6,
    images: [{ url: contramar.src }, { url: contramarDish.src }, { url: contramarRoom.src }],
    tags: [],
    googlePlaceId: null,
    shortDescription:
      "Busy, sunlit seafood spot for long lunches, known for tuna tostadas and grilled fish served half red, half green.",
    aboutParagraphs: ["Tables turn over slowly, so afternoons here tend to stretch."],
    features: ["Takes reservations", "Good for groups", "Serves wine", "Wheelchair accessible"],
    hours: [
      { weekday: 1, text: "12:30 to 6:30 pm" },
      { weekday: 2, text: "12:30 to 6:30 pm" },
      { weekday: 3, text: "12:30 to 6:30 pm" },
      { weekday: 4, text: "12:30 to 6:30 pm" },
      { weekday: 5, text: "12:30 to 8 pm" },
      { weekday: 6, text: "12:30 to 7 pm" },
      { weekday: 7, text: "12:30 to 7 pm" },
    ],
    phone: "+52 55 5514 9217",
    website: "https://contramar.com.mx",
  },
  advisorPlace: {
    id: "00000000-0000-4000-8000-000000000012",
    note: "Book the 1:30 sitting. The tuna tostadas sell out by 3.",
    savedAt: "2025-03-08T12:00:00.000Z",
    inTrips: 6,
  },
  asks: [],
  drivers: [
    { entityId: "fixture-via-carota", name: "Via Carota", imageUrl: viaCarota.src, city: "New York" },
    { entityId: "fixture-lilia", name: "Lilia", imageUrl: lilia.src, city: "New York" },
    { entityId: "fixture-attaboy", name: "Attaboy", imageUrl: attaboy.src, city: "New York" },
  ],
};

const edgeCard: TripPlaceCard = {
  tripPlaceId: "00000000-0000-4000-8000-000000000020",
  placeId: "00000000-0000-4000-8000-000000000021",
  entityId: "fixture-limantour",
  name: "Licorería Limantour",
  category: "drink",
  neighborhood: "Roma Norte",
  address: "Av. Álvaro Obregón 106, Roma Norte, Mexico City",
  imageUrl: limantour.src,
  score: 71,
  because: [
    { entityId: "fixture-attaboy", name: "Attaboy", share: 46 },
    { entityId: "advisor", name: "Your places", share: 30 },
    { entityId: "other", name: "Other favorites", share: 24 },
  ],
  sharedTags: [],
  status: "suggested",
  source: "ask",
  askIds: [],
};

const edgeProfile: TripPlaceProfile = {
  card: edgeCard,
  place: {
    id: edgeCard.placeId,
    entityId: edgeCard.entityId,
    name: edgeCard.name,
    address: edgeCard.address ?? null,
    city: "Mexico City",
    neighborhood: "Roma Norte",
    lat: null,
    lon: null,
    kind: "Cocktail bar",
    priceLevel: 2,
    rating: null,
    images: [{ url: limantour.src }],
    tags: [],
    googlePlaceId: null,
    shortDescription: null,
    aboutParagraphs: [],
    features: [],
    hours: [],
    phone: null,
    website: null,
  },
  advisorPlace: null,
  asks: [],
  drivers: [{ entityId: "fixture-attaboy", name: "Attaboy", imageUrl: attaboy.src, city: "New York" }],
};

export function fixtureCases(): LabCase[] {
  return [
    {
      id: "design",
      title: "Contramar, the Paper copy (fixture)",
      trip,
      clientName: trip.clientName,
      slots: [
        { id: "s1", day: 1, date: "2026-11-12", slot: "lunch", tripPlaceId: "x1", note: "", position: 0 },
        { id: "s2", day: 1, date: "2026-11-12", slot: "dinner", tripPlaceId: "x2", note: "", position: 0 },
      ],
      card: contramarCard,
      profile: contramarProfile,
    },
    {
      id: "edge",
      title: "Licorería Limantour, other favorites and no Google listing (fixture)",
      trip: { ...trip, startDate: undefined, endDate: undefined, datesMode: "unset" },
      clientName: trip.clientName,
      slots: [],
      card: edgeCard,
      profile: edgeProfile,
    },
  ];
}
