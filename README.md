# Keimoes Rides

The complete replacement for the old payment backend: a responsive Keimoes taxi app with passenger booking, a driver workspace, manual driver verification, live trip updates and cash fares.

**To publish the app on a new Netlify project, follow [GO-LIVE-NETLIFY.md](docs/GO-LIVE-NETLIFY.md).** It covers replacing every file, the Firebase backend, Netlify, real email and phone testing. [VS-CODE-SETUP.md](docs/VS-CODE-SETUP.md) explains creating/copying files individually. The source ZIP is the easiest complete installation; `CODE-EXPLORER.html` and `FILES-WITH-CODE.md` contain each text file's full replacement contents.

The original Firebase browser configuration and CARTO basemap configuration are preserved in `src/firebase-config.json` and `src/map-config.json`, including the original Firebase `authDomain`. Do not replace their keys or change the Auth domain to a Netlify hostname. Firebase rules and server checks control access; never put an Admin SDK credential in frontend code.

## Included

- Registration, separate sign-in, password recovery, real email verification and original phone-account migration.
- Pickup/destination pins, passenger counts, shared or express rides and authoritative server fares.
- Driver portrait, licence and permit uploads with an administrator's manual review before going online.
- Real foreground GPS, approximate nearby-driver positions and private precise trip locations.
- Atomic driver acceptance, ordered trip progress, cancellation, participant chat, history and ratings.
- Responsive map-first UI, safety contacts, text trip-summary sharing and an installable web-app shell.

Manual approval is a human evidence review; there is no automated face matching or liveness detection. Cash is collected by the driver. The old payment gateway is not part of this app.

## Local development

Use the latest Node **22** patch (22.13+) for the closest match to deployed Functions; the frontend also runs on Node 24. Java **21 or newer** is needed only for Firebase emulator testing. Open the entire folder in VS Code, then:

```sh
npm ci
npm ci --prefix functions
```

Copy the complete `.env.example` to `.env.local`. Its default `VITE_USE_EMULATORS=true` selects the isolated demo project. Keep terminal 1 running:

```sh
npm run emulators
```

In terminal 2:

```sh
npm run dev
```

Open **http://localhost:5173 on that development computer**. Local Firebase accounts are separate from production accounts. The Auth emulator **never sends email**: use its terminal verification/reset links. Data services run locally, while basemap tiles and optional OSRM routing still need internet.

`localhost` and `127.0.0.1` on a phone refer to the phone. They cannot reach the laptop's loopback-only emulators. Plain LAN HTTP is not a secure context; the app blocks password/GPS features there. Use the deployed **HTTPS Netlify address** for real phone testing, real sign-in and email delivery.

## Production build and go-live

Always use the production wrapper for anything you will upload:

```sh
npm run build:production
```

It creates `dist/` and forces live Firebase even if your copied `.env.local` still says `true`. Ordinary `npm run build` refuses emulator settings unless a developer explicitly enables a local-preview exception. Use the production wrapper for publication; do not bypass that guard. The original Firebase project and keys stay intact.

Netlify hosts the frontend. Firebase must separately host the callable backend, Firestore rules/indexes and private Storage rules. Publishing `dist/` alone does not create these services. No live deployment or email delivery is claimed by this source package.

After deployment:

```sh
npm run check:production -- --site https://YOUR-PROJECT.netlify.app
```

Replace the example with your actual HTTPS app address. The read-only checker inspects the local and published production app, Auth configuration and the eleven callable authentication guards. It does not prove email delivery, rule correctness or physical-device GPS; complete the checks in [the go-live guide](docs/GO-LIVE-NETLIFY.md).

## Fares and coverage

| Ride | Fare |
| --- | --- |
| Shared to Keimoes Central | R25 per passenger |
| Shared to Upper Town | R35 per passenger |
| Express | R150 per trip |
| Shared to a custom pin | At least R25 per passenger; straight-line kilometres × R10, rounded up to R5, then multiplied by passengers |

One to four passengers are supported, subject to approved vehicle seating. The service area is a **15 km radius** around Keimoes. Central/Upper Town pins are approximate and need local confirmation. Road-route previews do not determine custom-pin fares. Change the complete shared configuration in `functions/config.json`, rebuild the frontend and redeploy Functions together. Kakamas, Kanoneiland and Upington are not enabled by default.

## Tests and real-world limits

```sh
npm test
npm run build:production
```

Stop manually running emulators before `npm run test:integration`, which starts/stops its own instance. Restart `npm run emulators` before browser tests:

```sh
npm run test:integration
npx playwright install chromium
npm run test:e2e
```

See [VALIDATION.md](docs/VALIDATION.md) for recorded results. Test accounts and data use `demo-keimoes-rides`. Production needs billing, enabled Auth, deployed backend/rules/indexes, an operator account and two real devices over HTTPS.

Browser GPS works while the page can run; a suspended or closed mobile browser cannot guarantee continuous tracking or dispatch. OSRM's public route service is best effort and falls back to a labelled straight line. Confirm CARTO domain/usage restrictions and establish local driver review, privacy, retention and emergency procedures.

Original phone users can sign in with their existing number format/password and add a verified real email while keeping their Firebase Auth UID. Existing `users`/`rides` records are not deleted; the new app uses `kr_` collections. Old history needs a separately reviewed migration, and the new rules deny this client's access to old collections.

[Netlify go-live](docs/GO-LIVE-NETLIFY.md) · [VS Code steps](docs/VS-CODE-SETUP.md) · [File guide](docs/FILE-GUIDE.md) · [Firebase alternative](docs/DEPLOYMENT.md) · [Operator guide](docs/OPERATIONS.md)
