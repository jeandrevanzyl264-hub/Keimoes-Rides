'use strict';

// No production access: these tests require emulator environment variables and
// refuse a non-demo project. Run through `npm run test:integration`.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const requireFunctions = createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIREBASE_STORAGE_EMULATOR_HOST);
const project = process.env.GCLOUD_PROJECT || 'demo-keimoes-rides';
if (enabled && !project.startsWith('demo-')) throw new Error('Emulator tests require a demo- project ID.');
const host = (value) => value.startsWith('http') ? value : `http://${value}`;
const authHost = host(process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099');
const firestoreHost = host(process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080');
const storageHost = host(process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199');
const functionsHost = host(process.env.FUNCTIONS_EMULATOR_HOST || '127.0.0.1:5001');
const bucket = `${project}.appspot.com`;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6h2cAAAAASUVORK5CYII=', 'base64');
const gps = { lat: -28.709123, lng: 20.972456, accuracy: 9 };
const pickup = { lat: -28.712345, lng: 20.966123, label: 'Private front gate at number 17' };
const booking = (requestId) => ({ requestId, pickup, destinationId: 'central', passengers: 2, rideType: 'shared', note: 'Please wait at the gate.', fare: 1, paymentMethod: 'card' });
let db, auth;

async function jsonFetch(url, options) {
  const response = await fetch(url, options);
  let body;
  try { body = await response.json(); } catch { body = {}; }
  return { status: response.status, body };
}
async function call(user, name, data) {
  return jsonFetch(`${functionsHost}/${project}/us-central1/${name}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${user.token}` } : {}) }, body: JSON.stringify({ data }),
  });
}
async function success(user, name, data) {
  const result = await call(user, name, data);
  assert.equal(result.status, 200, `${name}: ${JSON.stringify(result.body)}`);
  assert.ok(result.body.result, `${name} returned a callable result`);
  return result.body.result;
}
async function denied(user, name, data, code) {
  const result = await call(user, name, data);
  assert.notEqual(result.status, 200, `${name} unexpectedly succeeded`);
  if (code) assert.equal(result.body.error?.status, code, JSON.stringify(result.body));
  return result;
}
async function account(label, role, verified = true, admin = false) {
  const email = `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  const password = 'Emulator-only-password-123!';
  const signup = await jsonFetch(`${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  assert.equal(signup.status, 200, JSON.stringify(signup.body));
  const uid = signup.body.localId;
  if (verified) await auth.updateUser(uid, { emailVerified: true });
  if (admin) await auth.setCustomUserClaims(uid, { admin: true });
  const login = await jsonFetch(`${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const user = { uid, token: login.body.idToken, role };
  await success(user, 'saveProfile', { name: `Test ${label}`, phone: '082 123 4567', role });
  return user;
}
function filePath(user, kind) { return kind === 'portrait' ? `driver-portraits/${user.uid}/portrait` : `driver-documents/${user.uid}/${kind}`; }
async function upload(user, kind, bytes = png) {
  return call(user, 'uploadDriverFile', { kind, contentType: 'image/png', base64: bytes.toString('base64') });
}
async function readFile(user, owner, kind) {
  return fetch(`${storageHost}/v0/b/${bucket}/o/${encodeURIComponent(filePath(owner, kind))}?alt=media`, { headers: user ? { Authorization: `Bearer ${user.token}` } : {} });
}
async function readDoc(user, path) {
  return fetch(`${firestoreHost}/v1/projects/${project}/databases/(default)/documents/${path}`, { headers: user ? { Authorization: `Bearer ${user.token}` } : {} });
}
async function writeDoc(user, path, fields) {
  return fetch(`${firestoreHost}/v1/projects/${project}/databases/(default)/documents/${path}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }),
  });
}
async function sendMessage(user, rideId, text, senderId = user.uid) {
  return jsonFetch(`${firestoreHost}/v1/projects/${project}/databases/(default)/documents:commit`, {
    method: 'POST', headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes: [{
      update: { name: `projects/${project}/databases/(default)/documents/kr_rides/${rideId}/messages/${crypto.randomUUID()}`, fields: { senderId: { stringValue: senderId }, text: { stringValue: text } } },
      updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
    }] }),
  });
}
const vehicle = { model: 'Toyota Corolla', color: 'White', plate: 'NC 12345', seats: 4 };

test('Firebase callables, Storage and Firestore enforce the real ride lifecycle', { skip: !enabled, timeout: 180000 }, async (t) => {
  const { initializeApp } = requireFunctions('firebase-admin/app');
  const { getFirestore, Timestamp } = requireFunctions('firebase-admin/firestore');
  const { getAuth } = requireFunctions('firebase-admin/auth');
  const app = initializeApp({ projectId: project, storageBucket: bucket });
  db = getFirestore(app); auth = getAuth(app);
  const passenger = await account('passenger', 'passenger');
  const outsider = await account('outsider', 'passenger');
  const driver1 = await account('driver-one', 'driver');
  const driver2 = await account('driver-two', 'driver');
  const unverified = await account('unverified', 'passenger', false);
  const admin = await account('administrator', 'passenger', true, true);

  await t.test('authentication, email verification and immutable account roles', async () => {
    await denied(null, 'saveProfile', { name: 'Nobody', phone: '0821234567', role: 'driver' }, 'UNAUTHENTICATED');
    await denied(unverified, 'requestRide', booking('unverified'), 'FAILED_PRECONDITION');
    await denied(passenger, 'saveProfile', { name: 'Test passenger', phone: '0821234567', role: 'driver' }, 'FAILED_PRECONDITION');
    await denied(passenger, 'setAvailability', { online: true, location: gps }, 'PERMISSION_DENIED');
    assert.equal((await writeDoc(driver1, `kr_users/${driver1.uid}`, { role: { stringValue: 'admin' } })).status, 403);
    assert.equal((await readDoc(outsider, `kr_users/${passenger.uid}`)).status, 403);
  });

  await t.test('manual verification requires three real images and administrator review', async () => {
    await denied(driver1, 'submitDriverApplication', { vehicle, consent: true }, 'FAILED_PRECONDITION');
    const spoof = await account('spoofed-image', 'driver');
    assert.equal((await upload(spoof, 'portrait', Buffer.from('<script>not a real PNG image</script>'))).body.error.status, 'INVALID_ARGUMENT');
    await denied(spoof, 'uploadDriverFile', { kind: 'portrait', contentType: 'image/jpeg', base64: png.toString('base64') }, 'INVALID_ARGUMENT');
    await denied(spoof, 'uploadDriverFile', { kind: '../license', contentType: 'image/png', base64: png.toString('base64') }, 'INVALID_ARGUMENT');
    await denied(passenger, 'uploadDriverFile', { kind: 'portrait', contentType: 'image/png', base64: png.toString('base64') }, 'PERMISSION_DENIED');
    for (const driver of [driver1, driver2]) {
      for (const kind of ['portrait', 'license', 'permit']) assert.equal((await upload(driver, kind)).status, 200);
      await success(driver, 'submitDriverApplication', { vehicle, consent: true });
      assert.notEqual((await upload(driver, 'portrait')).status, 200, 'pending documents are frozen');
      assert.equal((await readFile(passenger, driver, 'portrait')).status, 403, 'pending portrait is private');
      await denied(passenger, 'getDriverFile', { driverId: driver.uid, kind: 'portrait' }, 'PERMISSION_DENIED');
      await success(driver, 'getDriverFile', { driverId: driver.uid, kind: 'license' });
      await denied(passenger, 'reviewDriver', { driverId: driver.uid, decision: 'approved', reason: '' }, 'PERMISSION_DENIED');
      if (driver === driver2) {
        await success(admin, 'reviewDriver', { driverId: driver.uid, decision: 'rejected', reason: 'Please submit a clearer portrait for manual review.' });
        assert.equal((await db.doc(`kr_driverApplications/${driver.uid}`).get()).data().status, 'rejected');
        assert.equal((await db.doc(`kr_publicDrivers/${driver.uid}`).get()).exists, false);
        assert.equal((await upload(driver, 'portrait')).status, 200, 'rejected applications may securely replace photos');
        await success(driver, 'submitDriverApplication', { vehicle, consent: true });
      }
      await success(admin, 'reviewDriver', { driverId: driver.uid, decision: 'approved', reason: 'Reviewed documents manually in emulator test.' });
      assert.equal((await readFile(passenger, driver, 'portrait')).status, 403, 'Storage URLs stay forbidden even for approved portraits');
      const portrait = await success(passenger, 'getDriverFile', { driverId: driver.uid, kind: 'portrait' });
      assert.equal(portrait.contentType, 'image/png'); assert.equal(portrait.base64, png.toString('base64'));
      await denied(passenger, 'getDriverFile', { driverId: driver.uid, kind: 'license' }, 'PERMISSION_DENIED');
      await success(admin, 'getDriverFile', { driverId: driver.uid, kind: 'license' });
      await denied(null, 'getDriverFile', { driverId: driver.uid, kind: 'portrait' }, 'UNAUTHENTICATED');
      assert.equal((await readFile(passenger, driver, 'license')).status, 403);
      assert.equal((await readFile(null, driver, 'portrait')).status, 403);
      assert.notEqual((await upload(driver, 'license')).status, 200, 'approved documents cannot be replaced');
      const { getStorage } = requireFunctions('firebase-admin/storage');
      const [metadata] = await getStorage(app).bucket().file(filePath(driver, 'portrait')).getMetadata();
      assert.ok(!metadata.metadata?.firebaseStorageDownloadTokens, 'No persistent download token is ever created');
      await success(driver, 'setAvailability', { online: true, location: gps });
    }
  });

  await t.test('in-flight upload locks prevent submission; an expired failed upload can be retried', async () => {
    const driver = await account('upload-lock', 'driver');
    for (const kind of ['portrait', 'license', 'permit']) assert.equal((await upload(driver, kind)).status, 200);
    await db.doc(`kr_driverApplications/${driver.uid}`).update({ uploadLock: { id: 'emulator-in-flight', expiresAt: Timestamp.fromMillis(Date.now() + 120000) } });
    await denied(driver, 'submitDriverApplication', { vehicle, consent: true }, 'FAILED_PRECONDITION');
    await denied(driver, 'uploadDriverFile', { kind: 'portrait', contentType: 'image/png', base64: png.toString('base64') }, 'ABORTED');
    await db.doc(`kr_driverApplications/${driver.uid}`).update({ uploadLock: { id: 'emulator-expired', expiresAt: Timestamp.fromMillis(Date.now() - 1000) } });
    assert.equal((await upload(driver, 'portrait')).status, 200);
    assert.equal((await db.doc(`kr_driverApplications/${driver.uid}`).get()).data().uploadLock, undefined);
    await success(driver, 'submitDriverApplication', { vehicle, consent: true });
  });

  let rideId;
  await t.test('request fare is authoritative, IDs are safe and idempotency prevents duplicates', async () => {
    await denied(passenger, 'requestRide', booking('../invalid'), 'INVALID_ARGUMENT');
    const result = await success(passenger, 'requestRide', booking('first'));
    rideId = result.rideId;
    assert.equal((await success(passenger, 'requestRide', booking('first'))).rideId, rideId);
    await denied(passenger, 'requestRide', booking('second'), 'FAILED_PRECONDITION');
    const ride = (await db.doc(`kr_rides/${rideId}`).get()).data();
    assert.equal(ride.fare, 50); assert.equal(ride.paymentMethod, 'cash');
    assert.equal((await readDoc(outsider, `kr_rides/${rideId}`)).status, 403);
    assert.equal((await readDoc(driver1, `kr_rides/${rideId}`)).status, 403, 'unassigned drivers cannot read passenger details');
    assert.equal((await readDoc(passenger, `kr_rideRequests/${rideId}`)).status, 403);
    assert.equal((await readDoc(driver1, `kr_rideRequests/${rideId}`)).status, 200);
    const queue = (await db.doc(`kr_rideRequests/${rideId}`).get()).data();
    assert.notEqual(queue.pickup.lat, pickup.lat); assert.ok(!JSON.stringify(queue).includes('front gate'));
    assert.equal((await writeDoc(passenger, `kr_rides/${rideId}`, { fare: { integerValue: '1' } })).status, 403);
  });

  let winner, loser;
  await t.test('simultaneous driver acceptance has exactly one winner and atomic user locks', async () => {
    const results = await Promise.all([driver1, driver2].map((driver) => call(driver, 'acceptRide', { rideId, location: gps })));
    assert.equal(results.filter((result) => result.status === 200).length, 1, JSON.stringify(results));
    winner = results[0].status === 200 ? driver1 : driver2;
    loser = winner === driver1 ? driver2 : driver1;
    const ride = (await db.doc(`kr_rides/${rideId}`).get()).data();
    assert.equal(ride.driverId, winner.uid);
    assert.equal((await db.doc(`kr_users/${winner.uid}`).get()).data().activeRideId, rideId);
    assert.equal((await db.doc(`kr_users/${loser.uid}`).get()).data().activeRideId, null);
    assert.equal((await db.doc(`kr_publicDrivers/${winner.uid}`).get()).data().busy, true);
    assert.equal((await db.doc(`kr_rideRequests/${rideId}`).get()).exists, false);
    assert.equal((await success(winner, 'acceptRide', { rideId, location: gps })).rideId, rideId);
    await denied(winner, 'setAvailability', { online: false }, 'FAILED_PRECONDITION');
  });

  await t.test('participant locations and chat remain private, immutable and bounded', async () => {
    await success(passenger, 'publishLocation', { rideId, location: gps });
    await success(winner, 'publishLocation', { rideId, location: gps });
    await denied(loser, 'publishLocation', { rideId, location: gps }, 'PERMISSION_DENIED');
    assert.equal((await sendMessage(passenger, rideId, 'I am waiting by the gate.')).status, 200);
    assert.equal((await sendMessage(winner, rideId, 'On my way.')).status, 200);
    assert.equal((await sendMessage(outsider, rideId, 'Not my trip')).status, 403);
    assert.equal((await sendMessage(passenger, rideId, 'Fake sender', winner.uid)).status, 403);
    assert.equal((await sendMessage(passenger, rideId, 'x'.repeat(501))).status, 403);
    assert.equal((await sendMessage(passenger, rideId, '   ')).status, 403);
    assert.equal((await readDoc(loser, `kr_rides/${rideId}`)).status, 403);
  });

  await t.test('only the assigned driver follows ordered trip states and terminal locks clear', async () => {
    await denied(passenger, 'transitionRide', { rideId, action: 'start' }, 'PERMISSION_DENIED');
    await denied(winner, 'transitionRide', { rideId, action: 'complete' }, 'FAILED_PRECONDITION');
    await success(winner, 'transitionRide', { rideId, action: 'arrive' });
    await success(winner, 'transitionRide', { rideId, action: 'start' });
    await denied(passenger, 'transitionRide', { rideId, action: 'cancel' }, 'FAILED_PRECONDITION');
    await denied(winner, 'transitionRide', { rideId, action: 'cancel', reason: 'no' }, 'INVALID_ARGUMENT');
    await success(winner, 'transitionRide', { rideId, action: 'complete' });
    for (const user of [passenger, winner]) assert.equal((await db.doc(`kr_users/${user.uid}`).get()).data().activeRideId, null);
    assert.equal((await db.doc(`kr_publicDrivers/${winner.uid}`).get()).data().busy, false);
    await denied(winner, 'transitionRide', { rideId, action: 'cancel' }, 'FAILED_PRECONDITION');
    assert.equal((await sendMessage(passenger, rideId, 'Trip ended')).status, 403);
    await success(passenger, 'rateRide', { rideId, rating: 5, comment: 'Safe trip.' });
    await denied(passenger, 'rateRide', { rideId, rating: 1 }, 'ALREADY_EXISTS');
    await denied(winner, 'rateRide', { rideId, rating: 5 }, 'PERMISSION_DENIED');
  });

  await t.test('passenger cancellation deletes discovery and idempotency never reopens a finished trip', async () => {
    assert.equal((await success(passenger, 'requestRide', booking('first'))).rideId, rideId);
    assert.equal((await db.doc(`kr_users/${passenger.uid}`).get()).data().activeRideId, null);
    const next = (await success(passenger, 'requestRide', booking('cancel-me'))).rideId;
    await success(passenger, 'transitionRide', { rideId: next, action: 'cancel', reason: 'Plans changed.' });
    assert.equal((await db.doc(`kr_rideRequests/${next}`).get()).exists, false);
    assert.equal((await db.doc(`kr_users/${passenger.uid}`).get()).data().activeRideId, null);
  });

  await t.test('expired dispatch cannot be accepted and releases the passenger lock', async () => {
    const expired = (await success(passenger, 'requestRide', booking('expired'))).rideId;
    await db.doc(`kr_rides/${expired}`).update({ createdAt: Timestamp.fromMillis(Date.now() - 11 * 60 * 1000) });
    await success(loser, 'setAvailability', { online: true, location: gps });
    await denied(loser, 'acceptRide', { rideId: expired, location: gps }, 'DEADLINE_EXCEEDED');
    assert.equal((await db.doc(`kr_rides/${expired}`).get()).data().status, 'cancelled');
    assert.equal((await db.doc(`kr_users/${passenger.uid}`).get()).data().activeRideId, null);
  });

  await t.test('scheduled cleanup expires waiting trips without any driver acceptance attempt', async () => {
    const waiting = (await success(passenger, 'requestRide', booking('scheduled-expiration'))).rideId;
    const old = Timestamp.fromMillis(Date.now() - 11 * 60 * 1000);
    await db.doc(`kr_rides/${waiting}`).update({ createdAt: old });
    await db.doc(`kr_rideRequests/${waiting}`).update({ createdAt: old });
    // Invoke the actual exported scheduler handler in an isolated process using
    // the same explicitly configured demo emulators; Cloud Scheduler is not run locally.
    const { execFileSync } = require('node:child_process');
    execFileSync(process.execPath, ['-e', "require('./functions/index.js').expireRideRequests.run({scheduleTime:new Date().toISOString()}).then(()=>process.exit(0)).catch(()=>process.exit(1))"], {
      cwd: require('node:path').resolve(__dirname, '..'), timeout: 30000, stdio: 'pipe',
      env: { ...process.env, FIREBASE_CONFIG: JSON.stringify({ projectId: project, storageBucket: bucket }) },
    });
    assert.equal((await db.doc(`kr_rides/${waiting}`).get()).data().status, 'cancelled');
    assert.equal((await db.doc(`kr_rideRequests/${waiting}`).get()).exists, false);
    assert.equal((await db.doc(`kr_users/${passenger.uid}`).get()).data().activeRideId, null);
  });
});
