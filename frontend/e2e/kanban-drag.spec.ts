import { expect, test, type Locator, type Page } from "@playwright/test";
import { addJob, registerUser, uniqueName } from "./helpers";

async function center(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Element has no box: is it on screen?");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// Real mouse steps, as dnd-kit's MouseSensor expects: press, move past its 8px threshold, move on, release.
async function drag(page: Page, from: Locator, to: Locator) {
  const start = await center(from);
  const end = await center(to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 12, start.y + 12, { steps: 5 });
  await page.mouse.move(end.x, end.y, { steps: 20 });
  await page.mouse.up();
}

test("dragging a card to another column changes its status", async ({ page }) => {
  await registerUser(page);
  const company = uniqueName("Dragon");
  await addJob(page, company, "Engineer");

  await page.goto("/jobs?view=kanban");
  const wishlist = page.getByRole("region", { name: "Wishlist, 1 cards" });
  const preparing = page.getByRole("region", { name: "Preparing, 0 cards" });
  await drag(page, wishlist.getByRole("link", { name: new RegExp(company) }), preparing);

  await expect(page.getByRole("region", { name: "Preparing, 1 cards" })).toContainText(company);
  await expect(page.getByRole("region", { name: "Wishlist, 0 cards" })).not.toContainText(company);

  // Saved on the server, not only moved on screen.
  await page.reload();
  await expect(page.getByRole("region", { name: "Preparing, 1 cards" })).toContainText(company);
});
