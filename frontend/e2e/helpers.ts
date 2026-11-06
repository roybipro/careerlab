import { expect, type Locator, type Page } from "@playwright/test";

export const PASSWORD = "e2e-password-1234";

/** A fresh address per call on a normal domain (the API rejects special-use ones such as .test). */
export function uniqueEmail(): string {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `e2e-${id}@example.com`;
}

/** A value that cannot clash with anything else on the page. */
export function uniqueName(prefix: string): string {
  return `${prefix} ${Math.random().toString(36).slice(2, 8)}`;
}

/** Creates an account through the register page and waits for the dashboard. */
export async function registerUser(page: Page, fullName = "Eve Tester"): Promise<string> {
  const email = uniqueEmail();
  await page.goto("/register");
  await page.getByLabel("Full name").fill(fullName);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: `Welcome, ${fullName.split(" ")[0]}` })).toBeVisible();
  return email;
}

/** Adds a job from the Job Applications page, in the table view. Returns once the dialog has closed. */
export async function addJob(page: Page, company: string, position: string): Promise<void> {
  await page.goto("/jobs");
  await page.getByRole("button", { name: "Add job" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add a job" });
  await dialog.getByLabel("Company", { exact: true }).fill(company);
  await dialog.getByLabel("Position", { exact: true }).fill(position);
  await dialog.getByRole("button", { name: "Add job" }).click();
  await expect(dialog).toBeHidden();
}

export function summaryCard(page: Page, key: string): Locator {
  return page.getByTestId(`card-${key}`);
}

/** `YYYY-MM-DDTHH:mm` in local time, the format a datetime-local input takes. */
export function localDatetime(offsetHours: number): string {
  const d = new Date(Date.now() + offsetHours * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
