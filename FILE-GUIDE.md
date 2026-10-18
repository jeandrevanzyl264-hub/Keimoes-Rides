# Project file guide

Open the entire project folder in VS Code. Keep the folder structure intact; files such as `App.jsx` are compiled by Vite and are not standalone pages. The source ZIP contains the project files, while `node_modules`, local `.env.local`, emulator data and build output are generated separately.

## Entry points and configuration

| File | Purpose |
| --- | --- |
| `package.json`, `package-lock.json` | Frontend dependencies, pinned installation and project commands. |
| `index.html` | Browser entry document. |
| `netlify.toml` | Netlify production build/publish settings, headers and SPA fallback. |
| `vite.config.js` | React/Vite development server and production build. |
| `src/main.jsx` | Mounts the React application. |
| `src/App.jsx` | Passenger booking, driver workspace, active trips, account/history/safety views and ratings. |
| `src/styles.css` | Responsive visual system, layouts, forms, map panels and dialogs. |
| `.env.example` | Safe local emulator setting; copy to ignored `.env.local`. |
| `src/firebase-config.json` | Original Firebase browser project configuration, preserved from your files. |
| `src/map-config.json` | Original CARTO basemap URL/key, attribution and Keimoes centre. |
| `functions/config.json` | Shared fares, destinations, passenger limit and service radius. |

Keep the two original browser-configuration files. Do not put service-account credentials in them or expose Admin SDK credentials through any `VITE_` variable.

## Frontend services and components

| File | Purpose |
| --- | --- |
| `src/runtime.js`, `src/runtime-config.js` | Secure-context checks, explicit demo/live mode, optional emulator/public URLs and Firebase-default email continuation behaviour. |
| `src/firebase.js` | Initialises Firebase and switches all data services to the demo emulators when enabled. |
| `src/api.js` | Callable Functions wrapper, real-time subscriptions, chat writes and private image upload/read calls. |
| `src/useSession.js` | Authentication, server-owned profiles, email verification, legacy-account email migration and admin-claim state. |
| `src/useGeolocation.js` | Explicit GPS start/stop, accuracy/timestamps, permission errors and stale-location state. |
| `src/utils.js` | Currency/date formatting, distances, fare estimates, initials and relative time. |
| `src/components/AuthDialog.jsx` | Registration, sign-in, password recovery, profile completion and legacy-account migration. |
| `src/components/InstallApp.jsx` | Real browser install prompts, installed-state detection and Android/iPhone home-screen instructions. |
| `src/components/MapView.jsx` | Leaflet/CARTO map, selected pins, real driver markers, OSRM road previews and truthful route/tile fallbacks. |
| `src/components/ChatPanel.jsx` | Bounded real-time messages between active-trip participants. |
| `src/components/DriverApplication.jsx` | Vehicle details, three image uploads, consent and application status. |
| `src/components/AdminPanel.jsx` | Pending applications, protected evidence previews and server-authorised review decisions. |
| `src/components/PrivatePhoto.jsx` | Authenticated image loading with temporary object URLs and cleanup. |

## Firebase backend and permissions

| File | Purpose |
| --- | --- |
| `functions/package.json`, `functions/package-lock.json` | Node 22 Functions dependencies and reproducible installation. |
| `functions/index.js` | Authoritative profiles, private image upload/read, manual approval, availability/GPS publication, booking/acceptance, ordered trip transitions, ratings and scheduled expiry. |
| `functions/domain.cjs` | Input validation, service-area checks, vehicle/image checks and server fare calculation. |
| `firebase.json` | Functions runtime, Firestore/Storage rule paths, Hosting headers/rewrites and emulator ports. |
| `.firebaserc` | Existing real-project alias; development commands explicitly select the demo project. |
| `firestore.rules` | Participant/privacy rules; direct client mutations are limited to validated chat messages. |
| `firestore.indexes.json` | Composite indexes for history, applications and online driver queries. |
| `storage.rules` | Denies all direct browser Storage access; images go through authenticated server callables. |
| `scripts/build-production.mjs` | Forces live Firebase for publication despite local demo environment settings, and writes build metadata. |
| `scripts/check-production.mjs` | Read-only audit of local/published production app, Firebase Auth and callable authentication guards. |
| `scripts/set-admin.mjs` | Trusted-terminal grant/revoke of the admin custom claim using existing ADC or local emulator access. |

New data lives in `kr_users`, `kr_driverApplications`, `kr_publicDrivers`, `kr_rides`, `kr_rideRequests` and `kr_adminAudit`. Messages live under `kr_rides/{rideId}/messages`. Driver portraits use `driver-portraits/{uid}/portrait`; private documents use `driver-documents/{uid}/license` and `driver-documents/{uid}/permit`. Protected records are written through Functions, so editing a React state value cannot change roles, approval or the stored fare.

## Web-app assets, checks and guides

The `public/_headers` and `public/_redirects` files retain Netlify headers/fallbacks when the built folder is uploaded manually. The `public/` folder also contains `manifest.webmanifest`, `sw.js`, `offline.html` and `icons/icon.svg`, `icons/icon-192.png`, `icons/icon-512.png`, `icons/maskable-512.png`, copied into the build. `public/licenses/` preserves the bundled fonts' Open Font License notices. The service worker caches only a public offline page and brand assets; it never caches private Firebase responses or enables offline dispatch.

| Path | Purpose |
| --- | --- |
| `tests/runtime.test.mjs`, `tests/production.test.mjs` | Secure runtime selection, production build/audit and published metadata/bundle checks. |
| `tests/deployment.browser.spec.js` | Hosted build, secure-context and install/verification behaviour. |
| `tests/domain.test.cjs` | Fare, input and geographic boundary checks without a deployed backend. |
| `tests/backend.guards.test.cjs` | Authentication, role, input and stale-location guards against the real emulator backend. |
| `tests/rules.test.mjs` | Client SDK Firestore/Storage privacy, query and chat rules. |
| `tests/backend.test.cjs` | Local Firebase integration checks, including competing drivers, private images/chat and complete trip progression. |
| `tests/auth.browser.spec.js` | Browser registration, password recovery, verification and original-account migration. |
| `tests/app.browser.spec.js` | Fare selection, map pins, GPS denial, mobile layout, safety and offline interface checks. |
| `tests/ride.browser.spec.js` | Complete driver–operator–passenger journey: uploads, review, dispatch, GPS, chat, cash completion and rating. |
| `playwright.config.js` | Test browser/server settings and report output. |
| `CODE-EXPLORER.html` | Offline source browser with search, copy and download controls; no app server needed. |
| `FILES-WITH-CODE.md` | Complete text source for manual reconstruction, including lockfiles. |
| `docs/GO-LIVE-NETLIFY.md` | Complete replacement and live Netlify/Firebase walkthrough, email and physical-device acceptance. |
| `docs/GETTING_STARTED.md` | Short guide to the correct setup/publication path. |
| `docs/VS-CODE-SETUP.md` | Step-by-step ZIP/exact-file/copy-paste instructions for VS Code. |
| `README.md` | Start here: VS Code/local setup, fares and project scope. |
| `docs/DEPLOYMENT.md` | Firebase backend deployment plus the optional Firebase Hosting frontend alternative. |
| `docs/OPERATIONS.md` | Administrator setup, manual driver review, real-device acceptance and daily service responsibilities. |
| `docs/VALIDATION.md` | What was tested locally, how to reproduce it and what still needs production validation. |
| `docs/screenshots/` | Desktop and mobile previews of the rebuilt interface. |
| `.gitignore` | Keeps dependencies, local environment files, credentials, reports and build artifacts out of source control. |

`dist/` for publication is generated by `npm run build:production` and can be deployed to Netlify or Firebase Hosting. Keep source files for development. The former payment-backend checkout was archived separately during replacement and remains recoverable from repository history where available; it is not part of this app's runtime or source ZIP. Existing live Firebase Auth identities and old stored collections are not deleted by replacing the source code.
