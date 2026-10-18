# Go live on a new Netlify project

This guide uses **Netlify for the website** and your existing **`keimoes-rides` Firebase project for authentication, rides and private images**. These are separate deployments. No Netlify or Firebase production deployment has been performed just by generating this package, and no real email delivery has been verified.

The latest pre-deployment availability check reached Firebase's public Auth configuration, but all eleven ride callables returned **404**. That means the ride backend still needs deploying. A working Auth configuration response does not prove that email/password sign-in is enabled or that mail reaches an inbox.

## 1. Replace the whole project with the updated files

Use the newest source ZIP, not an earlier download. Back up the old project, then extract the ZIP into a **new empty folder** such as `Documents/Keimoes-Rides-Live`. This avoids mixing old files, local environment settings and a previous Netlify project link. Do not copy an old `.netlify` folder into the new project.

Open that folder in **VS Code → File → Open Folder**. Its root must contain `package.json`, `netlify.toml`, `firebase.json`, `src`, `functions` and `scripts`.

If you prefer copying code manually, open the updated `CODE-EXPLORER.html`, select each file and copy/download its **entire contents** into that exact relative path. Alternatively use each full file in `FILES-WITH-CODE.md`. In VS Code use **Ctrl+A → Ctrl+V → Ctrl+S** for each destination file. Do not paste Markdown fences, combine two files or keep old portions. Copy both dependency lockfiles too. PNG icons must be extracted from the ZIP; text cannot recreate them. [VS-CODE-SETUP.md](VS-CODE-SETUP.md) lists the folders and paths.

Keep `src/firebase-config.json` and `src/map-config.json` exactly as supplied. In particular, keep `authDomain: keimoes-rides.firebaseapp.com`; a Netlify domain does not replace Firebase's Auth domain. The provided files preserve your original keys without needing new values.

## 2. Install the tools and dependencies

Install the latest Node **22** patch (**22.13 or newer**) and VS Code. The frontend supports Node 24 too; deployed Firebase Functions use Node 22. Java 21+ is required only if you run the local emulator tests. Google Cloud CLI is needed later only for the trusted administrator-claim procedure.

Open VS Code's integrated terminal in the project root:

```sh
node --version
npm --version
npm ci
npm ci --prefix functions
```

Run each command separately and wait for completion. If Windows PowerShell blocks `npm.ps1`, choose a Command Prompt terminal profile.

You may copy the complete `.env.example` to `.env.local` for local testing. Leave its safe demo defaults in place. The dedicated production build in step 5 overrides emulator mode; you do not need to edit source lines to publish.

## 3. Prepare the existing Firebase project

Open [Firebase Console](https://console.firebase.google.com/) with an authorised account and select **`keimoes-rides`**.

1. Enable **Authentication → Sign-in method → Email/Password**. Configure the sender/support address and verification/password-reset email templates. Keep the email action handler on Firebase's hosted Auth flow; do not point an action handler at the Netlify homepage.
2. Enable the **Blaze billing plan** for deployed Functions and current Storage requirements. Set budget alerts. Review the Firebase/Google Cloud APIs and service-agent permissions requested during deployment.
3. Create the **default Firestore database** and initialise the configured Storage bucket **`keimoes-rides.firebasestorage.app`**, if they are not already present. Review the database/bucket locations before creation.
4. Back up existing production data and review the new rules. New data uses `kr_` collections; old `users` and `rides` data remains stored, but the new deny-by-default rules do not grant this client access to it.

Driver evidence goes through authenticated `uploadDriverFile`/`getDriverFile` callables. Direct browser Storage reads and writes are denied. No public image/download token or bucket CORS workaround is needed.

## 4. Deploy the Firebase backend first

From the VS Code terminal:

```sh
npx firebase login
npx firebase projects:list
```

Check that your account can access `keimoes-rides`. Then deploy the supplied backend and access controls:

```sh
npx firebase deploy --project keimoes-rides --only "functions,firestore:rules,firestore:indexes,storage"
```

Wait for success and for Firestore composite indexes to finish building. Functions use **`us-central1`** and Node 22. The deployment includes the scheduled `expireRideRequests` job, which cleans unaccepted requests after ten minutes. Check that Cloud Scheduler and the required service agents are enabled.

The eleven user-facing callables are `saveProfile`, `uploadDriverFile`, `getDriverFile`, `submitDriverApplication`, `reviewDriver`, `setAvailability`, `publishLocation`, `requestRide`, `acceptRide`, `transitionRide` and `rateRide`. They belong to **Firebase**, not Netlify Functions. Do not configure the root `functions` folder as a Netlify Functions directory.

If deployment fails, finish the reported billing/API/permission prerequisite, then rerun the affected deployment. Do not weaken Firestore/Storage rules or put an Admin SDK key in the website to work around a server error.

## 5. Create the production website files

Run:

```sh
npm run build:production
```

This wrapper forces `VITE_USE_EMULATORS=false` even if `.env.local` says `true`. It preserves the original Firebase configuration and produces the complete frontend in **`dist`**.

Inspect `dist/deployment.json`: it should say `firebaseMode: production`, `projectId: keimoes-rides` and `region: us-central1`. Do not manually edit this generated file to make a demo build look live; rebuild instead.

For publication, use this command rather than ordinary `npm run build`. The ordinary build refuses emulator settings unless a developer explicitly enables the local-preview exception; do not bypass that guard for publication.

## 6. Create and deploy the new Netlify project

Choose **A or B**. Both publish the same production `dist`.

### A. Netlify website: upload the completed build

Sign in to Netlify and use its **manual deploy / Netlify Drop** flow to create a new project. Drag the complete `dist` folder into the upload area. If you received a prebuilt Netlify deployment ZIP, extract it and upload the folder whose top level contains `index.html`, `deployment.json`, `_headers`, `_redirects` and `assets`.

The supplied `public/_headers` and `public/_redirects` are copied into `dist` during the build, so manual deployment retains the security/cache headers and app fallback. Keep the new project's HTTPS address. Do not upload the source ZIP as if it were the built website, and do not upload only `index.html`.

For later updates, open the same project's deploy area and upload the entire newly built `dist`. Check the project name before publishing.

### B. Netlify CLI: create a new project and upload

Run these commands **from the new project root**, where `netlify.toml` lives. It must not contain an old `.netlify` binding from another project; use the freshly extracted source folder for this first deployment. The CLI command below was checked against Netlify CLI 27.13.0:

```sh
npx netlify-cli@27.13.0 login
```

Complete the browser login with your Netlify account. Then choose a unique new project name, for example `keimoes-rides-yourname`, and run:

```sh
npx netlify-cli@27.13.0 deploy --dir=dist --no-build --prod --site-name keimoes-rides-yourname
```

Replace the example name with your chosen **new unique** name. Select the correct team if prompted and confirm that you are creating the intended new project. `--site-name` creates it if absent; do not accidentally reuse an old project's name. `--prod` publishes the live website. `--no-build` uses the production `dist` you already built.

Keep the printed HTTPS address, such as `https://keimoes-rides-yourname.netlify.app`. The CLI reads `netlify.toml`, including security/cache headers and the app fallback. Do not deploy the source folder or `node_modules` as the publish directory.

For later replacements, build again and deploy to the confirmed project ID shown in Netlify:

```sh
npm run build:production
npx netlify-cli@27.13.0 deploy --dir=dist --no-build --prod --site YOUR_NETLIFY_PROJECT_ID
```

Replace the example ID with the intended project's actual ID. Do not paste access tokens into source files or chat; the CLI login stores authentication locally.

If you prefer continuous deployment through the Netlify website, create a **new project from the repository** and use these settings, already supplied in `netlify.toml`:

| Setting | Value |
| --- | --- |
| Base directory | Repository root |
| Build command | `npm run build:production` |
| Publish directory | `dist` |
| Node version | `22` |
| `VITE_USE_EMULATORS` | `false` |

This frontend build does not deploy Firebase. Keep step 4 as a separate deployment. No additional secret is required for the browser's existing Firebase configuration.

## 7. Authorise the real HTTPS hostname in Firebase

Return to **Firebase Authentication → Settings → Authorised domains**. Add the exact Netlify hostname, for example:

```text
keimoes-rides-yourname.netlify.app
```

Enter the hostname only, without `https://` or a path. Add any actual custom domain too. Add `localhost` only if you deliberately test the live project locally; recently created projects may not include it automatically.

Keep the original Firebase `authDomain` in the source. By default this app does **not** inject the Netlify address as an email continuation URL. Firebase's default hosted verification/reset flow remains in use. If you later choose an optional `VITE_AUTH_CONTINUE_URL`, it must be an authorised public HTTPS origin, and you must rebuild/redeploy after configuring it. Leaving it empty is supported.

If API-key website restrictions are already enabled in Google Cloud, include the real app origin in those existing restrictions without changing the preserved key. Check the CARTO key's allowed domains and usage limits as well.

## 8. Run the read-only production check

Back in your project folder:

```sh
npm run check:production -- --site https://keimoes-rides-yourname.netlify.app
```

Use your actual HTTPS address. The script:

- Confirms your **local** `dist` selects the original production project/configuration and contains production build metadata.
- Fetches the actual HTTPS homepage, its deployment metadata and linked JavaScript to check the published production app/project configuration.
- Reads public Firebase Auth configuration and checks whether the supplied hostname is authorised.
- Calls each ride endpoint without a user. A correct deployed authentication guard returns **401 / UNAUTHENTICATED**; that is a passing check. **404** means an endpoint is missing or the project/region is wrong.
- Leaves email delivery, deployed-rule correctness and scheduler health for real account/operator checks.

Also open the actual HTTPS app and inspect its `/deployment.json`. The checker validates the expected app/project configuration; it does not establish that an email arrived, documents were reviewed or a real taxi journey was tested.

## 9. Create the operator account and grant administrator access

Register a **real** operator email on the published HTTPS app, receive the Firebase verification message and verify it. An emulator account from `demo-keimoes-rides` does not exist in production.

Get the new user's UID from Firebase Authentication. From a trusted administrator terminal with Google Cloud CLI and Firebase Auth administration permission:

```sh
gcloud auth application-default login
```

Ensure `FIREBASE_AUTH_EMULATOR_HOST` is unset. On macOS/Linux:

```sh
GCLOUD_PROJECT=keimoes-rides npm run admin -- AUTH_UID grant
```

On PowerShell:

```powershell
$env:GCLOUD_PROJECT = 'keimoes-rides'
npm run admin -- AUTH_UID grant
Remove-Item Env:GCLOUD_PROJECT
```

Replace `AUTH_UID` with that production operator account's actual UID. Sign out/in afterward. The script uses trusted Application Default Credentials and the `admin` custom claim. There is no admin self-registration button and no service-account secret in the frontend. See [OPERATIONS.md](OPERATIONS.md) for revocation and driver review.

If you use Windows Command Prompt instead of PowerShell, use:

```bat
set GCLOUD_PROJECT=keimoes-rides
npm run admin -- AUTH_UID grant
set GCLOUD_PROJECT=
```

## 10. Test real email, two devices and installation

Use the final **HTTPS** Netlify address on the passenger and driver phones in Keimoes.

1. Register a new production passenger account. Confirm the actual verification email arrives, including a spam-folder check, then follow it and refresh verification in the app. Test password reset too. Do not count the emulator's generated link as email delivery.
2. Register a driver, verify email, upload portrait/licence/permit and vehicle details, and manually approve the application from the operator account. Check that unrelated users cannot read private documents.
3. Allow real device location, go online and request a ride. Confirm only a fresh approved available driver appears. Check portrait, vehicle and plate, chat, movement updates, refresh recovery, arrive/start/cash completion, rating and cleared active-trip locks.
4. Deny permission, lose connection, move outside service coverage, and background/lock the driver phone. Make the foreground-tracking limit clear; the web app cannot guarantee native continuous tracking while suspended or closed.
5. Open the PWA install menu on the actual HTTPS site. Supported Android browsers offer install/add-to-home; on iPhone use Safari's Share → Add to Home Screen when available. Check the icon, launch, refresh/update and offline information page.
6. Confirm service-owner privacy, document review/renewal, fares, local safety contacts and emergency procedures before carrying passengers. [OPERATIONS.md](OPERATIONS.md#two-device-acceptance-check) has the full acceptance list.

## Why the earlier local attempt did not email or work on a phone

| Situation | Explanation and fix |
| --- | --- |
| Demo registration says a link exists but inbox is empty | The Auth emulator never sends mail. Its links appear in the developer terminal. Use the production HTTPS build and real Firebase Auth for delivery testing. |
| `localhost` or `127.0.0.1` fails on a phone | It points to the phone, not the development computer. Open the Netlify HTTPS address. |
| A laptop LAN address opens but sign-in/GPS are blocked | Plain LAN HTTP is not a secure browser context. The app deliberately blocks sensitive features there. Publish HTTPS; do not enter real passwords into LAN HTTP. |
| Hosted page says it was built for emulators | Replace every file with the current package, run `npm run build:production`, deploy its complete `dist`, then reload the published app. |
| Account exists but ride profile cannot save | Auth and Functions are separate services. Deploy the backend, then complete the same account's profile; do not create duplicate accounts. |
| Email action fails after adding a Netlify hostname | Keep Firebase's original hosted Auth action handler. Check authorised domains and template/sender settings, then request a new link. |
| Backend check reports 404 | Deploy Functions to `keimoes-rides` in `us-central1`; verify the deployment completes. |

[VS Code full-file instructions](VS-CODE-SETUP.md) · [Firebase Hosting alternative](DEPLOYMENT.md) · [Operator guide](OPERATIONS.md)
