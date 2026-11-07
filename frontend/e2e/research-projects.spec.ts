import { expect, test } from "@playwright/test";
import { localDate, registerUser, uniqueName } from "./helpers";

test("a research project: add a submission and milestones, tick one, move it, see the deadline, delete it", async ({ page }) => {
  await registerUser(page);
  const title = uniqueName("Graph Study");
  const venue = uniqueName("Northfield Symposium");
  const draft = "Write the first draft";
  const analysis = "Run the analysis";
  const note = uniqueName("Ask the lab for more data");
  // Five days out, as a plain local date, so the test does not depend on UTC or the time of day.
  const deadline = localDate(5);

  // Create the project from the list.
  await page.goto("/projects");
  await page.getByRole("button", { name: /^Add (your first )?project$/ }).first().click();
  const projectDialog = page.getByRole("dialog", { name: "Add a research project" });
  await projectDialog.getByLabel("Title", { exact: true }).fill(title);
  await projectDialog.getByRole("button", { name: "Add project" }).click();
  await expect(projectDialog).toBeHidden();
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const projectUrl = page.url();
  expect(projectUrl).toMatch(/\/projects\/[0-9a-f-]{36}$/);

  // A planned submission due soon.
  await page.getByRole("button", { name: "Add submission" }).click();
  const submissionDialog = page.getByRole("dialog", { name: "Add a submission" });
  await submissionDialog.getByLabel("Venue", { exact: true }).fill(venue);
  await submissionDialog.getByLabel("Paper deadline").fill(deadline);
  await submissionDialog.getByRole("button", { name: "Add submission" }).click();
  await expect(submissionDialog).toBeHidden();
  await expect(page.getByRole("button", { name: `Edit ${venue}` })).toBeVisible();

  // Two milestones.
  for (const milestone of [draft, analysis]) {
    await page.getByLabel("New milestone title").fill(milestone);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText(milestone, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("progressbar", { name: "Milestones" })).toHaveAttribute("aria-valuetext", "0 of 2 milestones done");

  // Tick one with a real click on the checkbox.
  await page.getByRole("checkbox", { name: draft }).click();
  await expect(page.getByRole("checkbox", { name: draft })).toBeChecked();
  await expect(page.getByText("1 of 2 done")).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Milestones" })).toHaveAttribute("aria-valuetext", "1 of 2 milestones done");

  // A note, still there after a reload.
  await page.getByLabel("Note", { exact: true }).fill(note);
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText(note)).toBeVisible();
  await page.reload();
  await expect(page.getByText(note)).toBeVisible();
  await expect(page.getByRole("checkbox", { name: draft })).toBeChecked();
  await expect(page.getByText("1 of 2 done")).toBeVisible();

  // Move it on the board from the card's status menu.
  await page.goto("/projects");
  await page.getByRole("button", { name: "Kanban" }).click();
  await expect(page.getByRole("region", { name: "Idea, 1 cards" })).toContainText(title);
  await page.getByRole("button", { name: `Move ${title} to another status` }).click();
  await page.getByRole("menuitem", { name: "Experiments" }).click();
  await expect(page.getByRole("region", { name: "Experiments, 1 cards" })).toContainText(title);
  await expect(page.getByRole("region", { name: "Idea, 0 cards" })).not.toContainText(title);
  await page.reload();
  await expect(page.getByRole("region", { name: "Experiments, 1 cards" })).toContainText(title);

  // The deadline shows in the Upcoming deadlines section, with its date and a link to the project.
  await page.goto("/dashboard");
  const upcoming = page
    .locator('[data-slot="card"]')
    .filter({ has: page.locator('[data-slot="card-title"]', { hasText: "Upcoming deadlines" }) });
  const row = upcoming.getByRole("link").filter({ hasText: title });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Submission deadline");
  const shown = await page.evaluate((value) => {
    const [y, m, d] = value.split("-").map(Number);
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
  }, deadline);
  await expect(row).toContainText(shown);
  await expect(row).toHaveAttribute("href", new URL(projectUrl).pathname);

  // Delete it from its page.
  await page.goto(projectUrl);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete research project" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("link", { name: title })).toBeHidden();
  await expect(page.getByRole("heading", { name: "No research projects yet" })).toBeVisible();

  // The project, and its deadline, are gone everywhere.
  await page.goto("/dashboard");
  await expect(page.locator("body")).not.toContainText(title);
  await page.goto(projectUrl);
  await expect(page.getByRole("heading", { name: "Research project not found" })).toBeVisible();

  // The page never needs sideways scrolling, which matters most at 375px.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
