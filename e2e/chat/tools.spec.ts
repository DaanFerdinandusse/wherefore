import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext } from "@playwright/test";
import { z } from "zod";

import { assistantMessages, openChat, send, textOf, waitForIdle } from "./helpers";

// The real tools end to end: a client with the demo favorites and a Lisbon
// trip, the seed turn (seed_trip fills the board category by category and
// the model writes the first message), then an ask ("natural wine bars for
// Saturday") through find_places: an ask row with its places and a search
// card with photo tiles. Real model, real recommendation API (cached).

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

test("seed turn fills the board, then an ask adds a tab with tiles", async ({ page, request }) => {
  test.setTimeout(600_000);

  const created = await request.post("/chat-lab/seed-trip", { timeout: 180_000 });
  expect(created.ok(), await created.text()).toBe(true);
  const { tripId, chatId } = z.object({ tripId: z.string(), chatId: z.string() }).parse(await created.json());

  // The seed turn: the synthetic first message the create action sends.
  const seedStarted = Date.now();
  const seeded = await request.post(`/api/chats/${chatId}/messages`, {
    data: {
      turnId: randomUUID(),
      message: {
        id: `seed-${randomUUID()}`,
        role: "user",
        parts: [{ type: "text", text: "Set up the trip" }],
        metadata: { hidden: true, kind: "seed" },
      },
    },
    timeout: 360_000,
  });
  expect(seeded.ok(), await seeded.text().catch(() => "")).toBe(true);
  await expect.poll(async () => (await tripState(request, tripId)).seedStatus, { timeout: 300_000, intervals: [2_000] }).toBe("done");
  const chat = await waitForIdle(request, chatId, 300_000);
  const seedMs = Date.now() - seedStarted;

  const afterSeed = await tripState(request, tripId);
  const seedCategories = new Set(afterSeed.categories.filter((c) => c.n > 0 && c.category !== "other").map((c) => c.category));
  expect(seedCategories.size, JSON.stringify(afterSeed.categories)).toBeGreaterThanOrEqual(4);

  const first = assistantMessages(chat)[0];
  expect(first, "the seed turn wrote a first message").toBeDefined();
  expect(first?.parts.some((p) => p.type === "tool-seed_trip")).toBe(true);
  expect(textOf(first!)).toMatch(/\d/);

  // The dock shows the seed card with tiles, and no hidden seed message.
  await openChat(page, chatId);
  const seedCard = page.locator('[data-testid="tool-card"][data-tool="seed_trip"]');
  await expect(seedCard).toHaveAttribute("data-state", "output-available");
  await expect(seedCard.getByTestId("place-tile").first()).toBeVisible();
  await expect(page.getByTestId("user-message")).toHaveCount(0);

  // An ask through find_places.
  const askStarted = Date.now();
  await send(page, "natural wine bars for Saturday");
  const searchCard = page.locator('[data-testid="tool-card"][data-tool="find_places"]').first();
  await expect(searchCard).toBeVisible({ timeout: 120_000 });
  await expect(searchCard.getByTestId("place-tile").first()).toBeVisible({ timeout: 180_000 });
  await waitForIdle(request, chatId, 300_000);
  const askMs = Date.now() - askStarted;
  await expect(searchCard).toHaveAttribute("data-state", "output-available");
  await expect(searchCard).toHaveAttribute("data-preliminary", "false");
  await expect(searchCard.getByTestId("tool-card-title")).toContainText(/Searched/i);

  await searchCard.screenshot({ path: "test-results/tools-search-card.png" });
  await seedCard.screenshot({ path: "test-results/tools-seed-card.png" });

  const afterAsk = await tripState(request, tripId);
  expect(afterAsk.asks.length).toBeGreaterThanOrEqual(1);
  const ask = afterAsk.asks[0]!;
  expect(ask.status).toBe("done");
  expect(ask.places).toBeGreaterThan(0);
  // The finished card shows the ask's final count (your places included),
  // not the count the search stage had.
  await expect(searchCard.getByText(new RegExp(`^${ask.places} found · \\d+\\.\\d s$`))).toBeVisible();

  console.log(
    `[tools.spec] seed turn ${(seedMs / 1000).toFixed(1)} s, ${afterSeed.categories.reduce((n, c) => n + c.n, 0)} trip places in ${seedCategories.size} categories, ${afterSeed.reasons} reasons; ask "${ask.label}" ${(askMs / 1000).toFixed(1)} s, ${ask.places} places`,
  );
});
