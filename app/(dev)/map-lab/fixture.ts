import attaboy from "@/design/images/attaboy.jpg";
import buna from "@/design/images/buna.jpg";
import contramar from "@/design/images/contramar.jpg";
import contramarDish from "@/design/images/contramar-dish.jpg";
import contramarRoom from "@/design/images/contramar-room.jpg";
import lilia from "@/design/images/lilia.jpg";
import limantour from "@/design/images/limantour.jpg";
import park from "@/design/images/park.jpg";
import rosetta from "@/design/images/rosetta.jpg";
import viaCarota from "@/design/images/via-carota.jpg";
import type { Ask, ItinerarySlot, TripPlaceCard, TripSnapshot } from "@/lib/contracts";

// Map lab fixture: Ana's Lisbon trip with 14 places. Coordinates are real,
// photos are the design reference images. Some are her advisor's places with
// notes, some sit in itinerary slots, four are results of one ask.

export const ASK_ID = "00000000-0000-4000-8000-000000000001";

export const trip: TripSnapshot["trip"] = {
  id: "trip-lisbon",
  title: "Lisbon in May",
  clientId: "client-ana",
  clientName: "Ana Ruiz",
  destination: { name: "Lisbon", countryCode: "PT", lat: 38.7139, lon: -9.1394, radiusM: 3000 },
  startDate: "2027-05-14",
  endDate: "2027-05-18",
  datesMode: "exact",
  stage: "planning",
  seedStatus: "done",
  chatId: "chat-lisbon",
};

const favorites = {
  viaCarota: { entityId: "fav-via-carota", name: "Via Carota" },
  lilia: { entityId: "fav-lilia", name: "Lilia" },
  attaboy: { entityId: "fav-attaboy", name: "Attaboy" },
};

type Seed = Omit<TripPlaceCard, "placeId" | "entityId" | "sharedTags" | "status" | "source" | "askIds" | "because"> &
  Partial<Pick<TripPlaceCard, "status" | "source" | "askIds">> & {
    because?: [keyof typeof favorites, number][];
  };

function place(seed: Seed): TripPlaceCard {
  const { because = [], ...rest } = seed;
  return {
    placeId: `place-${seed.tripPlaceId}`,
    entityId: `entity-${seed.tripPlaceId}`,
    sharedTags: [],
    status: "suggested",
    source: "seed",
    askIds: [],
    because: because.map(([key, share]) => ({ ...favorites[key], share })),
    ...rest,
  };
}

export const places: TripPlaceCard[] = [
  place({
    tripPlaceId: "senhor-uva",
    name: "Senhor Uva",
    category: "drink",
    neighborhood: "Estrela",
    lat: 38.7086,
    lon: -9.153,
    imageUrl: rosetta.src,
    score: 87,
    because: [["viaCarota", 70], ["lilia", 30]],
    yourPlace: { advisorPlaceId: "ap-senhor-uva", note: "Ask for the orange flight." },
    source: "ask",
    askIds: [ASK_ID],
  }),
  place({
    tripPlaceId: "black-sheep",
    name: "Black Sheep",
    category: "drink",
    neighborhood: "Príncipe Real",
    lat: 38.7156,
    lon: -9.1536,
    imageUrl: attaboy.src,
    score: 91,
    because: [["lilia", 60], ["attaboy", 40]],
    source: "ask",
    askIds: [ASK_ID],
  }),
  place({
    tripPlaceId: "comida-independente",
    name: "Comida Independente",
    category: "drink",
    neighborhood: "Cais do Sodré",
    lat: 38.7069,
    lon: -9.1503,
    imageUrl: contramarRoom.src,
    score: 84,
    because: [["viaCarota", 55], ["lilia", 45]],
    yourPlace: { advisorPlaceId: "ap-comida", note: "" },
    source: "ask",
    askIds: [ASK_ID],
  }),
  place({
    tripPlaceId: "garrafeira-alfaia",
    name: "Garrafeira Alfaia",
    category: "drink",
    neighborhood: "Bairro Alto",
    lat: 38.7124,
    lon: -9.1446,
    score: 82,
    because: [["attaboy", 100]],
    source: "ask",
    askIds: [ASK_ID],
  }),
  place({
    tripPlaceId: "prado",
    name: "Prado",
    category: "eat",
    neighborhood: "Baixa",
    lat: 38.7104,
    lon: -9.1347,
    imageUrl: contramarDish.src,
    score: 89,
    because: [["viaCarota", 52], ["lilia", 34], ["attaboy", 14]],
    status: "added",
  }),
  place({
    tripPlaceId: "taberna-flores",
    name: "Taberna da Rua das Flores",
    category: "eat",
    neighborhood: "Chiado",
    lat: 38.7109,
    lon: -9.1441,
    imageUrl: contramar.src,
    score: 86,
    because: [["lilia", 80], ["viaCarota", 20]],
    yourPlace: { advisorPlaceId: "ap-taberna", note: "No bookings. Go at 7 or wait." },
    status: "added",
  }),
  place({
    tripPlaceId: "bahr",
    name: "BAHR",
    category: "eat",
    neighborhood: "Chiado",
    lat: 38.711,
    lon: -9.1432,
    imageUrl: lilia.src,
    score: 80,
    because: [["lilia", 100]],
  }),
  place({
    tripPlaceId: "fabrica",
    name: "Fábrica Coffee Roasters",
    category: "coffee",
    neighborhood: "Avenida",
    lat: 38.7175,
    lon: -9.1407,
    imageUrl: buna.src,
    score: 78,
    because: [["viaCarota", 100]],
    status: "added",
  }),
  place({
    tripPlaceId: "copenhagen-coffee",
    name: "Copenhagen Coffee Lab",
    category: "coffee",
    neighborhood: "São Bento",
    lat: 38.7138,
    lon: -9.1531,
    imageUrl: viaCarota.src,
    score: 77,
    because: [["viaCarota", 100]],
  }),
  place({
    tripPlaceId: "gulbenkian",
    name: "Gulbenkian Museum",
    category: "see",
    neighborhood: "Avenidas Novas",
    lat: 38.7372,
    lon: -9.154,
    imageUrl: park.src,
    score: 83,
    because: [["attaboy", 100]],
    yourPlace: { advisorPlaceId: "ap-gulbenkian", note: "The garden first, the collection after lunch." },
  }),
  place({
    tripPlaceId: "maat",
    name: "MAAT",
    category: "see",
    neighborhood: "Belém",
    lat: 38.6958,
    lon: -9.1934,
    score: 79,
    because: [["attaboy", 100]],
  }),
  place({
    tripPlaceId: "sao-pedro",
    name: "Miradouro de São Pedro de Alcântara",
    category: "see",
    neighborhood: "Bairro Alto",
    lat: 38.7154,
    lon: -9.1443,
    imageUrl: limantour.src,
    score: 75,
    because: [],
  }),
  place({
    tripPlaceId: "memmo",
    name: "Memmo Príncipe Real",
    category: "stay",
    neighborhood: "Príncipe Real",
    lat: 38.7161,
    lon: -9.149,
    imageUrl: contramarRoom.src,
    score: 81,
    because: [["lilia", 100]],
    status: "added",
  }),
  place({
    tripPlaceId: "ramiro",
    name: "Cervejaria Ramiro",
    category: "eat",
    neighborhood: "Intendente",
    lat: 38.7206,
    lon: -9.1355,
    imageUrl: contramarDish.src,
    score: 85,
    because: [["viaCarota", 65], ["attaboy", 35]],
    yourPlace: { advisorPlaceId: "ap-ramiro", note: "Prawns, then the steak sandwich." },
  }),
];

export const asks: Ask[] = [
  { id: ASK_ID, label: "Natural wine · Sat", status: "done", resultCount: 4, elapsedMs: 1400, loosened: [] },
];

export const askPlaceIds = places.filter((p) => p.askIds.includes(ASK_ID)).map((p) => p.tripPlaceId);

export const slots: ItinerarySlot[] = [
  { id: "s1", day: 1, slot: "stay", tripPlaceId: "memmo", note: "", position: 0 },
  { id: "s2", day: 1, slot: "morning", tripPlaceId: "fabrica", note: "", position: 1 },
  { id: "s3", day: 1, slot: "dinner", tripPlaceId: "prado", note: "", position: 2 },
  { id: "s4", day: 2, slot: "lunch", tripPlaceId: "taberna-flores", note: "", position: 0 },
  { id: "s5", day: 2, slot: "dinner", note: "", position: 1 },
];
