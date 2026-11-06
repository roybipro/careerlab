import { expect, test } from "@playwright/test";
import { addJob, localDatetime, registerUser, summaryCard, uniqueName } from "./helpers";

test("register, add a job, move it, add and complete a reminder, and see the dashboard change", async ({ page }) => {
  await registerUser(page);

  // A new account starts empty.
  await expect(summaryCard(page, "total_jobs")).toHaveText("0");
  await expect(summaryCard(page, "in_progress")).toHaveText("0");
  await expect(summaryCard(page, "upcoming_deadlines")).toHaveText("0");

  // Add a job. It starts in the wishlist.
  const company = uniqueName("Acme");
  const position = "Platform Engineer";
  await addJob(page, company, position);

  // Move it to Applied from the card's status menu on the board.
  await page.getByRole("button", { name: "Kanban" }).click();
  await expect(page.getByRole("region", { name: "Wishlist, 1 cards" })).toContainText(company);
  await page.getByRole("button", { name: `Move ${company}, ${position} to another status` }).click();
  await page.getByRole("menuitem", { name: "Applied" }).click();
  await expect(page.getByRole("region", { name: "Applied, 1 cards" })).toContainText(company);
  await expect(page.getByRole("region", { name: "Wishlist, 0 cards" })).not.toContainText(company);

  // Add a reminder due tomorrow from the dashboard.
  await page.goto("/dashboard");
  const reminder = uniqueName("Follow up with recruiter");
  await page.getByRole("button", { name: "Add reminder" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a reminder" });
  await dialog.getByLabel("Reminder", { exact: true }).fill(reminder);
  await dialog.getByLabel("Due", { exact: true }).fill(localDatetime(24));
  await dialog.getByRole("button", { name: "Add reminder" }).click();
  await expect(dialog).toBeHidden();

  // The dashboard now counts the job and the open reminder. A reload proves it is stored, not cached.
  await page.reload();
  await expect(summaryCard(page, "total_jobs")).toHaveText("1");
  await expect(summaryCard(page, "in_progress")).toHaveText("1");
  await expect(summaryCard(page, "upcoming_deadlines")).toHaveText("1");

  // Complete the reminder.
  await page.goto("/reminders");
  await page.getByRole("button", { name: `Complete ${reminder}` }).click();
  await expect(page.getByRole("button", { name: `Complete ${reminder}` })).toBeHidden();
  await page.getByRole("tab", { name: "Completed" }).click();
  await expect(page.getByRole("button", { name: `Reopen ${reminder}` })).toBeVisible();

  // Totals changed again: the reminder no longer counts as upcoming, the job is unchanged.
  await page.goto("/dashboard");
  await expect(summaryCard(page, "upcoming_deadlines")).toHaveText("0");
  await expect(summaryCard(page, "total_jobs")).toHaveText("1");
  await expect(summaryCard(page, "in_progress")).toHaveText("1");

  // The page never needs sideways scrolling, which matters most at 375px.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
