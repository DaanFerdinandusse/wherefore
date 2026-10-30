import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { z } from "zod";

import { distanceM, project } from "../../lib/map/geo";

import { assistantMessages, send, waitForIdle, type Snapshot } from "./helpers";

// "Search this region" on the trip panel's map: with a search's results on the
// map, a big move shows the button, pressing it sends a prompt for the same
// thing that the advisor sees in the chat, and the agent searches the exact
// circle on screen. Day tabs never offer it. Real model, real search.

const PORTO = { lat: 41.1496, lon: -8.6109 };

const trip = z.object({ tripId: z.string(), chatId: z.string() });
const regionSearch = z.object({
  input: z.object({
    intent: z.string(),
    near: z.object({ lat: z.number(), lon: z.number(), radius_m: z.number() }),
  }),
  output: z.object({
    phase: z.literal("done"),
    label: z.string(),
    places: z.array(z.object({ name: z.string(), lat: z.number(), lon: z.number() })),
  }),
});

const button = (page: Page) => page.getByRole("button", { name: "Search this region" });

/** The hidden dev trip with a fresh chat: nothing shows up in the workspace. */
async function devTrip(request: APIRequestContext) {
  const created = await request.post("/chat-lab/new");
  expect(created.ok(), await created.text()).toBe(true);
  return trip.parse(await created.json());
}

async function openMap(page: Page, tripId: string) {
  await page.goto(`/trips/${tripId}?view=map`);
  await expect(page.locator('[data-map-status="ready"]')).toBeVisible();
  // The first fit settles before a drag counts as the advisor's.
  await page.waitForTimeout(1_500);
}

async function dragMap(page: Page, dx: number, dy: number) {
  const box = await page.locator('[data-map-status="ready"]').boundingBox();
  if (!box) throw new Error("No map on the page");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  // Held still before letting go, so the map does not coast past the target.
  await page.waitForTimeout(300);
  await page.mouse.up();
  await page.waitForTimeout(1_000);
}

/** The latest find_places call of the turn the button started, after it settled. */
async function searchedRegion(request: APIRequestContext, chatId: string, before: number) {
  await expect.poll(async () => (await waitForIdle(request, chatId)).messages.length, { timeout: 170_000 }).toBeGreaterThan(before);
  const snapshot: Snapshot = await waitForIdle(request, chatId);
  const parts = assistantMessages(snapshot).flatMap((m) => m.parts);
  return regionSearch.parse(parts.findLast((p) => p.type === "tool-find_places"));
}

function expectInside(search: z.infer<typeof regionSearch>) {
  const { lat, lon, radius_m: radius } = search.input.near;
  expect(search.output.label).toContain("Map region");
  expect(search.output.places.length).toBeGreaterThan(0);
  for (const place of search.output.places) {
    expect(distanceM(place, { lat, lon }), place.name).toBeLessThanOrEqual(radius * 1.5);
  }
}

/** A typed brief, so a search's results are on the map. */
async function searchLunch(page: Page, request: APIRequestContext, chatId: string) {
  await send(page, "Find lunch for day 2");
  // Not the server's status: it reads idle until the turn has started.
  await expect(page.getByTestId("chat-column")).toHaveAttribute("data-busy", "false", { timeout: 170_000 });
  await waitForIdle(request, chatId);
  await page.waitForTimeout(2_500);
}

test("a big move on a search result offers Search this region for the same thing", async ({ page, request }) => {
  test.setTimeout(600_000);
  const { tripId, chatId } = await devTrip(request);

  // A day tab has nothing to search again.
  await openMap(page, tripId);
  await dragMap(page, -300, 0);
  await expect(button(page)).toHaveCount(0);

  await searchLunch(page, request, chatId);
  await dragMap(page, -40, 20);
  await expect(button(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Zoom out" }).click();
  await expect(button(page)).toBeVisible();

  const asked = (await waitForIdle(request, chatId)).messages.length;
  await button(page).click();
  await expect(button(page)).toHaveCount(0);
  await expect(page.getByTestId("user-message").last()).toHaveText(/^Search this region of the map for .*lunch.*\.$/i);
  const search = await searchedRegion(request, chatId, asked);
  expectInside(search);
  expect(search.input.intent.toLowerCase()).toContain("lunch");
  const typed = (await waitForIdle(request, chatId)).messages.findLast((m) => m.role === "user")?.parts[0];
  const [, lat, lon, radius] = /lat (\S+), lon (\S+), radius (\d+) m/.exec(z.object({ text: z.string() }).parse(typed).text) ?? [];
  expect(search.input.near).toEqual({ lat: Number(lat), lon: Number(lon), radius_m: Number(radius) });

  // Back on a day tab the offer is gone, however far the map moves.
  await page.waitForTimeout(2_500);
  await page.getByRole("radio", { name: "All days" }).click();
  await page.waitForTimeout(1_500);
  await page.getByRole("button", { name: "Zoom out" }).click();
  await page.waitForTimeout(1_000);
  await expect(button(page)).toHaveCount(0);
});

test("a region outside the trip's city is searched as shown", async ({ page, request }) => {
  test.setTimeout(600_000);
  const { tripId, chatId } = await devTrip(request);

  // North of Porto, on a trip to Lisbon: out far enough to reach it, then back in.
  await openMap(page, tripId);
  await searchLunch(page, request, chatId);
  const zoomOut = page.getByRole("button", { name: "Zoom out" });
  const zoomIn = page.getByRole("button", { name: "Zoom in" });
  for (let i = 0; i < 4; i++) await zoomOut.click();
  await page.waitForTimeout(1_500);
  // The URL carries the camera, so the drag aims from any fit.
  const [lat = 0, lon = 0, zoom = 0] = (new URL(page.url()).searchParams.get("cam") ?? "").split(",").map(Number);
  const from = project({ lat, lon }, zoom);
  const to = project(PORTO, zoom);
  const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 240);
  for (let i = 0; i < steps; i++) await dragMap(page, (from.x - to.x) / steps, (from.y - to.y) / steps);
  for (let i = 0; i < 3; i++) await zoomIn.click();
  await page.waitForTimeout(1_000);
  const asked = (await waitForIdle(request, chatId)).messages.length;
  await button(page).click();
  const search = await searchedRegion(request, chatId, asked);
  expectInside(search);
  expect(search.input.near.lat).toBeGreaterThan(40.8);
});
