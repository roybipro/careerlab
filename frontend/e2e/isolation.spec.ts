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
