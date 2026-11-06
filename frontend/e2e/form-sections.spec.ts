import { expect, test } from "@playwright/test";
import { registerUser } from "./helpers";

test("a failed submit reopens a collapsed section and focuses the bad field, every time", async ({ page }) => {
  await registerUser(page);
  await page.goto("/jobs");
  await page.getByRole("button", { name: "Add job" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add a job" });
  await dialog.getByLabel("Company", { exact: true }).fill("Section Co");
  await dialog.getByLabel("Position", { exact: true }).fill("Engineer");

  // Put a bad value in the Links section, then collapse it.
  const links = dialog.locator("summary", { hasText: "Links" });
  const url = dialog.getByLabel("Job posting URL");
  await links.click();
  await url.fill("not a link");
  await links.click();
  await expect(url).toBeHidden();

  // First failed submit: the section opens and the field has focus.
  const submit = dialog.getByRole("button", { name: "Add job" });
  await submit.click();
  await expect(url).toBeVisible();
  await expect(url).toBeFocused();
  await expect(dialog.getByText("Enter a link starting with http:// or https://").first()).toBeVisible();

  // The user collapses it with the error still there. It stays collapsed until they submit.
  await links.click();
  await expect(url).toBeHidden();

  // Second failed submit: it must open again, or the form would do nothing at all.
  await submit.click();
  await expect(url).toBeVisible();
  await expect(url).toBeFocused();

  // Fixing the value saves the job.
  await url.fill("https://example.com/role");
  await submit.click();
  await expect(dialog).toBeHidden();
});
