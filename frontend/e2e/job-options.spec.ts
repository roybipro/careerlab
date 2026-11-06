import { expect, test } from "@playwright/test";
import { addJob, registerUser, uniqueName } from "./helpers";

test("an internship with dates shows its duration, and the category switch splits the list", async ({ page }) => {
  await registerUser(page);
  const regular = uniqueName("Regular Co");
  const internship = uniqueName("Intern Co");
  await addJob(page, regular, "Engineer");

  await page.getByRole("button", { name: "Add job" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add a job" });
  await dialog.getByLabel("Company", { exact: true }).fill(internship);
  await dialog.getByLabel("Position", { exact: true }).fill("Summer Intern");

  await dialog.locator("summary", { hasText: /^Role/ }).click();
  await expect(dialog.getByLabel("Counts for academic credit")).toBeHidden();
  await dialog.getByLabel("Employment type").selectOption("internship");
  await expect(dialog.getByLabel("Counts for academic credit")).toBeVisible();

  await dialog.locator("summary", { hasText: /^Dates/ }).click();
  await dialog.getByLabel("Start date").fill("2030-06-01");
  await dialog.getByLabel("End date").fill("2030-08-31");
  await expect(dialog.getByText("Duration: 3 months")).toBeVisible();

  await dialog.getByRole("button", { name: "Add job" }).click();
  await expect(dialog).toBeHidden();

  // The detail page shows the duration.
  await page.getByRole("link", { name: internship }).click();
  await expect(page.getByRole("heading", { name: internship })).toBeVisible();
  await expect(page.getByRole("definition").filter({ hasText: "3 months" })).toBeVisible();

  // The category switch.
  await page.goto("/jobs");
  const all = page.getByRole("button", { name: "All", exact: true });
  const jobs = page.getByRole("button", { name: "Jobs", exact: true });
  const internships = page.getByRole("button", { name: "Internships", exact: true });
  await expect(all).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("link", { name: regular })).toBeVisible();
  await expect(page.getByRole("link", { name: internship })).toBeVisible();

  await internships.click();
  await expect(internships).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/category=internships/);
  await expect(page.getByRole("link", { name: internship })).toBeVisible();
  await expect(page.getByRole("link", { name: regular })).toBeHidden();

  await jobs.click();
  await expect(jobs).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/category=jobs/);
  await expect(page.getByRole("link", { name: regular })).toBeVisible();
  await expect(page.getByRole("link", { name: internship })).toBeHidden();
});
