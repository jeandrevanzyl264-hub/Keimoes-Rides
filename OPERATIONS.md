# Operate and test Keimoes Rides

Use the published HTTPS Netlify app for production; see [GO-LIVE-NETLIFY.md](GO-LIVE-NETLIFY.md). Local emulator accounts are separate and never send real email. The passenger, driver and administrator flows use real Firebase roles and access checks. Use separate browser profiles or devices for each role; changing local storage cannot create an administrator or approve a driver.

## Local administrator

Start the emulators and register an operator account in the local app. Verify the account using the email action printed by the Auth emulator. Obtain its UID from the local Auth response or emulator tools.

From a trusted macOS/Linux terminal in the project folder:

```sh
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo-keimoes-rides npm run admin -- AUTH_UID grant
```

PowerShell:

```powershell
$env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
$env:GCLOUD_PROJECT = 'demo-keimoes-rides'
npm run admin -- AUTH_UID grant
Remove-Item Env:FIREBASE_AUTH_EMULATOR_HOST
Remove-Item Env:GCLOUD_PROJECT
```

Replace `AUTH_UID` with that local account's UID. Sign out and sign in to refresh the claim. Replace `grant` with `revoke` to remove access. Emulator accounts and claims do not affect live Firebase.

## Production administrator

Use a trusted operator terminal with appropriate Firebase Auth administration permissions. Authenticate Application Default Credentials with an approved identity, for example:

```sh
gcloud auth application-default login
```

Ensure `FIREBASE_AUTH_EMULATOR_HOST` is unset. Then:

```sh
GCLOUD_PROJECT=keimoes-rides npm run admin -- AUTH_UID grant
```

For PowerShell, set `$env:GCLOUD_PROJECT = 'keimoes-rides'`, run `npm run admin -- AUTH_UID grant`, then remove that environment variable. The script uses Application Default Credentials; it does not need an Admin SDK key in the browser or repository. Sign out and sign in afterward. Remove access with the same command using `revoke`.

## Review a driver

1. The applicant registers as a driver and verifies a real email address.
2. They supply a clear face portrait, a driving-licence image and an operating-permit image, plus vehicle model, colour, registration and passenger seats. Each image must be JPEG, PNG or WebP and at most 5 MiB.
3. They consent and submit. Pending files are locked so the evidence cannot change during review.
4. An administrator opens the review workspace, reads all three images and confirms the name, identity, documents, vehicle and operating authority through the service's real review process. A photo upload alone proves none of these.
5. The administrator approves or rejects, giving a useful reason. Rejected applicants can replace their files and resubmit. Approval creates an offline public profile; the driver still needs GPS and an explicit online action.

Identity documents are visible only to their owner and administrators. Approved portraits are visible to signed-in users. Images go through authenticated callable Functions; direct browser Storage access is denied and no permanent public document links are created. Review decisions are recorded in `kr_adminAudit`.

The current review screen handles pending applications. Approved-document renewal and driver suspension need a controlled operator process; do not improvise by changing approval or active-trip fields directly in Firestore. Arrange that workflow before running a fleet with expiring documents.

## Passenger and driver journey

The passenger signs in, verifies email, selects an actual pickup pin or explicitly enables GPS, chooses a destination, passenger count and ride type, then requests a ride. Pickups and destinations must lie inside the configured service area. A street or landmark note helps the driver find the correct entrance.

An approved driver enables GPS and goes online. Only recent online drivers appear nearby. The dispatch list exposes an approximate pickup and fare; the assigned driver's accepted trip then contains the passenger details needed for that journey. Two drivers accepting together cannot both claim the same ride.

The assigned driver follows these steps:

```text
requested → accepted → arrived → in_progress → completed
```

Before starting, the passenger checks the driver's approved portrait, number plate and vehicle details. The driver marks arrival, starts after pickup, collects the displayed cash fare and completes the trip. The passenger can then leave one rating. Earnings/history reflect recorded completed rides, not independently verified cash deposits or tax accounting.

Either participant can cancel before the trip starts. Once in progress, the driver can perform an emergency cancellation with a reason. Contact emergency services if anyone is unsafe; a status button is not an emergency-response service. Unaccepted requests expire after ten minutes; production cleanup runs about once a minute.

## Two-device acceptance check

Run this on the deployed HTTPS app with at least one passenger device and one real driver device in Keimoes. Use additional test accounts for the competition/privacy checks.

- Register both roles, receive the real email actions, verify, sign out/in, reset a password and check session recovery after refreshing.
- Upload all three driver images; ensure a passenger cannot read pending portraits or private documents. Review the application, then check the approved portrait and plate on the passenger's accepted trip.
- Deny GPS permission first: no default coordinates should be described as live GPS. Allow it and confirm accuracy, stale warnings and service-area enforcement. Confirm out-of-area GPS prevents a driver going online.
- Request a ride; refresh while waiting and during an accepted trip. Confirm the active trip recovers. Try accepting simultaneously from two approved drivers and verify only one assignment.
- Observe driver movement on the passenger device and passenger movement where shared with the assigned driver. Turn off the driver's connection or location services and check that stale positions lose their live status.
- Exchange chat messages. Ensure a third account cannot read the trip, phone numbers or messages. Confirm a completed/cancelled trip cannot receive new messages or be progressed again.
- Check arrive, start, cash confirmation, complete, one-time rating, cancellations and request expiry. Confirm both participants can take a new ride afterward.
- Put the driver app in the background and lock the phone. Record actual device behaviour and make the foreground-use limitation clear to drivers. A closed/suspended browser cannot guarantee GPS updates or incoming requests.
- Check mobile layouts, keyboard navigation, text zoom, weak connectivity and unavailable map/routing services. Verify map attribution remains visible.

## Safety, privacy and service ownership

The safety view provides South African police **10111** and mobile emergency **112** dial links; confirm appropriate local contacts and response procedures before launch. Shared trip information is a text summary, not a public live-tracking link. Tell passengers what data a shared summary includes.

Define who reviews documents, how long identity images and trip data are retained, who handles access/deletion requests, and how you respond to unsafe driving or expired documents. Limit operator accounts and review audit logs. Precise GPS and phone numbers belong to participants, not a public dispatch feed. The backend validates device-reported coordinates but does not attest that a device's GPS is authentic.

Keep the driver page open and connected while online. Go offline before ending a shift. Stale map filtering helps prevent false availability; it does not replace an operator's contact and incident process. No service worker performs background dispatch or stores a private offline ride queue.

## Routine checks

Monitor callable errors, Scheduler expiry failures, Firestore/Storage rules denials, billing and unusual account activity. Keep dependency updates reviewed and run the test suites after changes. Back up data according to your retention policy and test restoring it in a separate project. Recheck Auth authorised domains whenever the app address changes.

To change prices or coverage, replace the complete reviewed `functions/config.json`, review customer wording and fare tests, run `npm run build:production`, then deploy the new frontend and Functions together. Confirm local destination pins with the service owner. Avoid changing fares in only the browser: the server owns the charged cash amount.
