import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRequire } from 'node:module';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import 'firebase/compat/storage';
firebase.firestore.setLogLevel('silent');

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_STORAGE_EMULATOR_HOST);
const projectId = process.env.GCLOUD_PROJECT || 'demo-keimoes-rides';
if (enabled && !projectId.startsWith('demo-')) throw new Error('Rules tests require a demo- project.');
const bucket = `gs://${projectId}.appspot.com`;
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6h2cAAAAASUVORK5CYII=', 'base64'));

test('security rules protect participant queries and deny all direct Storage APIs', { skip: !enabled, timeout: 60000 }, async (t) => {
  const env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') },
    storage: { rules: await readFile(new URL('../storage.rules', import.meta.url), 'utf8') },
  });
  const suffix = Date.now().toString(36);
  const passenger = `rule-passenger-${suffix}`;
  const driver = `rule-driver-${suffix}`;
  const stranger = `rule-stranger-${suffix}`;
  const rideId = `rule-ride-${suffix}`;
  const passengerCtx = env.authenticatedContext(passenger, { email_verified: true });
  const driverCtx = env.authenticatedContext(driver, { email_verified: true });
  const strangerCtx = env.authenticatedContext(stranger, { email_verified: true });
  const adminCtx = env.authenticatedContext(`rule-admin-${suffix}`, { admin: true, email_verified: true });
  const anonymous = env.unauthenticatedContext();
  const doc = (context, path) => context.firestore().doc(path);
  try {
    await env.withSecurityRulesDisabled(async (context) => {
      await doc(context, `kr_users/${passenger}`).set({ uid: passenger, role: 'passenger', activeRideId: rideId });
      await doc(context, `kr_users/${driver}`).set({ uid: driver, role: 'driver', activeRideId: null });
      await doc(context, `kr_rides/${rideId}`).set({ passengerId: passenger, driverId: driver, status: 'accepted', createdAt: firebase.firestore.Timestamp.now() });
      await doc(context, `kr_rides/private-${suffix}`).set({ passengerId: stranger, driverId: null, status: 'requested', createdAt: firebase.firestore.Timestamp.now() });
      await doc(context, `legacy_users/${passenger}`).set({ name: 'Old private profile' });
      await doc(context, `kr_rideRequests/${rideId}`).set({ id: rideId });
    });

    await t.test('the real Firebase browser SDK cannot create tokens or bypass callable-only file access', async () => {
      const portrait = `driver-portraits/${driver}/portrait`;
      const license = `driver-documents/${driver}/license`;
      const options = { contentType: 'image/png', customMetadata: {} };
      const requireFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
      const { initializeApp, deleteApp } = requireFunctions('firebase-admin/app');
      const { getStorage } = requireFunctions('firebase-admin/storage');
      const app = initializeApp({ projectId, storageBucket: bucket.slice(5) }, `rules-files-${suffix}`);
      try {
        for (const path of [portrait, license]) await getStorage(app).bucket().file(path).save(Buffer.from(png), { resumable: false, metadata: { contentType: 'image/png', metadata: {} } });
      } finally { await deleteApp(app); }
      await assertFails(driverCtx.storage(bucket).ref(portrait).put(png, options));
      await assertFails(driverCtx.storage(bucket).ref(license).put(png, options));
      await assertFails(passengerCtx.storage(bucket).ref(`driver-portraits/${passenger}/portrait`).put(png, options));
      await assertFails(strangerCtx.storage(bucket).ref(license).getDownloadURL());
      await assertFails(anonymous.storage(bucket).ref(portrait).getDownloadURL());
      await assertFails(driverCtx.storage(bucket).ref(`driver-documents/${driver}/invented`).put(png, options));
      await assertFails(driverCtx.storage(bucket).ref(license).put(png, { contentType: 'text/html' }));
      await assertFails(driverCtx.storage(bucket).ref(license).put(new Uint8Array(5 * 1024 * 1024 + 1), options));
      await assertFails(env.authenticatedContext(driver, { email_verified: false }).storage(bucket).ref(license).put(png, options));
      await assertFails(driverCtx.storage(bucket).ref(license).put(png, { ...options, customMetadata: { firebaseStorageDownloadTokens: 'public-link-token' } }));
      await env.withSecurityRulesDisabled(async (context) => {
        await doc(context, `kr_driverApplications/${driver}`).set({ uid: driver, status: 'pending' });
      });
      await assertFails(driverCtx.storage(bucket).ref(portrait).put(png, options));
      await assertFails(strangerCtx.storage(bucket).ref(portrait).getDownloadURL());
      await env.withSecurityRulesDisabled(async (context) => {
        await doc(context, `kr_driverApplications/${driver}`).update({ status: 'approved' });
      });
      await assertFails(strangerCtx.storage(bucket).ref(portrait).getMetadata());
      await assertFails(strangerCtx.storage(bucket).ref(license).getMetadata());
      await assertFails(adminCtx.storage(bucket).ref(license).getMetadata());
      await assertFails(driverCtx.storage(bucket).ref(license).getDownloadURL());
      await assertFails(driverCtx.storage(bucket).ref(portrait).put(png, options));
      await assertFails(driverCtx.storage(bucket).ref(portrait).delete());
    });

    await t.test('participants query their own trips; account, approval and legacy documents stay private', async () => {
      await assertSucceeds(doc(passengerCtx, `kr_rides/${rideId}`).get());
      await assertSucceeds(doc(driverCtx, `kr_rides/${rideId}`).get());
      await assertFails(doc(strangerCtx, `kr_rides/${rideId}`).get());
      await assertFails(passengerCtx.firestore().collection('kr_rides').limit(50).get());
      await assertSucceeds(passengerCtx.firestore().collection('kr_rides').where('passengerId', '==', passenger).orderBy('createdAt', 'desc').limit(50).get());
      await assertSucceeds(adminCtx.firestore().collection('kr_driverApplications').get());
      await assertFails(doc(passengerCtx, `kr_users/${driver}`).get());
      await assertFails(doc(passengerCtx, `kr_users/${passenger}`).update({ role: 'driver' }));
      await assertFails(doc(driverCtx, `kr_driverApplications/${driver}`).update({ status: 'approved' }));
      await assertFails(doc(passengerCtx, `legacy_users/${passenger}`).get());
      await assertFails(doc(passengerCtx, `kr_rideRequests/${rideId}`).get());
      await assertSucceeds(doc(driverCtx, `kr_rideRequests/${rideId}`).get());
    });

    await t.test('chat allows only current participants, server timestamps and bounded queries', async () => {
      const messages = passengerCtx.firestore().collection(`kr_rides/${rideId}/messages`);
      const message = { senderId: passenger, text: 'At the pickup.', createdAt: firebase.firestore.FieldValue.serverTimestamp() };
      const sent = await assertSucceeds(messages.add(message));
      await assertFails(sent.update({ text: 'Changed history' }));
      await assertFails(sent.delete());
      await assertFails(messages.add({ ...message, senderId: driver }));
      await assertFails(messages.add({ ...message, extra: 'Not allowed' }));
      await assertFails(messages.add({ ...message, text: 'x'.repeat(501) }));
      await assertFails(messages.add({ ...message, text: '   ' }));
      await assertFails(messages.add({ ...message, createdAt: firebase.firestore.Timestamp.fromMillis(0) }));
      await assertFails(strangerCtx.firestore().collection(`kr_rides/${rideId}/messages`).limit(50).get());
      await assertFails(messages.get());
      await assertFails(messages.limit(101).get());
      await assertSucceeds(messages.orderBy('createdAt', 'desc').limit(80).get());
      await env.withSecurityRulesDisabled(async (context) => { await doc(context, `kr_rides/${rideId}`).update({ status: 'completed' }); });
      await assertFails(messages.add(message));
      await assertSucceeds(messages.limit(80).get());
    });
  } finally { await env.cleanup(); }
});
