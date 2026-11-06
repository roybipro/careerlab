import { expect, test, type Page } from "@playwright/test";
import { addJob, registerUser, summaryCard, uniqueName } from "./helpers";

/** Calls the API from the signed-in page, so the session cookie and CSRF header apply. */
async function post(page: Page, path: string, body: unknown): Promise<{ id: string }> {
  return page.evaluate(
    async ([p, b]) => {
      const res = await fetch(`/api/v1${p as string}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "CareerLab" },
        body: JSON.stringify(b),
      });
      if (!res.ok) throw new Error(`${p}: ${res.status} ${await res.text()}`);
      return res.json();
    },
    [path, body] as const,
  );
}

test.describe("a browser west of UTC", () => {
  // UTC-12: its date is the day before the UTC date for half of every day.
  test.use({ timezoneId: "Etc/GMT+12" });

  test("a deadline dated the browser's today stays on the dashboard", async ({ page }) => {
    await registerUser(page);
    const company = uniqueName("Westside");
    const localToday = await page.evaluate(() => {
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    });
    await post(page, "/jobs", { company_name: company, position_title: "Analyst", status: "applied", deadline: localToday });

    const summary = page.waitForRequest((r) => r.url().includes("/dashboard/summary"));
    await page.goto("/dashboard");
    expect((await summary).url()).toContain(`today=${localToday}`);
    await expect(summaryCard(page, "upcoming_deadlines")).toHaveText("1");
    await expect(page.getByRole("link", { name: new RegExp(`${company}.*Job deadline`) })).toBeVisible();
  });
});

test("overdue reminders show on the dashboard, can be edited, searched and sorted", async ({ page }) => {
  await registerUser(page);
  // Nothing overdue yet: the section is absent.
  await expect(page.getByTestId("overdue-section")).toHaveCount(0);

  const first = uniqueName("Send thank-you");
  const second = uniqueName("Call recruiter");
  const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString();
  await post(page, "/reminders", { title: first, due_at: twoHoursAgo });
  await post(page, "/reminders", { title: second, due_at: twoHoursAgo, description: "ask about the start date" });

  await page.goto("/dashboard");
  const section = page.getByTestId("overdue-section");
  await expect(section).toContainText("Overdue (2)");
  await expect(section).toContainText(first);
  // The upcoming list is unaffected: overdue items are not in it.
  await expect(summaryCard(page, "upcoming_deadlines")).toHaveText("0");
  await section.getByRole("link", { name: "View in reminders" }).click();
  await expect(page).toHaveURL(/\/reminders\?state=overdue$/);

  // Search narrows the list.
  await page.getByRole("searchbox").fill("recruiter");
  await expect(page).toHaveURL(/q=recruiter/);
  await expect(page.getByText(first)).toBeHidden();
  await expect(page.getByText(second)).toBeVisible();

  // Edit the title and the description.
  await page.getByRole("button", { name: `Edit reminder ${second}` }).click();
  const dialog = page.getByRole("dialog", { name: "Edit reminder" });
  await expect(dialog.getByLabel("Details (optional)")).toHaveValue("ask about the start date");
  const renamed = uniqueName("Call the hiring manager");
  await dialog.getByLabel("Reminder", { exact: true }).fill(renamed);
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByText(renamed)).toBeVisible();

  // Sorting by title puts "Call..." before "Send...". Changing tab drops the sort.
  await page.getByLabel("Sort by").selectOption("title");
  await expect(page).toHaveURL(/sort=title/);
  const titles = page.locator("[role=tabpanel] li p:first-child");
  await expect(titles.first()).toContainText("Call the hiring manager");
  await page.getByRole("tab", { name: "Completed" }).click();
  await expect(page).not.toHaveURL(/sort=/);
  await expect(page.getByLabel("Sort by")).toHaveValue("-completed_at");
});

test("a note can be edited in place", async ({ page }) => {
  await registerUser(page);
  const company = uniqueName("Notes Co");
  await addJob(page, company, "Engineer");
  await page.getByRole("link", { name: new RegExp(company) }).first().click();

  await page.getByLabel("Note", { exact: true }).fill("Frist draft");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("Frist draft")).toBeVisible();

  await page.getByRole("button", { name: "Edit note" }).click();
  await page.getByLabel("Edit note").fill("First draft");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("First draft")).toBeVisible();
  await expect(page.getByText("Frist draft")).toBeHidden();
});
