import { expect, test } from "@playwright/test";
import { addJob, registerUser, uniqueName } from "./helpers";

test.describe("bulk actions", () => {
  // The checkboxes are part of the desktop table; phones get cards.
  test.skip(({ isMobile }) => isMobile, "Bulk actions are on the desktop table");

  test("tick rows, change their status together, then delete them", async ({ page }) => {
    await registerUser(page);
    const a = uniqueName("Bulk A");
    const b = uniqueName("Bulk B");
    const keep = uniqueName("Keep");
    await addJob(page, a, "Engineer");
    await addJob(page, b, "Engineer");
    await addJob(page, keep, "Engineer");
    await page.goto("/jobs");

    await page.getByLabel(`Select ${a}`).check();
    await page.getByLabel(`Select ${b}`).check();
    const bar = page.getByRole("toolbar", { name: "Actions for 2 jobs" });
    await expect(bar).toBeVisible();
    // The header box shows a partial selection.
    expect(await page.getByLabel("Select all jobs on this page").evaluate((el: HTMLInputElement) => el.indeterminate)).toBe(true);

    await bar.getByRole("button", { name: "Status" }).click();
    await page.getByRole("menuitem", { name: "Applied" }).click();
    await expect(page.getByText("Updated 2 jobs")).toBeVisible();
    await expect(bar).toBeHidden();
    for (const company of [a, b]) {
      await expect(page.getByRole("row", { name: new RegExp(company) }).getByRole("button", { name: /Status for .*: Applied/ })).toBeVisible();
    }
    await expect(page.getByRole("row", { name: new RegExp(keep) }).getByRole("button", { name: /Status for .*: Wishlist/ })).toBeVisible();

    await page.getByLabel(`Select ${a}`).check();
    await page.getByLabel(`Select ${b}`).check();
    await page.getByRole("toolbar", { name: "Actions for 2 jobs" }).getByRole("button", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete 2 jobs" }).click();
    await expect(page.getByText("Deleted 2 jobs")).toBeVisible();
    await expect(page.getByRole("link", { name: a })).toBeHidden();
    await expect(page.getByRole("link", { name: b })).toBeHidden();
    await expect(page.getByRole("link", { name: keep })).toBeVisible();
  });

  test("Escape clears the selection", async ({ page }) => {
    await registerUser(page);
    const a = uniqueName("Esc");
    await addJob(page, a, "Engineer");
    await page.goto("/jobs");
    await page.getByLabel("Select all jobs on this page").check();
    await expect(page.getByRole("toolbar", { name: "Actions for 1 job" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("toolbar")).toBeHidden();
    await expect(page.getByLabel(`Select ${a}`)).not.toBeChecked();
  });
});

test("make a calendar link and fetch the feed without signing in", async ({ page, browser }) => {
  await registerUser(page);
  const company = uniqueName("Cal Co");
  await page.goto("/jobs");
  await page.getByRole("button", { name: "Add job" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add a job" });
  await dialog.getByLabel("Company", { exact: true }).fill(company);
  await dialog.getByLabel("Position", { exact: true }).fill("Engineer");
  await dialog.locator("summary", { hasText: /^Dates/ }).click();
  await dialog.getByLabel("Deadline").fill("2031-01-15");
  await dialog.getByRole("button", { name: "Add job" }).click();
  await expect(dialog).toBeHidden();

  await page.goto("/settings");
  await page.getByRole("button", { name: "Make calendar link" }).click();
  const link = page.getByLabel("Your private calendar link");
  await expect(link).toHaveValue(/\/api\/v1\/calendar\/[A-Za-z0-9_-]+\.ics$/);
  const url = await link.inputValue();

  // A calendar app has no session.
  const anon = await browser.newContext();
  const response = await anon.request.get(url);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/calendar");
  const ics = (await response.text()).replace(/\r\n /g, "");
  expect(ics).toContain(`SUMMARY:Deadline: ${company}: Engineer`);
  expect(ics).toContain("DTSTART;VALUE=DATE:20310115");

  // After a reload the link is no longer shown; resetting stops the old one.
  await page.reload();
  await expect(page.getByText("Your calendar link is on.")).toBeVisible();
  await page.getByRole("button", { name: "Reset link" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Reset link" }).click();
  await expect(page.getByLabel("Your private calendar link")).not.toHaveValue(url);
  expect((await anon.request.get(url)).status()).toBe(404);
  await anon.close();
});
