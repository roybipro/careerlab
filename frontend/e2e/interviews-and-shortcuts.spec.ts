import { expect, test } from "@playwright/test";
import { addJob, localDatetime, registerUser, uniqueName } from "./helpers";

test("add an interview round, record how it went, and see the next round marked", async ({ page }) => {
  await registerUser(page);
  const company = uniqueName("Interview Co");
  await addJob(page, company, "Engineer");
  await page.getByRole("link", { name: company }).first().click();
  await expect(page.getByRole("heading", { name: company })).toBeVisible();

  const panel = page.locator("[data-slot=card]").filter({ has: page.getByText("Interviews", { exact: true }) });
  await expect(panel.getByText("No interviews yet.")).toBeVisible();

  await panel.getByRole("button", { name: "Add interview" }).click();
  const dialog = page.getByRole("dialog", { name: "Add an interview" });
  await dialog.getByLabel("Round").fill("Recruiter screen");
  await dialog.getByLabel("Type").selectOption("phone_screen");
  await dialog.getByLabel("Date and time").fill(localDatetime(48));
  await dialog.getByLabel("Length (minutes)").fill("30");
  await dialog.getByLabel("Interviewers").fill("Dana, recruiter");
  await dialog.getByRole("button", { name: "Add interview" }).click();
  await expect(dialog).toBeHidden();

  await expect(panel.getByText("Recruiter screen")).toBeVisible();
  await expect(panel.getByText("Next", { exact: true })).toBeVisible();
  await expect(panel.getByText("Phone screen")).toBeVisible();
  await expect(panel.getByText("Dana, recruiter")).toBeVisible();

  // Record the outcome, a rating and the questions.
  await panel.getByRole("button", { name: "Edit Recruiter screen" }).click();
  const edit = page.getByRole("dialog", { name: "Edit interview" });
  await edit.getByLabel("Outcome").selectOption("passed");
  await edit.getByLabel("How it went").selectOption("4");
  await edit.getByLabel("Questions asked").fill("Why this team?");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit).toBeHidden();
  await expect(panel.getByText("Passed")).toBeVisible();
  await expect(panel.getByRole("img", { name: "Rated 4 out of 5" })).toBeVisible();
  await expect(panel.getByText("Why this team?")).toBeVisible();

  // The thank-you box saves on its own.
  await panel.getByLabel("Thank-you note sent").check();
  await page.reload();
  await expect(page.getByLabel("Thank-you note sent")).toBeChecked();

  // The round shows in the job's history.
  await expect(page.getByText(/Interview scheduled for/)).toBeVisible();
});

test.describe("keyboard shortcuts", () => {
  test.skip(({ isMobile }) => isMobile, "Keyboard shortcuts are for desktop");

  test("? lists the shortcuts, g then j goes to jobs, j/k/x/Enter work on rows", async ({ page }) => {
    await registerUser(page);
    const a = uniqueName("Key A");
    const b = uniqueName("Key B");
    await addJob(page, a, "Engineer");
    await addJob(page, b, "Engineer");
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();

    await page.keyboard.press("?");
    const help = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(help).toBeVisible();
    await expect(help.getByText("Tick the row for bulk actions")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(help).toBeHidden();

    await page.keyboard.press("g");
    await page.keyboard.press("j");
    await expect(page).toHaveURL(/\/jobs$/);
    await expect(page.getByRole("link", { name: a })).toBeVisible();

    // f focuses the search box; typing there does not trigger shortcuts.
    await page.keyboard.press("f");
    await expect(page.getByRole("searchbox")).toBeFocused();
    await page.keyboard.type("j");
    await expect(page.getByRole("searchbox")).toHaveValue("j");
    await page.getByRole("searchbox").fill("");
    await page.getByRole("searchbox").blur();

    // Newest first: b, then a.
    await page.keyboard.press("j");
    const first = page.locator("[data-row]").filter({ hasText: b });
    await expect(first).toBeFocused();
    await page.keyboard.press("j");
    const second = page.locator("[data-row]").filter({ hasText: a });
    await expect(second).toBeFocused();
    await page.keyboard.press("k");
    await expect(first).toBeFocused();

    await page.keyboard.press("x");
    await expect(page.getByRole("toolbar", { name: "Actions for 1 job" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("toolbar")).toBeHidden();

    await first.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: b })).toBeVisible();

    // c opens the create dialog for the current section.
    await page.keyboard.press("c");
    await expect(page.getByRole("dialog", { name: "Add a job" })).toBeVisible();
  });
});
