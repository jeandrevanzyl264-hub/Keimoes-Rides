import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// These privileged fixtures are deliberately restricted to the local demo project.
const PROJECT = 'demo-keimoes-rides';
const APP_URL = 'http://127.0.0.1:5173';
const PASSWORD = 'KeimoesRide2026!';
const FUNCTIONS = `http://127.0.0.1:5001/${PROJECT}/us-central1`;
const AUTH = 'http://127.0.0.1:9099';
const DRIVER_GPS = { latitude: -28.710123, longitude: 20.970456, accuracy: 10 };
const PASSENGER_GPS = { latitude: -28.713234, longitude: 20.967345, accuracy: 8 };
const MOVED_GPS = { latitude: -28.711567, longitude: 20.969789, accuracy: 7 };
const PHOTO = fileURLToPath(new URL('../public/icons/icon-192.png', import.meta.url));
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
const requireFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = requireFunctions('firebase-admin/app');
const { getAuth } = requireFunctions('firebase-admin/auth');
const { getFirestore } = requireFunctions('firebase-admin/firestore');
const { getStorage } = requireFunctions('firebase-admin/storage');

async function signInToken(email) {
  const response = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-test-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(`Auth emulator fixture failed: ${body.error?.message || response.status}`);
  return body.idToken;
}

async function callable(name, data, token) {
  const response = await fetch(`${FUNCTIONS}/${name}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(`${name} fixture failed: ${body.error?.message || response.status}`);
  return body.result;
}

async function login(page, account) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  // A reused Vite server must also be in emulator mode before any UI auth call.
  await expect(page.getByText('Local demo', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Email address', { exact: true }).fill(account.email);
  await dialog.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

test('manual driver review, dispatch, live tracking, cash completion and rating across three sessions', async ({ browser }) => {
  test.setTimeout(180_000);
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const fixtureApp = initializeApp({ projectId: PROJECT, storageBucket: `${PROJECT}.appspot.com` }, `browser-ride-${suffix}`);
  const adminAuth = getAuth(fixtureApp);
  const db = getFirestore(fixtureApp);
  const bucket = getStorage(fixtureApp).bucket();
  const accounts = [];
  const contexts = [];
  const pages = [];
  let rideId;
  let driver;

  async function account(kind, role, admin = false) {
    const email = `journey-${kind}-${suffix}@example.test`;
    const name = `Journey ${kind} ${suffix}`;
    const record = await adminAuth.createUser({ email, password: PASSWORD, emailVerified: true, displayName: name });
    const created = { uid: record.uid, email, name, role };
    accounts.push(created);
    if (admin) await adminAuth.setCustomUserClaims(created.uid, { admin: true });
    created.token = await signInToken(email);
    await callable('saveProfile', { name, phone: kind === 'driver' ? '0834567890' : '0823456789', role }, created.token);
    return created;
  }

  async function context(gps) {
    const created = await browser.newContext({ baseURL: APP_URL, viewport: { width: 1440, height: 1000 }, ...(gps ? { geolocation: gps, permissions: ['geolocation'] } : {}) });
    created.setDefaultTimeout(15_000);
    created.setDefaultNavigationTimeout(20_000);
    contexts.push(created);
    return created;
  }

  try {
    driver = await account('driver', 'driver');
    const passenger = await account('passenger', 'passenger');
    const operator = await account('operator', 'passenger', true);
    const driverContext = await context(DRIVER_GPS);
    const passengerContext = await context(PASSENGER_GPS);
    const operatorContext = await context();
    const driverPage = await driverContext.newPage();
    const passengerPage = await passengerContext.newPage();
    const operatorPage = await operatorContext.newPage();
    pages.push(['driver', driverPage], ['passenger', passengerPage], ['operator', operatorPage]);
    await login(driverPage, driver);
    await login(passengerPage, passenger);
    await login(operatorPage, operator);

    await test.step('driver uploads all three required images and cannot go online before manual review', async () => {
      await expect(driverPage.getByRole('heading', { name: 'A familiar face. A trusted ride.' })).toBeVisible();
      await driverPage.getByLabel('Vehicle make & model', { exact: true }).fill('Toyota Corolla');
      await driverPage.getByLabel('Vehicle colour', { exact: true }).fill('Silver');
      await driverPage.getByLabel('Registration plate', { exact: true }).fill(`KR ${suffix.slice(-5)} NC`);
      await driverPage.getByRole('combobox', { name: /Passenger seats/ }).selectOption('4');
      for (const label of ['A clear face photo', 'Driving licence', 'Passenger transport documents']) {
        await driverPage.getByLabel(label, { exact: true }).setInputFiles(PHOTO);
      }
      await driverPage.getByRole('checkbox', { name: /I confirm these details and documents are mine/ }).check();
      await driverPage.getByRole('button', { name: 'Submit for driver review', exact: true }).click();
      await expect(driverPage.getByText('Your application is awaiting review', { exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(driverPage.getByRole('switch', { name: 'Driver availability' })).toHaveCount(0);
      const application = (await db.doc(`kr_driverApplications/${driver.uid}`).get()).data();
      expect(application.status).toBe('pending');
      expect((await db.doc(`kr_publicDrivers/${driver.uid}`).get()).exists).toBe(false);
    });

    await test.step('a separate claimed administrator loads every private photo and approves the driver', async () => {
      await operatorPage.getByRole('button', { name: 'Driver review administration', exact: true }).click();
      const card = operatorPage.locator('.review-card').filter({ has: operatorPage.getByRole('heading', { name: driver.name, exact: true }) });
      await expect(card).toBeVisible();
      for (const alt of ['Face photo', 'Driving licence', 'Passenger transport document']) {
        const image = card.getByRole('img', { name: alt, exact: true });
        await expect(image).toHaveJSProperty('complete', true, { timeout: 30_000 });
        await expect(image).toHaveJSProperty('naturalWidth', 192);
      }
      const approval = card.getByRole('button', { name: 'Approve driver', exact: true });
      await expect(approval).toBeDisabled();
      await card.getByRole('checkbox', { name: /I have compared the face photo/ }).check();
      await approval.click();
      await expect(card).not.toBeVisible();
      await expect(driverPage.getByRole('switch', { name: 'Driver availability' })).toBeVisible();
      expect((await db.doc(`kr_driverApplications/${driver.uid}`).get()).data().status).toBe('approved');
      expect((await db.doc(`kr_publicDrivers/${driver.uid}`).get()).data().verified).toBe(true);
    });

    await test.step('driver enables real browser GPS and passenger requests a two-person R50 cash ride', async () => {
      await driverPage.bringToFront();
      const availability = driverPage.getByRole('switch', { name: 'Driver availability' });
      await availability.click();
      await expect(availability).toHaveAttribute('aria-checked', 'true', { timeout: 20_000 });
      await expect.poll(async () => (await db.doc(`kr_publicDrivers/${driver.uid}`).get()).data().online).toBe(true);
      await passengerPage.bringToFront();
      await passengerPage.getByRole('button', { name: 'Use my current location', exact: true }).click();
      await expect(passengerPage.getByRole('button', { name: /Your pickup My current location/ })).toBeVisible();
      await passengerPage.getByRole('button', { name: /^Keimoes Central/ }).click();
      await passengerPage.getByRole('button', { name: 'More passengers', exact: true }).click();
      await passengerPage.getByLabel('Pickup landmark', { exact: true }).fill(`Journey pickup ${suffix}`);
      await passengerPage.getByPlaceholder('A landmark, gate colour, anything helpful…').fill(`Blue gate — journey ${suffix}`);
      await expect(passengerPage.locator('.fare-card-price strong')).toHaveText(/R\s*50/);
      await passengerPage.getByRole('button', { name: 'Request a ride', exact: true }).click();
      await expect(passengerPage.getByRole('heading', { name: 'Finding your driver', exact: true })).toBeVisible();
      await expect.poll(async () => {
        rideId = (await db.doc(`kr_users/${passenger.uid}`).get()).data()?.activeRideId;
        return Boolean(rideId);
      }).toBe(true);
      const ride = (await db.doc(`kr_rides/${rideId}`).get()).data();
      expect(ride).toMatchObject({ status: 'requested', fare: 50, passengers: 2, paymentMethod: 'cash', driverId: null });
      expect(ride.pickup.lat).toBe(PASSENGER_GPS.latitude);
      expect(ride.pickup.lng).toBe(PASSENGER_GPS.longitude);
      const advertised = (await db.doc(`kr_rideRequests/${rideId}`).get()).data();
      expect(advertised.passenger).toBeUndefined();
      expect(advertised.note).toBeUndefined();
      expect(advertised.pickup.lat).not.toBe(ride.pickup.lat);
      expect(advertised.pickup.lng).not.toBe(ride.pickup.lng);
      const request = driverPage.locator(`.request-card[data-ride-id="${rideId}"]`);
      await expect(request).toBeVisible();
      await expect(request).not.toContainText(passenger.name);
      await expect(request).not.toContainText(`Journey pickup ${suffix}`);
      await expect(request).not.toContainText(`Blue gate — journey ${suffix}`);
      await expect(request).toContainText('Nearby pickup in Keimoes');
      await driverPage.bringToFront();
      await request.getByRole('button', { name: 'Accept ride', exact: true }).click();
      await expect(driverPage.getByRole('heading', { name: 'Head to your passenger', exact: true })).toBeVisible();
      await expect(passengerPage.getByRole('heading', { name: 'Your driver is on the way', exact: true })).toBeVisible();
      await expect(passengerPage.getByRole('heading', { name: driver.name, exact: true })).toBeVisible();
      await expect(passengerPage.getByText('Manually verified', { exact: true })).toBeVisible();
      await expect(passengerPage.locator('.number-plate')).toHaveText(`KR ${suffix.slice(-5)} NC`);
      await expect(passengerPage.locator('.driver-profile img')).toHaveJSProperty('naturalWidth', 192);
      expect((await db.doc(`kr_rideRequests/${rideId}`).get()).exists).toBe(false);
      expect((await db.doc(`kr_users/${driver.uid}`).get()).data().activeRideId).toBe(rideId);
    });

    await test.step('both participants chat safely and an actual GPS update reaches the passenger map', async () => {
      const message = '<img src=x onerror="window.__chatXss=true"> At the blue gate.';
      await passengerPage.getByLabel('Message', { exact: true }).fill(message);
      await passengerPage.getByRole('button', { name: 'Send message', exact: true }).click();
      await expect(driverPage.getByRole('log', { name: 'Messages' }).getByText(message, { exact: true })).toBeVisible();
      expect(await driverPage.evaluate(() => window.__chatXss)).toBeUndefined();
      await expect(driverPage.getByRole('log', { name: 'Messages' }).locator('img')).toHaveCount(0);
      await driverPage.getByLabel('Message', { exact: true }).fill('I am on my way. Please check the plate.');
      await driverPage.getByRole('button', { name: 'Send message', exact: true }).click();
      await expect(passengerPage.getByRole('log', { name: 'Messages' }).getByText('I am on my way. Please check the plate.', { exact: true })).toBeVisible();
      await driverPage.bringToFront();
      expect(await driverPage.evaluate(() => document.visibilityState)).toBe('visible');
      await driverContext.setGeolocation(MOVED_GPS);
      await expect(driverPage.locator('.kr-map-marker--position[title="Your GPS location"]')).toBeAttached();
      await expect.poll(async () => {
        const location = (await db.doc(`kr_rides/${rideId}`).get()).data()?.driverLocation;
        return location?.lat === MOVED_GPS.latitude && location?.lng === MOVED_GPS.longitude;
      }, { timeout: 35_000, message: 'The fresh browser GPS sample should be published to the assigned trip' }).toBe(true);
      const marker = passengerPage.locator('.kr-map-marker--driver[title="Assigned driver · recent GPS location"]');
      await expect(marker).toBeAttached();
      await expect(passengerPage.locator('.location-freshness')).toContainText('Driver location updated');
      await passengerPage.reload();
      await expect(passengerPage.getByRole('heading', { name: 'Your driver is on the way', exact: true })).toBeVisible();
      await expect(passengerPage.getByRole('log', { name: 'Messages' }).getByText(message, { exact: true })).toBeVisible();
      expect((await db.doc(`kr_users/${passenger.uid}`).get()).data().activeRideId).toBe(rideId);
    });

    await test.step('driver follows arrival, start and explicit cash completion; both active-trip locks clear', async () => {
      await driverPage.bringToFront();
      await driverPage.getByRole('button', { name: 'I have arrived at pickup', exact: true }).click();
      await expect(passengerPage.getByRole('heading', { name: 'Your driver has arrived', exact: true })).toBeVisible();
      await driverPage.getByRole('button', { name: 'Start ride', exact: true }).click();
      await expect(passengerPage.getByRole('heading', { name: 'Enjoy the ride', exact: true })).toBeVisible();
      await driverPage.getByRole('button', { name: 'Complete ride', exact: true }).click();
      const completion = driverPage.getByRole('dialog', { name: 'A good journey, complete.' });
      await expect(completion.getByRole('button', { name: 'Confirm ride complete', exact: true })).toBeDisabled();
      await completion.getByRole('checkbox', { name: /The destination has been reached/ }).check();
      await completion.getByRole('button', { name: 'Confirm ride complete', exact: true }).click();
      await expect(completion).not.toBeVisible();
      await expect.poll(async () => {
        const [trip, rider, chauffeur] = await db.getAll(db.doc(`kr_rides/${rideId}`), db.doc(`kr_users/${passenger.uid}`), db.doc(`kr_users/${driver.uid}`));
        return trip.data().status === 'completed' && rider.data().activeRideId === null && chauffeur.data().activeRideId === null;
      }).toBe(true);
      expect((await db.doc(`kr_rideRequests/${rideId}`).get()).exists).toBe(false);
    });

    await test.step('passenger rates the completed history entry and driver sees the earned cash fare', async () => {
      const automaticRating = passengerPage.getByRole('dialog', { name: 'How was the ride?' });
      await expect(automaticRating).toBeVisible();
      await automaticRating.getByRole('button', { name: 'Close dialog', exact: true }).click();
      await passengerPage.getByRole('button', { name: 'Ride history', exact: true }).click();
      const entry = passengerPage.locator(`.history-item[data-ride-id="${rideId}"]`);
      await expect(entry).toContainText('completed');
      await entry.getByRole('button', { name: 'Rate your ride', exact: true }).click();
      const rating = passengerPage.getByRole('dialog', { name: 'How was the ride?' });
      await rating.getByRole('button', { name: '5 stars', exact: true }).click();
      await rating.getByPlaceholder('Tell us how your ride went').fill('A friendly local ride. Thank you.');
      await rating.getByRole('button', { name: 'Submit rating', exact: true }).click();
      await expect(rating).not.toBeVisible();
      await expect(entry.locator('.history-rating')).toHaveText('5/5');
      expect((await db.doc(`kr_rides/${rideId}`).get()).data().rating).toMatchObject({ score: 5, comment: 'A friendly local ride. Thank you.' });
      await expect(driverPage.locator('.driver-stats')).toContainText(/R\s*50/);
      await driverPage.getByRole('button', { name: 'Ride history', exact: true }).click();
      const driverEntry = driverPage.locator(`.history-item[data-ride-id="${rideId}"]`);
      await expect(driverEntry).toContainText(passenger.name);
      await expect(driverEntry).toContainText('completed');
      await driverPage.getByRole('dialog', { name: 'Your journeys' }).getByRole('button', { name: 'Close dialog', exact: true }).click();
    });

    await test.step('a failed offline-status request still signs the idle driver out locally', async () => {
      await driverPage.route('**/us-central1/setAvailability', async (route) => {
        const headers = { 'Access-Control-Allow-Origin': APP_URL, 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
        if (route.request().method() === 'OPTIONS') await route.fulfill({ status: 204, headers });
        else await route.fulfill({ status: 503, headers, contentType: 'application/json', body: JSON.stringify({ error: { status: 'UNAVAILABLE', message: 'Simulated offline connection for the logout test.' } }) });
      });
      await driverPage.getByRole('button', { name: 'Your account', exact: true }).click();
      await driverPage.getByRole('button', { name: 'Manage sign-in & verification', exact: true }).click();
      const accountDialog = driverPage.getByRole('dialog', { name: 'Your account, your way.' });
      await accountDialog.getByRole('button', { name: 'Sign out of this account', exact: true }).click();
      await expect(accountDialog).not.toBeVisible();
      await expect(driverPage.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
      await expect(driverPage.getByText('You are signed out. Driver offline status could not be confirmed; your live marker will expire when its location becomes stale.', { exact: true })).toBeVisible();
    });
  } catch (error) {
    for (const [role, page] of pages) {
      if (!page.isClosed()) {
        await test.info().attach(`${role}-last-screen`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' }).catch(() => {});
      }
    }
    throw error;
  } finally {
    await Promise.allSettled(contexts.map(created => created.close()));
    // Only delete IDs created by this test; retain unrelated emulator fixtures.
    if (rideId) {
      await db.recursiveDelete(db.doc(`kr_rides/${rideId}`));
      await db.doc(`kr_rideRequests/${rideId}`).delete();
    }
    if (driver) {
      const audit = await db.collection('kr_adminAudit').where('driverId', '==', driver.uid).get();
      await Promise.all(audit.docs.map(document => document.ref.delete()));
      await Promise.all([
        `driver-portraits/${driver.uid}/portrait`, `driver-documents/${driver.uid}/license`, `driver-documents/${driver.uid}/permit`,
      ].map(path => bucket.file(path).delete({ ignoreNotFound: true })));
    }
    for (const created of accounts) {
      await Promise.all(['kr_users', 'kr_driverApplications', 'kr_publicDrivers'].map(collection => db.doc(`${collection}/${created.uid}`).delete()));
      await adminAuth.deleteUser(created.uid);
    }
    await deleteApp(fixtureApp);
  }
});
