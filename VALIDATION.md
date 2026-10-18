# Validation and launch boundaries

Validation was performed in the development environment on 18 October 2026. Your original Firebase configuration and CARTO basemap URL/key were compared with the uploaded files and match exactly.

## Completed checks

- `npm run build:production` completes using the supplied dependency lockfiles. It overrides a copied `.env.local` emulator flag. A separate check confirms that ordinary publication with emulator settings is rejected. The generated metadata and built JavaScript select the original live Firebase configuration without the demo project.
- **19 domain/runtime/production-audit unit tests passed with no skips.** They cover the confirmed fares, insecure phone HTTP, hosted emulator builds, safe email continuation defaults, preserved build configuration and actual published-site inspection. The audit rejects an unrelated landing page, mismatched metadata and demo JavaScript.
- **25 backend/domain/security checks passed with no skips** against the local Firebase emulators. They cover email/role/admin guards, image MIME and size checks, private image access, upload locking, document resubmission, server-calculated fares, idempotent booking, competing drivers, active-trip locks, exact-location and chat privacy, ordered transitions, one-time ratings, cancellation and scheduled expiration.
- **22 browser tests passed** across the final suites: 13 authentication/recovery tests, four installation/HTTP tests, four guest UI tests and one complete ride journey. They use the isolated demo Firebase project. The ride journey uses three independent browser sessions and real emulator calls: image uploads, manual operator review, driver GPS, a two-person R50 cash request, driver acceptance, portrait/plate display, bidirectional chat with literal HTML text, moved GPS, refresh recovery, arrival, start, cash completion, cleared locks and a saved five-star rating. A failed offline-status request also confirms that an idle driver can still sign out locally with an honest warning.
- Authentication checks include verification requested before a profile-service outage, recovery with the same account, Firebase's default email handler, and a bounded refresh on returning from verification. Actual insecure private-IP browser origins expose no credential inputs and make no authentication requests. Installation tests use the genuine browser-event lifecycle plus Android/iPhone instructions; they do not claim installation onto a physical device.
- **16 isolated map/GPS checks** additionally exercised real browser permissions, stationary foreground sampling, hidden-tab staleness, resume, cleanup, fresh/busy driver filtering, route changes, road-routing failure and tile failure.
- Desktop and mobile views were inspected. The mobile page fits a 390-pixel viewport, and location permission denial never invents GPS coordinates.

The ride browser test caught and helped fix a dropped final movement sample: the app now queues the latest fresh position at the eight-second publish boundary instead of discarding it.

## Reproduce locally

Install dependencies and start the services as described in `VS-CODE-SETUP.md`. The `demo-keimoes-rides` project is isolated from your real Firebase data.

```sh
npm test
npm run build:production
npm run check:production -- --offline
```

Stop any manually started emulator instance, then run:

```sh
npm run test:integration
```

That command starts and stops its own emulators. Start `npm run emulators` again before browser tests:

```sh
npx playwright install chromium
npm run test:e2e
```

The browser configuration uses a system Chromium when available, or Playwright's installed Chromium. Do not run several Playwright CLI processes into the same output directory. Test data is generated only in the demo project; the full ride test cleans its own fixtures.

## Map validation in the cloud runner

The preserved CARTO URL returned actual map tiles successfully with TLS verification. The cloud runner's Chromium does not automatically trust its managed proxy CA, so documentation screenshots forwarded genuine CARTO tile bytes through Node's correctly configured CA trust. No TLS or checksum checks were disabled, and the application source has no testing proxy or certificate bypass. Ordinary browser/device connectivity to the provider still needs checking at launch.

## Not performed automatically

Nothing has been deployed to your live Firebase project or a new Netlify project from this session. The read-only live audit reached Firebase Auth configuration successfully, but all eleven new callables returned 404. Netlify deployment tools are unavailable in this session and Firebase CLI access is not authenticated. Production email delivery, real driver identity/legal evidence, the existing bucket's IAM settings, Firebase billing/quotas, production indexes/scheduler, real-device GPS and browser suspension need validation after deployment. The included legal/retention and driver-review procedures require the service owner's decisions.

Manual approval is not automated biometric matching, liveness detection, criminal-record screening or government identity verification. This web app provides foreground location sharing; it cannot guarantee continuous native-app-style tracking when a mobile browser is suspended or closed. Cash completion is confirmed by the driver; there is no card charge or payment reconciliation service.

Follow `GO-LIVE-NETLIFY.md` and the two-device acceptance journey in `OPERATIONS.md` before carrying real passengers. Building or running the public audit cannot establish real email delivery.

## Saved cloud development setup

The reusable cloud installation and startup instructions were saved for review. They install both locked dependency sets, prepare the official emulators, build production assets and describe restarting the local demo services with functional readiness checks. Saving this configuration does not deploy the public app or publish a new cloud snapshot. If environment settings still show the old pending `PAYSTACK_SECRET_KEY` requirement, remove that obsolete requirement; cash rides do not use it.
