import { test, expect } from "@playwright/test";

const androidAgent =
  "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const iphoneAgent =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

test.describe("Home screen installation", () => {
  test.use({ viewport: { width: 390, height: 844 }, userAgent: androidAgent });

  test("uses the browser install event and waits for installation confirmation", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("button", {
        name: "Install Keimoes Rides app",
        exact: true,
      }),
    ).toBeVisible();
    await page.evaluate(() => {
      // A real OS install dialog is outside browser automation. Exercise the
      // browser's documented lifecycle without declaring installation early.
      const event = new Event("beforeinstallprompt", { cancelable: true });
      event.prompt = async () => {
        window.testInstallPromptCalls =
          (window.testInstallPromptCalls || 0) + 1;
      };
      event.userChoice = Promise.resolve({
        outcome: "accepted",
        platform: "web",
      });
      window.dispatchEvent(event);
    });
    await page
      .getByRole("button", { name: "Install Keimoes Rides app", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Install Keimoes Rides", exact: true })
      .click();
    await expect(
      page.getByText(
        "Installation accepted. Finish any remaining step shown by your browser.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Keep Keimoes close.", exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => window.testInstallPromptCalls)).toBe(1);
    await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
    await expect(
      page.getByRole("heading", { name: "You are all set.", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Keimoes Rides app installation options",
        exact: true,
      }),
    ).toBeFocused();
    expect(await page.evaluate(() => document.body.scrollWidth)).toBe(390);
  });

  test("provides Android browser steps when no native prompt is available", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Install Keimoes Rides app", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Keep Keimoes close." });
    await expect(
      dialog.getByRole("heading", { name: "On your Android phone" }),
    ).toBeVisible();
    await expect(
      dialog.getByText("Add to Home screen", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", {
        name: "Install Keimoes Rides",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(dialog).not.toContainText("is installed on this device");
  });
});

test("gives Safari home screen steps on iPhone without pretending to install", async ({
  browser,
}) => {
  const context = await browser.newContext({
    userAgent: iphoneAgent,
    viewport: { width: 375, height: 812 },
  });
  const page = await context.newPage();
  try {
    await page.goto("http://127.0.0.1:5173/");
    await page
      .getByRole("button", { name: "Install Keimoes Rides app", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Keep Keimoes close." });
    await expect(
      dialog.getByRole("heading", { name: "On your iPhone or iPad" }),
    ).toBeVisible();
    await expect(dialog.getByText("Safari", { exact: true })).toBeVisible();
    await expect(
      dialog.getByText("Add to Home Screen", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", {
        name: "Install Keimoes Rides",
        exact: true,
      }),
    ).toHaveCount(0);
    expect(await page.evaluate(() => document.body.scrollWidth)).toBe(375);
  } finally {
    await context.close();
  }
});

test("insecure private HTTP permits map exploration but blocks credentials, booking and GPS", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const serviceRequests = [];
  page.on("request", (request) => {
    if (
      /identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|firestore\.googleapis\.com|:\b(?:9099|5001|8080|9199)\b/.test(
        request.url(),
      )
    )
      serviceRequests.push(request.url());
  });
  // Preserve a real insecure origin and normal browser security. Only static
  // Vite assets are forwarded to the local test server.
  await page.route("http://192.168.0.106:5173/**", async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({
      url: `http://127.0.0.1:5173${url.pathname}${url.search}`,
    });
    await route.fulfill({ response });
  });
  await page.goto("http://192.168.0.106:5173/");
  expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
  await expect(page.locator(".runtime-warning")).toContainText(
    "published HTTPS",
  );
  await expect(
    page.getByRole("button", {
      name: "Open the secure app to book",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Use my current location", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const auth = page.getByRole("dialog");
  await expect(
    auth.getByText("Open Keimoes Rides securely", { exact: true }),
  ).toBeVisible();
  await expect(auth.locator("input")).toHaveCount(0);
  expect(serviceRequests).toEqual([]);
  await page
    .getByRole("button", { name: "Close sign-in dialog", exact: true })
    .click();

  await page.getByRole("button", { name: /Set pickup location/ }).click();
  await expect(page.locator(".map-selection-hint")).toContainText("pickup");
  await page.locator(".map-canvas").click({ position: { x: 150, y: 170 } });
  await expect(page.getByLabel(/Pickup landmark/)).toBeVisible();
  await page.getByLabel(/Pickup landmark/).fill("Keimoes library entrance");
  await expect(page.locator(".location-field").first()).toContainText(
    "Keimoes library entrance",
  );

  await page
    .getByRole("button", { name: "Install Keimoes Rides app", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByText("Open the secure website first", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Install Keimoes Rides", exact: true }),
  ).toHaveCount(0);
  expect(serviceRequests).toEqual([]);
  expect(await page.evaluate(() => document.body.scrollWidth)).toBe(390);
});
