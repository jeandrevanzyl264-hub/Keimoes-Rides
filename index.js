'use strict';

const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { setGlobalOptions } = require('firebase-functions/v2');
const { randomUUID } = require('node:crypto');
const d = require('./domain.cjs');

initializeApp();
// Base64 photo transfers can occupy several buffers. Bound per-instance
// concurrency so legitimate 5 MB uploads cannot exhaust the process heap.
setGlobalOptions({ region: 'us-central1', maxInstances: 20, memory: '512MiB', concurrency: 4, timeoutSeconds: 60 });
const db = getFirestore();
const stamp = () => FieldValue.serverTimestamp();
const refs = {
  user: (uid) => db.doc(`kr_users/${uid}`),
  app: (uid) => db.doc(`kr_driverApplications/${uid}`),
  driver: (uid) => db.doc(`kr_publicDrivers/${uid}`),
  ride: (id) => db.doc(`kr_rides/${id}`),
  request: (id) => db.doc(`kr_rideRequests/${id}`),
};
const REQUEST_LIFETIME = 10 * 60 * 1000;
const GPS_LIFETIME = 2 * 60 * 1000;
const activeStatuses = ['requested', 'accepted', 'arrived', 'in_progress'];

function identity(request, verified = true) {
  if (!request.auth) d.fail('unauthenticated', 'Please sign in to continue.');
  if (verified && request.auth.token.email_verified !== true) d.fail('failed-precondition', 'Verify your email address, then refresh your account before continuing.');
  return request.auth.uid;
}
function profile(snapshot, role) {
  if (!snapshot.exists) d.fail('failed-precondition', 'Complete your profile first.');
  const user = snapshot.data();
  if (role && user.role !== role) d.fail('permission-denied', `This action requires a ${role} account.`);
  return user;
}
function approved(snapshot) {
  if (!snapshot.exists || snapshot.data().status !== 'approved') d.fail('permission-denied', 'Your driver application must be approved first.');
  return snapshot.data();
}
function existingRide(snapshot) {
  if (!snapshot.exists) d.fail('not-found', 'This trip no longer exists.');
  return snapshot.data();
}
function objectData(request) {
  if (!request.data || typeof request.data !== 'object' || Array.isArray(request.data)) d.fail('invalid-argument', 'Request details are required.');
  return request.data;
}
// Return useful, bounded failures without leaking internal details or credentials.
function callable(handler) {
  return onCall(async (request) => {
    try { return await handler(request, objectData(request)); }
    catch (error) {
      if (error instanceof HttpsError) throw error;
      console.error('Keimoes operation failed', { code: String(error.code || 'unknown'), type: error.constructor?.name || 'Error' });
      throw new HttpsError('internal', 'The service could not finish this action. Please try again.');
    }
  });
}

exports.saveProfile = callable(async (request, data) => {
  const uid = identity(request, false);
  const name = d.text(data.name, 'Full name', 2, 80);
  const phone = d.phone(data.phone);
  if (!['passenger', 'driver'].includes(data.role)) d.fail('invalid-argument', 'Choose passenger or driver.');
  await db.runTransaction(async (transaction) => {
    const ref = refs.user(uid);
    const [snapshot, pub] = await transaction.getAll(ref, refs.driver(uid));
    if (snapshot.exists && snapshot.data().role !== data.role) d.fail('failed-precondition', 'Account roles cannot be changed. Create a separate account for another role.');
    if (snapshot.exists && snapshot.data().activeRideId) d.fail('failed-precondition', 'Finish your active trip before changing your profile.');
    const fields = { uid, name, phone, email: request.auth.token.email || '', role: data.role, updatedAt: stamp() };
    if (!snapshot.exists) Object.assign(fields, { createdAt: stamp(), activeRideId: null });
    transaction.set(ref, fields, { merge: true });
    // Public details are refreshed without exposing a telephone number.
    if (pub.exists) transaction.update(refs.driver(uid), { name });
  });
  return { ok: true };
});

function applicationPaths(uid) {
  return {
    portraitPath: `driver-portraits/${uid}/portrait`,
    licensePath: `driver-documents/${uid}/license`,
    permitPath: `driver-documents/${uid}/permit`,
  };
}

function fileKind(value) {
  if (!['portrait', 'license', 'permit'].includes(value)) d.fail('invalid-argument', 'Choose a portrait, driving licence or transport permit.');
  return value;
}
function filePath(uid, kind) { return applicationPaths(uid)[`${kind}Path`]; }
function imageBytes(data) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(data.contentType)) d.fail('invalid-argument', 'Choose a JPEG, PNG or WebP photo.');
  if (typeof data.base64 !== 'string' || data.base64.length < 16 || data.base64.length > 6990508) d.fail('invalid-argument', 'Every photo must be between 12 bytes and 5 MB.');
  const bytes = Buffer.from(data.base64, 'base64');
  if (bytes.length < 12 || bytes.length > 5 * 1024 * 1024 || bytes.toString('base64') !== data.base64 || d.imageType(bytes) !== data.contentType) {
    d.fail('invalid-argument', 'The file is not a supported image of its declared type, or exceeds 5 MB.');
  }
  return bytes;
}

// Download-token URLs bypass Storage rules. Browser Storage APIs stay denied;
// authorized callables use Admin GCS without creating Firebase download tokens.
exports.uploadDriverFile = callable(async (request, data) => {
  const uid = identity(request);
  const kind = fileKind(data.kind);
  const bytes = imageBytes(data);
  const lockId = randomUUID();
  const path = filePath(uid, kind);
  await db.runTransaction(async (transaction) => {
    const [userSnapshot, application] = await transaction.getAll(refs.user(uid), refs.app(uid));
    const user = profile(userSnapshot, 'driver');
    const app = application.exists ? application.data() : {};
    if (user.activeRideId) d.fail('failed-precondition', 'Finish your active trip before replacing documents.');
    if (app.status && !['draft', 'rejected'].includes(app.status)) d.fail('failed-precondition', 'Documents are frozen while pending review or approved.');
    if (app.uploadLock && d.milliseconds(app.uploadLock.expiresAt) > Date.now()) d.fail('aborted', 'Another photo is uploading. Wait for it to finish and try again.');
    transaction.set(refs.app(uid), {
      uid, status: app.status || 'draft', fileRevision: (app.fileRevision || 0) + 1,
      uploadLock: { id: lockId, expiresAt: Timestamp.fromMillis(Date.now() + 120000) }, updatedAt: stamp(),
    }, { merge: true });
  });
  let stored = false;
  try {
    await getStorage().bucket().file(path).save(bytes, {
      resumable: false, validation: 'crc32c', timeout: 45000,
      metadata: { contentType: data.contentType, cacheControl: 'private,no-store', metadata: {} },
    });
    stored = true;
  } finally {
    await db.runTransaction(async (transaction) => {
      const application = await transaction.get(refs.app(uid));
      if (application.exists && application.data().uploadLock?.id === lockId) {
        transaction.update(refs.app(uid), {
          uploadLock: FieldValue.delete(), updatedAt: stamp(),
          ...(stored ? { [`${kind}Path`]: path } : {}),
        });
      }
    });
  }
  return { path };
});

exports.getDriverFile = callable(async (request, data) => {
  const viewer = identity(request, false);
  const uid = d.id(data.driverId, 'driver ID', 128);
  const kind = fileKind(data.kind);
  const isOwnerOrAdmin = viewer === uid || request.auth.token.admin === true;
  if (!isOwnerOrAdmin) {
    if (kind !== 'portrait') d.fail('permission-denied', 'Driver documents are private to their owner and verification operators.');
    const application = await refs.app(uid).get();
    if (!application.exists || application.data().status !== 'approved') d.fail('permission-denied', 'This portrait is not available.');
  }
  const file = getStorage().bucket().file(filePath(uid, kind));
  let metadata;
  try { [metadata] = await file.getMetadata(); }
  catch (error) { if (Number(error.code) === 404) d.fail('not-found', 'This photo has not been uploaded.'); throw error; }
  if (Number(metadata.size) > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(metadata.contentType)) d.fail('failed-precondition', 'This verification file is invalid. Upload a new image.');
  const [bytes] = await getStorage().bucket().file(filePath(uid, kind), { generation: metadata.generation }).download();
  return { contentType: metadata.contentType, base64: bytes.toString('base64') };
});

async function inspectFiles(uid) {
  const paths = applicationPaths(uid);
  const pairs = await Promise.all(Object.entries(paths).map(async ([key, path]) => {
    const file = getStorage().bucket().file(path);
    let metadata;
    try { [metadata] = await file.getMetadata(); }
    catch (error) {
      if (Number(error.code) === 404) d.fail('failed-precondition', 'Upload your portrait, driving licence and passenger transport permit before submitting.');
      throw error;
    }
    const size = Number(metadata.size);
    if (metadata.metadata?.firebaseStorageDownloadTokens) d.fail('failed-precondition', 'Re-upload this photo securely before submitting.');
    if (!Number.isFinite(size) || size < 12 || size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(metadata.contentType)) {
      d.fail('invalid-argument', 'Every verification file must be a JPEG, PNG or WebP image under 5 MB.');
    }
    // Read the captured immutable generation with normal Storage checksum validation.
    const [image] = await getStorage().bucket().file(path, { generation: metadata.generation }).download();
    if (d.imageType(image) !== metadata.contentType) d.fail('invalid-argument', 'A verification file is not a valid image of its declared type.');
    return [key.replace('Path', ''), String(metadata.generation)];
  }));
  return { ...paths, fileGenerations: Object.fromEntries(pairs) };
}

exports.submitDriverApplication = callable(async (request, data) => {
  const uid = identity(request);
  const vehicle = d.vehicle(data.vehicle);
  if (data.consent !== true) d.fail('invalid-argument', 'Consent to the manual verification review is required.');
  profile(await refs.user(uid).get(), 'driver');
  const before = await refs.app(uid).get();
  if (before.exists && before.data().uploadLock) d.fail('failed-precondition', 'Wait for all photos to finish uploading before submitting.');
  const files = await inspectFiles(uid);
  await db.runTransaction(async (transaction) => {
    const [userSnapshot, application] = await transaction.getAll(refs.user(uid), refs.app(uid));
    const user = profile(userSnapshot, 'driver');
    if (user.activeRideId) d.fail('failed-precondition', 'Finish your trip before changing verification details.');
    if (application.exists && ['pending', 'approved'].includes(application.data().status)) d.fail('failed-precondition', 'This application is already pending or approved.');
    if (application.exists && (application.data().uploadLock || application.data().fileRevision !== before.data()?.fileRevision)) d.fail('aborted', 'Your photos changed during submission. Wait for uploads to finish, then submit again.');
    transaction.set(refs.app(uid), {
      uid, status: 'pending', vehicle, ...files, fileRevision: application.data()?.fileRevision || 0, reviewReason: '', submittedAt: stamp(), reviewedAt: null,
    });
  });
  return { ok: true };
});

exports.reviewDriver = callable(async (request, data) => {
  const reviewerId = identity(request, false);
  if (request.auth.token.admin !== true) d.fail('permission-denied', 'An administrator account is required.');
  const uid = d.id(data.driverId, 'driver ID', 128);
  if (uid === reviewerId) d.fail('permission-denied', 'Another administrator must review your application.');
  if (!['approved', 'rejected'].includes(data.decision)) d.fail('invalid-argument', 'Choose approve or reject.');
  const reason = data.decision === 'rejected' ? d.text(data.reason, 'Review reason', 5, 500) : d.optionalText(data.reason, 'Review reason', 500);
  const applicationBefore = await refs.app(uid).get();
  if (!applicationBefore.exists) d.fail('not-found', 'No driver application was found.');
  const verifiedFiles = data.decision === 'approved' ? await inspectFiles(uid) : null;
  const audit = db.collection('kr_adminAudit').doc();
  await db.runTransaction(async (transaction) => {
    const [userSnapshot, application] = await transaction.getAll(refs.user(uid), refs.app(uid));
    const user = profile(userSnapshot, 'driver');
    if (user.activeRideId) d.fail('failed-precondition', 'A driver assigned to a trip cannot be reviewed.');
    if (!application.exists || application.data().status !== 'pending') d.fail('failed-precondition', 'Only pending applications can be reviewed.');
    const app = application.data();
    if (app.uploadLock) d.fail('failed-precondition', 'Wait for all verification uploads to finish before reviewing.');
    if (verifiedFiles && Object.keys(verifiedFiles.fileGenerations).some((key) => app.fileGenerations?.[key] !== verifiedFiles.fileGenerations[key])) d.fail('failed-precondition', 'Verification files changed. The driver must resubmit their application.');
    transaction.update(refs.app(uid), { status: data.decision, reviewReason: reason, reviewedAt: stamp(), reviewedBy: reviewerId });
    if (data.decision === 'approved') {
      transaction.set(refs.driver(uid), {
        uid, name: user.name, vehicle: app.vehicle, portraitPath: app.portraitPath,
        verified: true, online: false, busy: false, location: null, lastSeen: null,
      });
    } else transaction.delete(refs.driver(uid));
    transaction.create(audit, { reviewerId, driverId: uid, decision: data.decision, reason, createdAt: stamp() });
  });
  return { ok: true };
});

exports.setAvailability = callable(async (request, data) => {
  const uid = identity(request);
  if (typeof data.online !== 'boolean') d.fail('invalid-argument', 'Online status must be true or false.');
  const location = data.online ? d.point(data.location, 'Your location', true) : null;
  await db.runTransaction(async (transaction) => {
    const [userSnapshot, application, driver] = await transaction.getAll(refs.user(uid), refs.app(uid), refs.driver(uid));
    const user = profile(userSnapshot, 'driver');
    approved(application);
    if (!driver.exists) d.fail('failed-precondition', 'Your public driver profile is missing. Contact support.');
    if (user.activeRideId) d.fail('failed-precondition', 'Complete or cancel your active trip before changing availability.');
    const fields = { online: data.online, busy: false };
    if (location) Object.assign(fields, { location: d.approximate(location), lastSeen: stamp() });
    transaction.update(refs.driver(uid), fields);
  });
  return { ok: true };
});

exports.publishLocation = callable(async (request, data) => {
  const uid = identity(request);
  const location = d.point(data.location, 'Your location', true);
  const requestedRideId = data.rideId == null ? null : d.id(data.rideId, 'trip ID');
  await db.runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(refs.user(uid));
    const user = profile(userSnapshot);
    const rideId = user.activeRideId || null;
    if (requestedRideId && requestedRideId !== rideId) d.fail('permission-denied', 'This is not your active trip.');
    const targets = [];
    if (rideId) targets.push(refs.ride(rideId));
    if (user.role === 'driver') targets.push(refs.app(uid), refs.driver(uid));
    const snapshots = targets.length ? await transaction.getAll(...targets) : [];
    const ride = rideId ? existingRide(snapshots.shift()) : null;
    let driver;
    if (user.role === 'driver') {
      approved(snapshots.shift());
      const publicSnapshot = snapshots.shift();
      if (!publicSnapshot.exists) d.fail('failed-precondition', 'Your driver profile is unavailable.');
      driver = publicSnapshot.data();
      if (!driver.online) d.fail('failed-precondition', 'Go online before publishing your driver location.');
    }
    if (ride && !activeStatuses.includes(ride.status)) d.fail('failed-precondition', 'This trip has finished.');
    if (ride && (user.role === 'driver' ? ride.driverId !== uid : ride.passengerId !== uid)) d.fail('permission-denied', 'You are not a participant in this trip.');
    if (driver) transaction.update(refs.driver(uid), { location: d.approximate(location), lastSeen: stamp() });
    if (ride) transaction.update(refs.ride(rideId), { [user.role === 'driver' ? 'driverLocation' : 'passengerLocation']: { ...location, timestamp: stamp(), updatedAt: stamp() }, updatedAt: stamp() });
    if (!driver && !ride) d.fail('failed-precondition', 'You do not have an active trip to share your location with.');
  });
  return { ok: true };
});

exports.requestRide = callable(async (request, data) => {
  const uid = identity(request);
  const requestId = d.id(data.requestId, 'request ID', 100);
  d.id(uid, 'account ID', 128);
  const details = d.booking(data);
  // UID plus caller-generated key isolates idempotency between accounts.
  const rideId = `${uid}_${requestId}`;
  await db.runTransaction(async (transaction) => {
    const [userSnapshot, existing] = await transaction.getAll(refs.user(uid), refs.ride(rideId));
    const user = profile(userSnapshot, 'passenger');
    if (existing.exists) {
      if (existing.data().passengerId !== uid) d.fail('permission-denied', 'This request key is unavailable.');
      return; // Repeated submissions always return the original trip, including terminal trips.
    }
    if (user.activeRideId) d.fail('failed-precondition', 'You already have an active trip. Open it before requesting another.');
    transaction.create(refs.ride(rideId), {
      id: rideId, passengerId: uid, driverId: null, passenger: { name: user.name, phone: user.phone }, driver: null,
      ...details, status: 'requested', createdAt: stamp(), updatedAt: stamp(),
    });
    transaction.create(refs.request(rideId), {
      id: rideId, pickup: { ...d.approximate(details.pickup), label: 'Nearby pickup in Keimoes' },
      dropoffLabel: details.destinationId === 'custom' ? 'Custom destination in Keimoes' : details.dropoff.label,
      fare: details.fare, passengers: details.passengers, rideType: details.rideType, createdAt: stamp(),
    });
    transaction.update(refs.user(uid), { activeRideId: rideId, updatedAt: stamp() });
  });
  return { rideId };
});

exports.acceptRide = callable(async (request, data) => {
  const uid = identity(request);
  const rideId = d.id(data.rideId, 'trip ID');
  const location = d.point(data.location, 'Your location', true);
  const result = await db.runTransaction(async (transaction) => {
    const [driverUser, application, publicDriver, rideSnapshot] = await transaction.getAll(refs.user(uid), refs.app(uid), refs.driver(uid), refs.ride(rideId));
    const user = profile(driverUser, 'driver');
    const app = approved(application);
    const ride = existingRide(rideSnapshot);
    if (ride.driverId === uid && user.activeRideId === rideId && ['accepted', 'arrived', 'in_progress'].includes(ride.status)) return 'accepted';
    if (ride.status !== 'requested' || ride.driverId) d.fail('already-exists', 'Another driver has already accepted this trip.');
    if (user.activeRideId) d.fail('failed-precondition', 'Finish your current trip first.');
    if (!publicDriver.exists || !publicDriver.data().online) d.fail('failed-precondition', 'Go online before accepting a trip.');
    if (Date.now() - d.milliseconds(publicDriver.data().lastSeen) > GPS_LIFETIME) d.fail('failed-precondition', 'Your location is stale. Refresh GPS before accepting a trip.');
    if (ride.passengers > app.vehicle.seats) d.fail('failed-precondition', 'Your verified vehicle does not have enough passenger seats.');
    const passengerSnapshot = await transaction.get(refs.user(ride.passengerId));
    const passenger = profile(passengerSnapshot, 'passenger');
    if (Date.now() - d.milliseconds(ride.createdAt) > REQUEST_LIFETIME) {
      transaction.update(refs.ride(rideId), { status: 'cancelled', cancelReason: 'No driver accepted within 10 minutes.', cancelledBy: 'system', updatedAt: stamp() });
      transaction.delete(refs.request(rideId));
      if (passenger.activeRideId === rideId) transaction.update(refs.user(ride.passengerId), { activeRideId: null, updatedAt: stamp() });
      return 'expired';
    }
    if (passenger.activeRideId !== rideId) d.fail('failed-precondition', 'The passenger is no longer waiting for this trip.');
    transaction.update(refs.ride(rideId), {
      status: 'accepted', driverId: uid, driver: { uid, name: user.name, phone: user.phone, vehicle: app.vehicle, portraitPath: app.portraitPath },
      driverLocation: { ...location, timestamp: stamp(), updatedAt: stamp() }, acceptedAt: stamp(), updatedAt: stamp(),
    });
    transaction.update(refs.user(uid), { activeRideId: rideId, updatedAt: stamp() });
    transaction.update(refs.driver(uid), { busy: true, location: d.approximate(location), lastSeen: stamp() });
    transaction.delete(refs.request(rideId));
    return 'accepted';
  });
  if (result === 'expired') d.fail('deadline-exceeded', 'This request expired. Ask the passenger to book a new trip.');
  return { rideId };
});

exports.transitionRide = callable(async (request, data) => {
  const uid = identity(request);
  const rideId = d.id(data.rideId, 'trip ID');
  if (!['arrive', 'start', 'complete', 'cancel'].includes(data.action)) d.fail('invalid-argument', 'Unknown trip action.');
  const reason = d.optionalText(data.reason, 'Cancellation reason', 300);
  await db.runTransaction(async (transaction) => {
    const rideSnapshot = await transaction.get(refs.ride(rideId));
    const ride = existingRide(rideSnapshot);
    const isDriver = ride.driverId === uid;
    if (!isDriver && ride.passengerId !== uid) d.fail('permission-denied', 'Only trip participants may change this trip.');
    if (!activeStatuses.includes(ride.status)) d.fail('failed-precondition', 'This trip is already finished and cannot be changed.');
    const terminal = ['complete', 'cancel'].includes(data.action);
    const targets = [refs.user(ride.passengerId)];
    if (ride.driverId) targets.push(refs.user(ride.driverId), refs.driver(ride.driverId));
    const participantSnapshots = await transaction.getAll(...targets);
    const expected = { arrive: 'accepted', start: 'arrived', complete: 'in_progress' };
    if (data.action !== 'cancel') {
      if (!isDriver) d.fail('permission-denied', 'Only the assigned driver can update trip progress.');
      if (ride.status !== expected[data.action]) d.fail('failed-precondition', 'Follow the trip steps in order: arrive, start, then complete.');
    } else {
      if (ride.status === 'in_progress' && !isDriver) d.fail('failed-precondition', 'A trip in progress can only be ended by your driver. Use the safety options if you need help.');
      if (ride.status === 'in_progress' && reason.length < 5) d.fail('invalid-argument', 'An emergency cancellation needs a reason of at least 5 characters.');
    }
    const fields = { status: { arrive: 'arrived', start: 'in_progress', complete: 'completed', cancel: 'cancelled' }[data.action], updatedAt: stamp() };
    if (data.action === 'arrive') fields.arrivedAt = stamp();
    if (data.action === 'start') fields.startedAt = stamp();
    if (data.action === 'complete') fields.completedAt = stamp();
    if (data.action === 'cancel') Object.assign(fields, { cancelReason: reason || 'Trip cancelled.', cancelledBy: uid, cancelledAt: stamp() });
    transaction.update(refs.ride(rideId), fields);
    if (terminal) {
      participantSnapshots.slice(0, ride.driverId ? 2 : 1).forEach((snapshot) => {
        if (snapshot.exists && snapshot.data().activeRideId === rideId) transaction.update(snapshot.ref, { activeRideId: null, updatedAt: stamp() });
      });
      const publicDriver = participantSnapshots[2];
      if (publicDriver?.exists) transaction.update(publicDriver.ref, { busy: false, online: publicDriver.data().online === true && Date.now() - d.milliseconds(publicDriver.data().lastSeen) <= GPS_LIFETIME });
      transaction.delete(refs.request(rideId));
    }
  });
  return { ok: true };
});

exports.rateRide = callable(async (request, data) => {
  const uid = identity(request);
  const rideId = d.id(data.rideId, 'trip ID');
  const score = d.number(data.rating, 'Rating', 1, 5, true);
  const comment = d.optionalText(data.comment, 'Review', 300);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(refs.ride(rideId));
    const ride = existingRide(snapshot);
    if (ride.passengerId !== uid) d.fail('permission-denied', 'Only the passenger may rate this trip.');
    if (ride.status !== 'completed') d.fail('failed-precondition', 'Complete the trip before leaving a rating.');
    if (ride.rating) d.fail('already-exists', 'You have already rated this trip.');
    transaction.update(refs.ride(rideId), { rating: { score, comment, createdAt: stamp() }, updatedAt: stamp() });
  });
  return { ok: true };
});

// Expiration releases passenger locks even if no driver attempts acceptance.
exports.expireRideRequests = onSchedule({ schedule: 'every 1 minutes', timeZone: 'Africa/Johannesburg' }, async () => {
  const cutoff = Timestamp.fromMillis(Date.now() - REQUEST_LIFETIME);
  const oldRequests = await db.collection('kr_rideRequests').where('createdAt', '<=', cutoff).limit(200).get();
  // Bounded concurrency keeps transaction load predictable for a small-town service.
  for (let start = 0; start < oldRequests.docs.length; start += 10) {
    await Promise.all(oldRequests.docs.slice(start, start + 10).map((request) => db.runTransaction(async (transaction) => {
      const rideSnapshot = await transaction.get(refs.ride(request.id));
      if (!rideSnapshot.exists || rideSnapshot.data().status !== 'requested') { transaction.delete(request.ref); return; }
      const ride = rideSnapshot.data();
      const passenger = await transaction.get(refs.user(ride.passengerId));
      transaction.update(rideSnapshot.ref, { status: 'cancelled', cancelReason: 'No driver accepted within 10 minutes.', cancelledBy: 'system', cancelledAt: stamp(), updatedAt: stamp() });
      transaction.delete(request.ref);
      if (passenger.exists && passenger.data().activeRideId === request.id) transaction.update(passenger.ref, { activeRideId: null, updatedAt: stamp() });
    })));
  }
});
