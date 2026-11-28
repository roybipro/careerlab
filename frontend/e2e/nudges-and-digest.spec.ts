import { expect, test } from "@playwright/test";
import { localDate, registerUser, uniqueName } from "./helpers";

test("an application waiting three weeks shows as worth a follow-up, and snoozing hides it", async ({ page }) => {
  await registerUser(page);
  const company = uniqueName("Quiet Co");
  await page.goto("/jobs");
  await page.getByRole("button", { name: "Add job" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add a job" });
  await dialog.getByLabel("Company", { exact: true }).fill(company);
  await dialog.getByLabel("Position", { exact: true }).fill("Engineer");
  await dialog.getByLabel("Status").selectOption("applied");
  await dialog.locator("summary", { hasText: /^Dates/ }).click();
  await dialog.getByLabel("Application date").fill(localDate(-21));
  await dialog.getByRole("button", { name: "Add job" }).click();
  await expect(dialog).toBeHidden();

  await page.goto("/dashboard");
  const card = page.getByTestId("nudges-section");
  await expect(card.getByText("Worth a follow-up (1)")).toBeVisible();
  await expect(card.getByRole("link", { name: `Engineer at ${company}` })).toBeVisible();
  await expect(card.getByText("Applied 21 days ago, no reply yet")).toBeVisible();

  await card.getByRole("button", { name: `Snooze Engineer at ${company} for a week` }).click();
  await expect(page.getByText(`Snoozed Engineer at ${company} for a week`)).toBeVisible();
  await expect(card).toBeHidden();
  // Still hidden after a reload: the snooze is saved.
  await page.reload();
  await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
  await expect(page.getByTestId("nudges-section")).toBeHidden();
});

test("the email digest setting explains when email is not set up, and the unsubscribe notice shows", async ({ page }) => {
  await registerUser(page);
  await page.goto("/settings");
  await expect(page.getByText("Daily email digest")).toBeVisible();
  // The test stack has no email provider.
  await expect(page.getByText("Email is not set up on this server yet")).toBeVisible();

  await page.goto("/settings?email=unsubscribed");
  await expect(page.getByText("You are unsubscribed.")).toBeVisible();
});
