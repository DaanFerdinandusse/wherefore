import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext } from "@playwright/test";
import { z } from "zod";

import { assistantMessages, openChat, send, waitForIdle } from "./helpers";

// v3: trip creation stays quiet. The first brief runs a small search and
// recommends one place in the thread, with a persisted slot target.

const tripStateSchema = z.object({
  seedStatus: z.string(),
  categories: z.array(z.object({ category: z.string(), source: z.string(), n: z.number() })),
  asks: z.array(z.object({ id: z.string(), label: z.string(), status: z.string(), places: z.number() })),
  reasons: z.number(),
});

async function tripState(request: APIRequestContext, tripId: string) {
  const response = await request.get(`/chat-lab/seed-trip?trip=${tripId}`);
  expect(response.ok()).toBe(true);
  return tripStateSchema.parse(await response.json());
}

test("trip waits for a brief, then streams a search and recommends one place", async ({ page, request }) => {
  test.setTimeout(600_000);
  const created = await request.post("/chat-lab/seed-trip", { timeout: 180_000 });
  expect(created.ok(), await created.text()).toBe(true);
  const { tripId, chatId } = z.object({ tripId: z.string(), chatId: z.string() }).parse(await created.json());
  const seeded = await request.post(`/api/chats/${chatId}/messages`, {
    data: {
      turnId: randomUUID(),
      message: { id: `seed-${randomUUID()}`, role: "user", parts: [{ type: "text", text: "Set up the trip" }], metadata: { hidden: true, kind: "seed" } },
    },
  });
  expect(seeded.status()).toBe(204);
  expect((await tripState(request, tripId)).categories).toHaveLength(0);
  expect(assistantMessages(await waitForIdle(request, chatId))).toHaveLength(0);
  await openChat(page, chatId);
  await expect(page.getByTestId("opening-message")).toBeVisible();
  await expect(page.getByTestId("user-message")).toHaveCount(0);
  await send(page, "Find five natural wine bars for day 2 night, then recommend one for Ana. Do not add it to the itinerary.");
  const search = page.getByTestId("search-row").first();
  await expect(search).toBeVisible({ timeout: 120_000 });
  const chat = await waitForIdle(request, chatId, 300_000);
  expect(chat.status, chat.lastError).toBe("idle");
  await expect(search).toHaveAttribute("data-preliminary", "false");
  await expect(search.getByTestId("place-chip").first()).toBeVisible();
  await expect(page.getByTestId("place-card").first()).toBeVisible();
  const after = await tripState(request, tripId);
  expect(after.asks.length).toBeGreaterThan(0);
  expect(after.asks[0].status).toBe("done");
  expect(after.asks[0].places).toBeGreaterThan(0);
  const snapshot = await request.get(`/api/trips/${tripId}/snapshot`);
  expect(snapshot.ok()).toBe(true);
  const data = z.object({ snapshot: z.object({ asks: z.array(z.object({ target: z.object({day:z.number(),slot:z.string()}).optional(),pickTripPlaceId:z.string().optional() })) }) }).parse(await snapshot.json());
  expect(data.snapshot.asks.some((ask) => ask.target?.day === 2 && ask.target.slot === "night" && ask.pickTripPlaceId)).toBe(true);
  await page.reload();
  await expect(page.getByTestId("place-card").first()).toBeVisible();
});
