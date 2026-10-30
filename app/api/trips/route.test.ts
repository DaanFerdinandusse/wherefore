import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn((task: () => unknown) => task()),
  createTrip: vi.fn(async () => ({ trip: { id: "trip-1", title: "Lisboa for Ana" }, chatId: "chat-1" })),
  findCoverPhoto: vi.fn(),
  markCoverPhotoUsed: vi.fn(async () => undefined),
}));

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/auth/server", () => ({ requireUser: async () => ({ id: "user-1" }) }));
vi.mock("@/lib/trips", () => ({ createTrip: mocks.createTrip }));
vi.mock("@/lib/unsplash", () => ({
  findCoverPhoto: mocks.findCoverPhoto,
  markCoverPhotoUsed: mocks.markCoverPhotoUsed,
}));

import { POST } from "./route";

const cover = { url: "https://images.unsplash.com/photo-1", alt: "", creditName: "Ana", creditUrl: "https://unsplash.com/@ana" };

const request = () =>
  new Request("http://test/api/trips", {
    method: "POST",
    body: JSON.stringify({
      clientId: "00000000-0000-4000-8000-000000000000",
      destination: { name: "Lisboa", lat: 38.7, lon: -9.1, radiusM: 15_000 },
      datesMode: "unset",
      adults: 2,
      children: 0,
      guests: [],
    }),
  });

describe("POST /api/trips", () => {
  beforeEach(() => vi.clearAllMocks());

  it("looks up the destination and creates the trip with its cover", async () => {
    mocks.findCoverPhoto.mockResolvedValue({ cover, downloadLocation: "https://api.unsplash.com/photos/1/download" });

    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(mocks.findCoverPhoto).toHaveBeenCalledWith("Lisboa");
    expect(mocks.createTrip).toHaveBeenCalledWith({ id: "user-1" }, expect.objectContaining({ cover }));
    expect(mocks.markCoverPhotoUsed).toHaveBeenCalledWith("https://api.unsplash.com/photos/1/download");
  });

  it("still creates the trip when no photo is found", async () => {
    mocks.findCoverPhoto.mockResolvedValue(null);

    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(mocks.createTrip).toHaveBeenCalledWith({ id: "user-1" }, expect.objectContaining({ cover: null }));
    expect(mocks.markCoverPhotoUsed).not.toHaveBeenCalled();
  });
});
