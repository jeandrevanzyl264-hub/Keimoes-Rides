// Run only from a trusted terminal using Application Default Credentials.
// This script never accepts a browser request and never changes a user's role.
import { createRequire } from 'node:module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const [uid, mode] = process.argv.slice(2);
const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
if (!uid || !/^[A-Za-z0-9_-]{1,128}$/.test(uid) || !['grant', 'revoke'].includes(mode) || !projectId) {
  console.error('Usage: GCLOUD_PROJECT=your-project node scripts/set-admin.mjs AUTH_UID grant|revoke');
  process.exit(1);
}
const options = { projectId };
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) options.credential = applicationDefault();
initializeApp(options);
const auth = getAuth();
const user = await auth.getUser(uid);
const claims = { ...(user.customClaims || {}) };
if (mode === 'grant') claims.admin = true;
else delete claims.admin;
await auth.setCustomUserClaims(uid, claims);
await auth.revokeRefreshTokens(uid);
console.log(`Administrator access ${mode === 'grant' ? 'granted' : 'revoked'} for the selected account. Sign out and sign in to refresh claims.`);
