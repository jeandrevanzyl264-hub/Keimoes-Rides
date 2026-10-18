'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const enabled = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST && (process.env.FUNCTIONS_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST));
const project = process.env.GCLOUD_PROJECT || 'demo-keimoes-rides';
if (enabled && !project.startsWith('demo-')) throw new Error('Guard tests only support demo emulator projects.');
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const functionsHost = process.env.FUNCTIONS_EMULATOR_HOST || '127.0.0.1:5001';
async function call(name, data, token) {
  const response = await fetch(`http://${functionsHost}/${project}/us-central1/${name}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ data }),
  });
  return { status: response.status, body: await response.json() };
}
test('live callable authentication guards work before database access', { skip: !enabled, timeout: 60000 }, async (t) => {
  const signup = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `guards-${Date.now()}@example.test`, password: 'Emulator-only-password-123!', returnSecureToken: true }),
  });
  assert.equal(signup.status, 200);
  const { idToken } = await signup.json();
  const protectedNames = ['submitDriverApplication', 'uploadDriverFile', 'setAvailability', 'publishLocation', 'requestRide', 'acceptRide', 'transitionRide', 'rateRide'];
  await t.test('all eleven callable operations reject unauthenticated callers', async () => {
    for (const name of ['saveProfile', 'reviewDriver', 'getDriverFile', ...protectedNames]) {
      const result = await call(name, {});
      assert.equal(result.body.error?.status, 'UNAUTHENTICATED', `${name}: ${JSON.stringify(result)}`);
    }
  });
  await t.test('all dispatch operations reject an unverified real Auth emulator token', async () => {
    for (const name of protectedNames) {
      const result = await call(name, {}, idToken);
      assert.equal(result.body.error?.status, 'FAILED_PRECONDITION', `${name}: ${JSON.stringify(result)}`);
    }
  });
  await t.test('administrator authority cannot be supplied in callable payloads', async () => {
    const result = await call('reviewDriver', { driverId: 'anyone', decision: 'approved', admin: true }, idToken);
    assert.equal(result.body.error?.status, 'PERMISSION_DENIED');
  });
});
