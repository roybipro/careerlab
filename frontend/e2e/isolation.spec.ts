import { expect, test } from "@playwright/test";
import { addJob, registerUser, uniqueName } from "./helpers";

test("another user's job opens as not found and none of its data is shown", async ({ browser, baseURL }) => {
  // Separate contexts mean separate cookies: two different people.
  const contextA = await browser.newContext({ baseURL });
  const contextB = await browser.newContext({ baseURL });
  try {
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await registerUser(pageA, "Ana Owner");
    const company = uniqueName("SecretCo");
    const position = uniqueName("Hidden Role");
    await addJob(pageA, company, position);
    await pageA.getByRole("link", { name: company }).click();
    await expect(pageA.getByRole("heading", { name: company })).toBeVisible();
    const jobUrl = pageA.url();
    expect(jobUrl).toMatch(/\/jobs\/[0-9a-f-]{36}$/);

    await registerUser(pageB, "Ben Stranger");
    await pageB.goto(jobUrl);
    await expect(pageB.getByRole("heading", { name: "Job not found" })).toBeVisible();
    await expect(pageB.locator("body")).not.toContainText(company);
    await expect(pageB.locator("body")).not.toContainText(position);

    // The API gives the same answer, so the page is not merely hiding data it received.
    const jobId = jobUrl.split("/").pop();
    const response = await contextB.request.get(`/api/v1/jobs/${jobId}`);
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain(company);

    // The owner still sees their job.
    await pageA.goto(jobUrl);
    await expect(pageA.getByRole("heading", { name: company })).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test("another user's research project opens as not found and none of its data is shown", async ({ browser, baseURL }) => {
  const contextA = await browser.newContext({ baseURL });
  const contextB = await browser.newContext({ baseURL });
  try {
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await registerUser(pageA, "Ana Owner");
    const title = uniqueName("Secret Study");
    const venue = uniqueName("Hidden Symposium");
    const milestone = uniqueName("Hidden Step");
    await pageA.goto("/projects");
    await pageA.getByRole("button", { name: /^Add (your first )?project$/ }).first().click();
    const dialog = pageA.getByRole("dialog", { name: "Add a research project" });
    await dialog.getByLabel("Title", { exact: true }).fill(title);
    await dialog.getByRole("button", { name: "Add project" }).click();
    await expect(dialog).toBeHidden();
    await pageA.getByRole("link", { name: title }).click();
    await expect(pageA.getByRole("heading", { name: title })).toBeVisible();
    const projectUrl = pageA.url();
    expect(projectUrl).toMatch(/\/projects\/[0-9a-f-]{36}$/);
    const projectId = projectUrl.split("/").pop();

    await pageA.getByRole("button", { name: "Add submission" }).click();
    const submission = pageA.getByRole("dialog", { name: "Add a submission" });
    await submission.getByLabel("Venue", { exact: true }).fill(venue);
    await submission.getByRole("button", { name: "Add submission" }).click();
    await expect(submission).toBeHidden();
    await pageA.getByLabel("New milestone title").fill(milestone);
    await pageA.getByRole("button", { name: "Add", exact: true }).click();
    await expect(pageA.getByText(milestone, { exact: true })).toBeVisible();

    await registerUser(pageB, "Ben Stranger");
    await pageB.goto(projectUrl);
    await expect(pageB.getByRole("heading", { name: "Research project not found" })).toBeVisible();
    for (const secret of [title, venue, milestone]) await expect(pageB.locator("body")).not.toContainText(secret);

    // The API gives the same answer for the project and what hangs off it.
    for (const path of ["", "/submissions", "/milestones"]) {
      const response = await contextB.request.get(`/api/v1/projects/${projectId}${path}`);
      expect(response.status(), path).toBe(404);
      const text = await response.text();
      for (const secret of [title, venue, milestone]) expect(text).not.toContain(secret);
    }

    // The owner still sees it.
    await pageA.goto(projectUrl);
    await expect(pageA.getByRole("heading", { name: title })).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
