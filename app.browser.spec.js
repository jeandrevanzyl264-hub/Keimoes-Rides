import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Public map services are deliberately unavailable in these cases so fallback
  // behaviour is deterministic. Firebase remains real and local throughout.
  await page.route('**/*.basemaps.cartocdn.com/**', route => route.abort());
  await page.route('**/router.project-osrm.org/**', route => route.fulfill({ status: 503, body: 'Offline route fixture' }));
  await page.goto('/');
  await expect(page.getByText('Local demo', { exact: true })).toBeAttached();
  await expect(page.getByRole('heading', { name: /Your next stop/ })).toBeVisible();
});

test('guest can explore confirmed cash fares without invented driver availability', async ({ page }) => {
  const fare = page.locator('.fare-card-price > strong');
  await expect(fare).toHaveText(/R\s*25/);
  await page.getByRole('button', { name: 'More passengers', exact: true }).click();
  await expect(fare).toHaveText(/R\s*50/);
  await page.locator('.destination-card').filter({ hasText: 'Upper Town' }).click();
  await expect(fare).toHaveText(/R\s*70/);
  await page.getByRole('group', { name: 'Ride type' }).getByRole('button', { name: /Express/ }).click();
  await expect(fare).toHaveText(/R\s*150/);
  await expect(page.locator('.map-availability')).toContainText('Sign in to see live driver availability');
  await expect(page.locator('.kr-map-marker--driver')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign in to request a ride', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByLabel('Email address', { exact: true })).toBeVisible();
});

test('map pins have editable landmark labels and blocked tiles have an honest fallback', async ({ page }) => {
  await page.locator('.location-field').first().click();
  await page.locator('.leaflet-container').click({ position: { x: 250, y: 200 } });
  const landmark = page.getByLabel('Pickup landmark', { exact: true });
  await expect(landmark).toBeVisible();
  await landmark.fill('Blue gate opposite the shop');
  await expect(page.locator('.location-field').first()).toContainText('Blue gate opposite the shop');
  await expect(page.locator('.kr-map-marker--pickup')).toHaveCount(1);
  await expect(page.locator('.map-tile-status')).toContainText(/unavailable|decorative/i);
  await expect(page.locator('.map-route-status')).toContainText(/straight|approximation|routing/i);
});

test('GPS denial never fabricates a live location', async ({ page }) => {
  await page.getByRole('button', { name: /Use my current location/ }).click();
  await expect(page.getByText(/Location permission is off/)).toBeVisible();
  await expect(page.locator('.kr-map-marker--position')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Set pickup location/ })).toBeVisible();
});

test('mobile booking, safety dialog and offline state remain usable', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Safety centre', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('link', { name: /10111/ })).toHaveAttribute('href', 'tel:10111');
  await expect(dialog.getByRole('link', { name: /112/ })).toHaveAttribute('href', 'tel:112');
  await expect(dialog).toContainText('not biometric or government verification');
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await context.setOffline(true);
  await expect(page.getByText('You are offline. Ride updates and booking need an internet connection.', { exact: true })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText('You are offline. Ride updates and booking need an internet connection.', { exact: true })).toHaveCount(0);
});
