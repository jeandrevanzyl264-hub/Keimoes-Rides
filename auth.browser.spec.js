import { test, expect } from '@playwright/test';
import { assessRuntime } from '../src/runtime-config.js';

const PROJECT = 'demo-keimoes-rides';
const AUTH = 'http://127.0.0.1:9099';
const PASSWORD = 'KeimoesRide2026!';
const unique = () => `${Date.now()}${Math.floor(Math.random() * 1e7)}`;

async function identity(action, body) {
  const response = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:${action}?key=emulator-test-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(`Auth emulator ${action}: ${result.error?.message || response.status}`);
  return result;
}

async function getCode(email, type) {
  let code;
  await expect.poll(async () => {
    const response = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`);
    const result = await response.json();
    code = result.oobCodes?.filter((item) => (item.email === email || item.newEmail === email) && item.requestType === type).at(-1);
    return Boolean(code);
  }, { timeout: 15_000, message: `Expected a real ${type} action from the Auth emulator` }).toBe(true);
  return code;
}

async function seedUser({ email = `auth-${unique()}@example.com`, profile = true, verified = true } = {}) {
  const account = await identity('signUp', { email, password: PASSWORD, returnSecureToken: true });
  if (profile) {
    const response = await fetch(`http://127.0.0.1:5001/${PROJECT}/us-central1/saveProfile`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.idToken}` },
      body: JSON.stringify({ data: { name: 'Browser Test Rider', phone: '+27821234567', role: 'passenger' } }),
    });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(`Profile fixture failed: ${result.error?.message || response.status}`);
  }
  if (verified) {
    await identity('sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: account.idToken });
    const code = await getCode(email, 'VERIFY_EMAIL');
    await identity('update', { oobCode: code.oobCode });
  }
  return { ...account, email };
}

async function openSignIn(page) {
  await page.goto('/');
  // Never create test accounts in the preserved production Firebase project.
  await expect(page.getByText('Local demo', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^sign in$/i }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Good to see you again.' })).toBeVisible();
  return dialog;
}

test.describe('Firebase authentication in the browser', () => {
  test('guest registration controls validate passwords and contain keyboard focus', async ({ page }) => {
    const authRequests = [];
    page.on('request', (request) => {
      if (request.url().includes('identitytoolkit.googleapis.com')) authRequests.push(request.url());
    });
    const dialog = await openSignIn(page);
    await expect(dialog.getByText('Accounts stay in the local Firebase emulators. Verification, password reset and email-change emails are not sent. Use the action link printed in the Auth emulator terminal.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Create an account', exact: true }).click();
    await expect(dialog.getByRole('radio', { name: 'Find a ride' })).toBeChecked();
    await dialog.getByRole('radio', { name: 'Become a driver' }).check();
    await expect(dialog.getByText('Drivers submit a face photo, licence, operating permit and vehicle details for manual review. Approval is required before going online.')).toBeVisible();
    await dialog.getByLabel('Full name', { exact: true }).fill('Guest Driver');
    await dialog.getByLabel('Mobile number', { exact: true }).fill('082 123 4567');
    await dialog.getByLabel('Email address', { exact: true }).fill('guest-validation@example.com');
    await dialog.getByLabel('Create a password', { exact: true }).fill('weakpassword');
    await dialog.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('capital letter');
    expect(authRequests).toEqual([]);
    await dialog.getByLabel('Create a password', { exact: true }).fill(PASSWORD);
    await dialog.getByRole('button', { name: 'Show password', exact: true }).click();
    await expect(dialog.getByLabel('Create a password', { exact: true })).toHaveAttribute('type', 'text');
    await dialog.getByRole('button', { name: 'Close sign-in dialog', exact: true }).focus();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: 'Sign in', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Close sign-in dialog', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('button', { name: /^sign in$/i }).first()).toBeFocused();
  });

  test('registers a passenger, normalises their phone and verifies the actual account', async ({ page }) => {
    const email = `registration-${unique()}@example.com`;
    const dialog = await openSignIn(page);
    await dialog.getByRole('button', { name: 'Create an account', exact: true }).click();
    await dialog.getByLabel('Full name', { exact: true }).fill('Karoo Test Passenger');
    await dialog.getByLabel('Mobile number', { exact: true }).fill('082 345 6789');
    await dialog.getByLabel('Email address', { exact: true }).fill(email);
    await dialog.getByLabel('Create a password', { exact: true }).fill(PASSWORD);
    await dialog.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: 'One quick email check.' })).toBeVisible({ timeout: 25_000 });
    await expect(dialog.getByRole('status')).toContainText('No email is sent in test mode.');

    const code = await getCode(email, 'VERIFY_EMAIL');
    await identity('update', { oobCode: code.oobCode });
    await dialog.getByRole('button', { name: 'I’ve verified my email', exact: true }).click();
    await expect(dialog).not.toBeVisible();

    const account = await identity('signInWithPassword', { email, password: PASSWORD, returnSecureToken: true });
    const result = await identity('lookup', { idToken: account.idToken });
    expect(result.users[0].emailVerified).toBe(true);
    const profileResponse = await fetch(`http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/kr_users/${account.localId}`, {
      headers: { Authorization: `Bearer ${account.idToken}` },
    });
    expect(profileResponse.ok).toBe(true);
    const profile = await profileResponse.json();
    expect(profile.fields.name.stringValue).toBe('Karoo Test Passenger');
    expect(profile.fields.phone.stringValue).toBe('+27823456789');
    expect(profile.fields.role.stringValue).toBe('passenger');
    await page.reload();
    await expect(page.getByRole('button', { name: /^sign in$/i })).toHaveCount(0);
  });

  test('registers a driver and requires separate manual approval after email verification', async ({ page }) => {
    const email = `driver-registration-${unique()}@example.com`;
    await page.goto('/');
    await expect(page.getByText('Local demo', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Drive with us', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('radio', { name: 'Become a driver' })).toBeChecked();
    await dialog.getByLabel('Full name', { exact: true }).fill('Karoo Test Driver');
    await dialog.getByLabel('Mobile number', { exact: true }).fill('083 456 7890');
    await dialog.getByLabel('Email address', { exact: true }).fill(email);
    await dialog.getByLabel('Create a password', { exact: true }).fill(PASSWORD);
    await dialog.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: 'One quick email check.' })).toBeVisible({ timeout: 25_000 });
    const code = await getCode(email, 'VERIFY_EMAIL');
    await identity('update', { oobCode: code.oobCode });
    await dialog.getByRole('button', { name: 'I’ve verified my email', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'A familiar face. A trusted ride.' })).toBeVisible();
    await expect(page.getByLabel('A clear face photo', { exact: true })).toBeAttached();
    await expect(page.getByRole('switch', { name: 'Driver availability' })).toHaveCount(0);
    const account = await identity('signInWithPassword', { email, password: PASSWORD, returnSecureToken: true });
    const profileResponse = await fetch(`http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/kr_users/${account.localId}`, {
      headers: { Authorization: `Bearer ${account.idToken}` },
    });
    expect(profileResponse.ok).toBe(true);
    const profile = await profileResponse.json();
    expect(profile.fields.role.stringValue).toBe('driver');
    const publicResponse = await fetch(`http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/kr_publicDrivers/${account.localId}`, {
      headers: { Authorization: `Bearer ${account.idToken}` },
    });
    expect(publicResponse.status).toBe(404);
  });

  test('keeps invalid sign-in separate from registration and restores keyboard focus', async ({ page }) => {
    const account = await seedUser();
    const dialog = await openSignIn(page);
    await dialog.getByLabel('Email address', { exact: true }).fill(account.email);
    await dialog.getByLabel('Password', { exact: true }).fill('IncorrectPassword43!');
    await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('did not match');
    await expect(dialog.getByRole('heading', { name: 'Good to see you again.' })).toBeVisible();
    await dialog.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await dialog.getByRole('button', { name: 'Show password', exact: true }).click();
    await expect(dialog.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
    await dialog.getByRole('button', { name: 'Hide password', exact: true }).click();
    await expect(dialog.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('button', { name: /^sign in$/i }).first()).toBeFocused();
    await page.getByRole('button', { name: /^sign in$/i }).first().click();
    await page.getByRole('dialog').getByLabel('Email address', { exact: true }).fill(account.email);
    await page.getByRole('dialog').getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('dialog').getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('explains unreachable local sign-in without blaming the user’s Wi-Fi', async ({ page }) => {
    const dialog = await openSignIn(page);
    await page.route('**/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword*', route => route.abort('connectionrefused'));
    await dialog.getByLabel('Email address', { exact: true }).fill('unreachable-local-service@example.test');
    await dialog.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Local test sign-in is unreachable from this device.');
    await expect(dialog.getByRole('alert')).toContainText('development computer');
    await expect(dialog.getByRole('heading', { name: 'Good to see you again.' })).toBeVisible();
  });

  test('keeps a created account recoverable when Firebase rejects its email return domain', async ({ page }) => {
    const email = `email-config-${unique()}@example.com`;
    const dialog = await openSignIn(page);
    await dialog.getByRole('button', { name: 'Create an account', exact: true }).click();
    await dialog.getByLabel('Full name', { exact: true }).fill('Email Setup Test');
    await dialog.getByLabel('Mobile number', { exact: true }).fill('082 345 6789');
    await dialog.getByLabel('Email address', { exact: true }).fill(email);
    await dialog.getByLabel('Create a password', { exact: true }).fill(PASSWORD);
    const actionUrl = '**/identitytoolkit.googleapis.com/v1/accounts:sendOobCode*';
    await page.route(actionUrl, route => route.fulfill({
      status: 400, contentType: 'application/json',
      body: JSON.stringify({ error: { code: 400, message: 'UNAUTHORIZED_CONTINUE_URI' } }),
    }));
    await dialog.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: 'One quick email check.' })).toBeVisible({ timeout: 25_000 });
    await expect(dialog.getByRole('alert')).toContainText('Your account is ready, but a verification link could not be requested.');
    await expect(dialog.getByRole('alert')).toContainText('Authorised domains');
    await expect(dialog.getByRole('status')).toHaveCount(0);
    await page.unroute(actionUrl);
    await dialog.getByRole('button', { name: 'Create another test verification link', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('No email is sent in test mode.');
    await getCode(email, 'VERIFY_EMAIL');
    const signedIn = await identity('signInWithPassword', { email, password: PASSWORD, returnSecureToken: true });
    expect(signedIn.localId).toBeTruthy();
  });

  test('blocks credential entry on a phone-style HTTP development address', async ({ page }) => {
    const origin = 'http://192.168.50.25:5173';
    const authRequests = [];
    // Serve the real development app under an insecure LAN origin without making
    // requests to any device on the tester's network.
    await page.route(`${origin}/**`, async route => {
      const requested = new URL(route.request().url());
      const response = await fetch(`http://127.0.0.1:5173${requested.pathname}${requested.search}`);
      await route.fulfill({ status: response.status, contentType: response.headers.get('content-type') || 'application/octet-stream', body: Buffer.from(await response.arrayBuffer()) });
    });
    await page.routeWebSocket('**', socket => socket.close());
    page.on('request', request => {
      if (request.url().includes('identitytoolkit.googleapis.com')) authRequests.push(request.url());
    });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Local demo', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Open Keimoes Rides securely');
    await expect(dialog).toContainText('published HTTPS');
    await expect(dialog.locator('input, select, textarea')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Create account', exact: true })).toHaveCount(0);
    expect(authRequests).toEqual([]);
  });

  test('uses the hosted Firebase email handler when no continuation URL is configured', async ({ page }) => {
    const production = assessRuntime({ isEmulator: false, hostname: 'rides.example.com', protocol: 'https:', origin: 'https://rides.example.com', secureContext: true });
    expect(production.authContinueUrl).toBe('');
    expect(production.canUseSensitiveFeatures).toBe(true);
    // Exercise the same omitted-settings branch against the Auth emulator,
    // preserving local-only account creation and avoiding real email delivery.
    await page.route('**/src/runtime.js*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: `${await response.text()}\nruntime.authContinueUrl = '';\n` });
    });
    const email = `default-email-handler-${unique()}@example.com`;
    const dialog = await openSignIn(page);
    await dialog.getByRole('button', { name: 'Create an account', exact: true }).click();
    await dialog.getByLabel('Full name', { exact: true }).fill('Default Email Handler');
    await dialog.getByLabel('Mobile number', { exact: true }).fill('082 345 6789');
    await dialog.getByLabel('Email address', { exact: true }).fill(email);
    await dialog.getByLabel('Create a password', { exact: true }).fill(PASSWORD);
    const request = page.waitForRequest(request => request.url().includes('/accounts:sendOobCode') && request.method() === 'POST');
    await dialog.getByRole('button', { name: 'Create account', exact: true }).click();
    const body = (await request).postDataJSON();
    expect(body.requestType).toBe('VERIFY_EMAIL');
    expect(body.continueUrl).toBeUndefined();
    await expect(dialog.getByRole('heading', { name: 'One quick email check.' })).toBeVisible();
    await getCode(email, 'VERIFY_EMAIL');
  });

  test('can verify and recover an Auth account while the ride profile service is unavailable', async ({ page }) => {
    const email = `partial-profile-${unique()}@example.com`;
    const dialog = await openSignIn(page);
    const profileUrl = '**/us-central1/saveProfile';
    await page.route(profileUrl, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { status: 'UNAVAILABLE', message: 'Profile service unavailable in this test.' } }) }));
    await dialog.getByRole('button', { name: 'Create an account', exact: true }).click();
    await dialog.getByLabel('Full name', { exact: true }).fill('Recoverable Profile');
    await dialog.getByLabel('Mobile number', { exact: true }).fill('082 345 6789');
    await dialog.getByLabel('Email address', { exact: true }).fill(email);
    await dialog.getByLabel('Create a password', { exact: true }).fill(PASSWORD);
    await dialog.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: 'Make yourself at home.' })).toBeVisible({ timeout: 25_000 });
    await expect(dialog.getByRole('alert')).toContainText('Your sign-in account was created, but your ride profile could not be saved.');
    const code = await getCode(email, 'VERIFY_EMAIL');
    await identity('update', { oobCode: code.oobCode });
    await dialog.getByRole('button', { name: 'Check verification status', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('Your email is verified.');
    await expect(dialog.getByRole('button', { name: 'Save my profile', exact: true })).toBeVisible();
    await page.unroute(profileUrl);
    await dialog.getByRole('button', { name: 'Save my profile', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const account = await identity('signInWithPassword', { email, password: PASSWORD, returnSecureToken: true });
    const lookup = await identity('lookup', { idToken: account.idToken });
    expect(lookup.users[0].emailVerified).toBe(true);
    const profile = await fetch(`http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/kr_users/${account.localId}`, { headers: { Authorization: `Bearer ${account.idToken}` } });
    expect(profile.ok).toBe(true);
    expect((await profile.json()).fields.name.stringValue).toBe('Recoverable Profile');
  });

  test('refreshes verification once when returning from an email link', async ({ page }) => {
    const account = await seedUser({ verified: false });
    await identity('sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: account.idToken });
    const code = await getCode(account.email, 'VERIFY_EMAIL');
    const dialog = await openSignIn(page);
    await dialog.getByLabel('Email address', { exact: true }).fill(account.email);
    await dialog.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: 'One quick email check.' })).toBeVisible();
    await identity('update', { oobCode: code.oobCode });
    let refreshes = 0;
    page.on('request', request => {
      if (request.method() === 'POST' && request.url().includes('/accounts:lookup')) refreshes += 1;
    });
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(dialog).not.toBeVisible();
    expect(refreshes).toBe(1);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    expect(refreshes).toBe(1);
  });

  test('gives the same reset confirmation for registered and unknown addresses', async ({ page }) => {
    const account = await seedUser();
    const dialog = await openSignIn(page);
    await dialog.getByRole('button', { name: 'Forgot your password?', exact: true }).click();
    const resetMessage = 'Local test mode: no email is sent. If this account exists, its password reset link is printed in the Auth emulator terminal.';
    await dialog.getByLabel('Email address', { exact: true }).fill(account.email);
    await dialog.getByRole('button', { name: 'Create test reset link', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText(resetMessage);
    await getCode(account.email, 'PASSWORD_RESET');
    await dialog.getByLabel('Email address', { exact: true }).fill(`unknown-${unique()}@example.com`);
    await dialog.getByRole('button', { name: 'Create test reset link', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText(resetMessage);
  });

  test('manages a verified account and signs out without reopening registration', async ({ page }) => {
    const account = await seedUser();
    const signIn = await openSignIn(page);
    await signIn.getByLabel('Email address', { exact: true }).fill(account.email);
    await signIn.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await signIn.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(signIn).not.toBeVisible();
    await page.getByRole('button', { name: 'Your account', exact: true }).click();
    await page.getByRole('button', { name: 'Manage sign-in & verification', exact: true }).click();
    const accountDialog = page.getByRole('dialog');
    await expect(accountDialog.getByRole('heading', { name: 'Your account, your way.' })).toBeVisible();
    await expect(accountDialog.getByText(account.email, { exact: true })).toBeVisible();
    await expect(accountDialog.getByText('Email verified', { exact: true })).toBeVisible();
    await expect(accountDialog.getByLabel('Password', { exact: true })).toHaveCount(0);
    await accountDialog.getByRole('button', { name: 'Create test password reset link', exact: true }).click();
    await expect(accountDialog.getByRole('status')).toContainText('Local test mode: no email is sent.');
    await getCode(account.email, 'PASSWORD_RESET');
    await accountDialog.getByRole('button', { name: 'Sign out of this account', exact: true }).click();
    await expect(accountDialog).not.toBeVisible();
    await expect(page.getByRole('button', { name: /^sign in$/i }).first()).toBeVisible();
  });

  test('migrates an original phone account without creating a replacement identity', async ({ page }) => {
    const phone = `082${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
    const legacy = await seedUser({ email: `${phone}@keimoesrides.co.za`, profile: false, verified: false });
    const realEmail = `migrated-${unique()}@example.com`;
    const dialog = await openSignIn(page);
    await dialog.getByRole('button', { name: 'Used the original app? Sign in with phone', exact: true }).click();
    await dialog.getByLabel('Original account phone number', { exact: true }).fill(phone);
    await dialog.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await dialog.getByRole('button', { name: 'Sign in with phone', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: 'Make yourself at home.' })).toBeVisible();
    await dialog.getByLabel('Full name', { exact: true }).fill('Original Keimoes Rider');
    await dialog.getByLabel('Mobile number', { exact: true }).fill(phone);
    await dialog.getByRole('radio', { name: 'Find a ride' }).check();
    await dialog.getByRole('button', { name: 'Save my profile', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: 'Keep your account. Add email.' })).toBeVisible();
    await dialog.getByLabel('Your real email address', { exact: true }).fill(realEmail);
    await dialog.getByLabel('Your existing account password', { exact: true }).fill(PASSWORD);
    await dialog.getByRole('button', { name: 'Create test email-change link', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText(realEmail);
    const code = await getCode(realEmail, 'VERIFY_AND_CHANGE_EMAIL');
    await identity('update', { oobCode: code.oobCode });
    const changed = await identity('signInWithPassword', { email: realEmail, password: PASSWORD, returnSecureToken: true });
    expect(changed.localId).toBe(legacy.localId);
    const lookup = await identity('lookup', { idToken: changed.idToken });
    expect(lookup.users[0].emailVerified).toBe(true);
    await dialog.getByRole('button', { name: 'Sign out of this account', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const relogin = await openSignIn(page);
    await relogin.getByLabel('Email address', { exact: true }).fill(realEmail);
    await relogin.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await relogin.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(relogin).not.toBeVisible();
  });
});
