import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

test("client profile opens from a card and from a direct link", async ({ page }) => {
  const name = `Navigation ${randomUUID().slice(0, 8)}`;
  await page.goto("/clients");
  await page.locator("header").getByRole("link", { name: "Add client", exact: true }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(name);
  await page.getByRole("button", { name: "Save client", exact: true }).click();
  const card = page.getByRole("link", { name: `Open ${name}`, exact: true });
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.getByRole("textbox", { name: "Client name", exact: true })).toHaveValue(name);
  const profileUrl = page.url();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(card).toBeVisible();
  await page.goto(profileUrl);
  await expect(page.getByRole("textbox", { name: "Client name", exact: true })).toHaveValue(name);
});
