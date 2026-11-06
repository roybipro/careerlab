import { defineConfig, devices } from "@playwright/test";

// The tests run against a running stack: `docker compose up -d --build` serves it on port 3000.
// Set PLAYWRIGHT_BASE_URL to point them somewhere else, for example the deployed site.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  // Each test registers its own user, so tests are independent, but the shared API is small.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    {
      name: "mobile",
      // Chromium at phone width, not a WebKit device profile.
      use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true },
      // Dragging is a desktop mouse feature (phones use the card's status menu), and the
      // isolation check does not depend on screen size.
      testIgnore: /(kanban-drag|isolation)\.spec\.ts/,
    },
  ],
});
