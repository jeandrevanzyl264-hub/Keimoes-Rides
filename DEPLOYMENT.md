# Firebase deployment and the Firebase Hosting alternative

**Netlify is the preferred frontend in this package. Follow [GO-LIVE-NETLIFY.md](GO-LIVE-NETLIFY.md) for the complete new-project walkthrough.** Firebase still hosts authentication, callables, Firestore and private images regardless of where the frontend lives. This page also shows the optional Firebase Hosting frontend alternative.

## Prepare the real Firebase project

Use an authorised administrator account in the Firebase/Google Cloud consoles:

1. Select `keimoes-rides`. Keep `src/firebase-config.json` and `src/map-config.json` intact, including `authDomain: keimoes-rides.firebaseapp.com`. The configured bucket is `keimoes-rides.firebasestorage.app`.
2. Enable Email/Password in Authentication. Review the email sender and verification/reset templates. Keep Firebase's hosted email action handler. The default live app does not add a Netlify continuation URL.
3. Initialise the default Firestore database and configured Storage bucket if necessary. Review their locations first. Functions use `us-central1`; change client/server regions together only through a separately reviewed configuration change.
4. Enable Blaze billing and set alerts. Functions/Storage/Scheduler may require Cloud Functions, Cloud Run, Cloud Build, Artifact Registry, Pub/Sub, Cloud Scheduler and the corresponding service-agent permissions.
5. Back up existing production data. The supplied rules protect the new `kr_` schema and deny unspecified paths. Old documents are not deleted, but the old client collections are not made readable by these new rules.

Driver evidence is uploaded/read through authenticated `uploadDriverFile` and `getDriverFile` callables. Direct client Storage access is denied; there are no permanent public download links or required bucket CORS workaround. Keep files JPEG/PNG/WebP and at most 5 MiB each.

## Deploy the backend

Use a current Node 22 patch (22.13+) for the toolchain; the frontend also builds on Node 24. From the root:

```sh
npm ci
npm ci --prefix functions
npx firebase login
npx firebase projects:list
npx firebase deploy --project keimoes-rides --only "functions,firestore:rules,firestore:indexes,storage"
```

Verify the explicit project, deployment success and index readiness. The deployment includes the one-minute `expireRideRequests` job. Requests expire after ten minutes; scheduled cleanup releases passenger locks. The Scheduler emulator does not run periodic jobs automatically.

A browser Firebase key is not an administrator credential. Use existing authorised tooling and keep service-account files out of `src`, `public`, source control and chat. Do not relax rules to diagnose a failure.

## Netlify frontend

Continue at [the Netlify go-live guide](GO-LIVE-NETLIFY.md#5-create-the-production-website-files). The frontend publish directory is `dist`; the build command is **`npm run build:production`**. This wrapper overrides copied local emulator settings. Netlify deployment does not deploy the Firebase backend.

## Optional Firebase Hosting frontend instead

Build and publish the same frontend with Firebase Hosting:

```sh
npm run build:production
npx firebase deploy --project keimoes-rides --only hosting
```

The wrapper creates production `dist/deployment.json`. Do not publish an ordinary local-environment build. Firebase Hosting supplies HTTPS and uses the supplied headers/rewrites. Add each actual Hosting/custom hostname in **Authentication → Settings → Authorised domains**. Hostnames omit protocol, path and port. Add `localhost` only if intentionally using live Auth locally; new projects may omit it.

After publishing, replace the example with your actual HTTPS address:

```sh
npm run check:production -- --site https://keimoes-rides.web.app
```

The read-only audit checks local and published build configuration, public Auth configuration and the eleven callable auth guards. It cannot prove real email delivery, all rule/index behaviour or Scheduler health. Inspect any failures, then perform the real-device journey.

## Operator and acceptance

Register/verify a real production operator and grant its custom `admin` claim through [the trusted ADC procedure](OPERATIONS.md#production-administrator). No browser role selector can grant admin access. Local emulator accounts are not production accounts.

Complete the [two-device acceptance journey](OPERATIONS.md#two-device-acceptance-check): real inbox verification/reset, private evidence review, GPS denial/staleness, competing acceptance, refresh recovery, chat, ordered trip progress, cash completion and cancellation. Check the deployed expiry Scheduler and Functions logs. No deployment or email delivery is implied by building this source package.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Missing ride endpoint / 404 | Deploy the supplied callables to `keimoes-rides` in `us-central1`; inspect deployment errors. |
| Auth configuration returns 200 but booking fails | Public Auth configuration and the ride backend are separate services. Check callable availability. |
| Email/password not allowed | Enable the Email/Password provider in this project. |
| Verification/reset email fails | Real production account, sender/template configuration and spam folder; emulators never send email. Keep the Firebase-hosted handler. |
| Unauthorised email continuation | Leave optional continuation empty, or authorise its actual HTTPS hostname and rebuild/redeploy. |
| Profile missing after partial registration | Complete the same signed-in account's profile after the backend is available; avoid duplicate accounts. |
| History/review query needs an index | Deploy `firestore.indexes.json` and wait until ready. |
| Private photo fails | Deployed private-file callables, correct bucket, authenticated owner/admin or approved portrait, accepted file/state limits. Direct browser Storage access is deliberately denied. |
| GPS blocked on a phone | Use the public HTTPS app and real OS/browser permissions; laptop localhost and plain LAN HTTP are not the production app. |
| Hosted app says local emulators | Run `npm run build:production`, deploy the complete new `dist`, then reload/reopen the app. |
| Requests never clear | Inspect Cloud Scheduler and `expireRideRequests` logs; do not bypass locks by editing fields. |

The service owner must still establish document renewal/suspension, privacy/retention, operating permissions, insurance and emergency response. Manual review is not biometric identity/liveness verification. A mobile browser cannot guarantee foreground-equivalent location/dispatch while suspended or closed.
