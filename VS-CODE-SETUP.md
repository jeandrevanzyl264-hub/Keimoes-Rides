# Put Keimoes Rides into VS Code

You receive the complete project, not just a design. The easiest route is to extract the supplied ZIP and open that folder. You can also copy every text file individually using `CODE-EXPLORER.html` or `FILES-WITH-CODE.md`.

Nothing here deploys to the real Firebase project until you explicitly run the production deployment commands. Keep the original Firebase and basemap settings already included in the project.

## 1. Install the tools once

Install [Visual Studio Code](https://code.visualstudio.com/), [Node.js](https://nodejs.org/) and a Java Development Kit version **21 or newer**.

The latest Node **22** patch (22.13+) is recommended because Firebase Functions deploy on Node 22. The frontend also supports Node 24. npm comes with Node. Java is needed for the local Firebase emulators, not to write the app.

Close and reopen VS Code after installation. Select **Terminal → New Terminal**, then check:

```sh
node --version
npm --version
java --version
```

If a command is not recognised, finish installing that tool and restart VS Code. On Windows, if PowerShell blocks `npm.ps1`, choose **Command Prompt** from the terminal profile dropdown rather than changing the computer's execution policy.

## 2. Recommended: extract and open the updated ZIP

For a full replacement, use a new empty folder and the latest ZIP. Replace whole files from the updated code browser if copying manually; do not merge old portions into new files. For publishing, follow [GO-LIVE-NETLIFY.md](GO-LIVE-NETLIFY.md).

1. Download the complete Keimoes Rides source ZIP to your computer.
2. Right-click it and select **Extract All** on Windows, or open it with your system's archive tool on macOS/Linux.
3. Choose a new folder such as `Documents/Keimoes-Rides`. Keep your old payment-backend files in a separate backup folder.
4. In VS Code choose **File → Open Folder** and select the extracted project root. The correct folder contains `package.json`, `index.html`, `src` and `functions` together.
5. Keep all included files, including files whose names begin with a dot. Do not move `src` files to the root or rename `.jsx` files to `.html`.

If you opened a folder containing only another `keimoes-rides` folder, open that inner folder. The VS Code Explorer should show `package.json` directly at the top level.

Continue at step 4 if you extracted the ZIP. Step 3 is for manual copy/paste instead.

## 3. Alternative: create and paste each file yourself

Open `CODE-EXPLORER.html` directly in your browser. It works offline and is a source viewer, not the running taxi app. Select a file in its file list and use **Copy** or **Download**. If the browser blocks clipboard access for a local HTML file, select the displayed code and press **Ctrl+A**, then **Ctrl+C** while the code has focus; or use Download. On macOS use **Cmd** instead of **Ctrl**.

`FILES-WITH-CODE.md` is the alternative: each heading gives the exact relative filename, followed by its complete code. Copy only the contents of that file's code block. Do not copy the heading or the opening/closing Markdown backticks.

In VS Code:

1. Choose **File → Open Folder** and create/open an empty folder named `Keimoes-Rides`.
2. In the Explorer, right-click the root and choose **New Folder** to create `src`, `src/components`, `functions`, `public`, `public/icons`, `scripts`, `tests` and `docs` as needed. Create `components` inside `src`, and `icons` inside `public`.
3. For each file listed in the code browser, create the exact path shown. For example, create `MapView.jsx` inside `src/components`; its full relative path is `src/components/MapView.jsx`.
4. Paste that file's code into the matching editor tab. To replace an existing file completely, click inside its editor, press **Ctrl+A**, then **Ctrl+V**. Save with **Ctrl+S**.
5. Use the encoding indicator at the bottom-right of VS Code and save text as **UTF-8**. Preserve punctuation, quotes and file extensions.
6. Repeat for every text file, including root and Functions lockfiles. Do not create `node_modules`; npm creates it.
7. Copy the three PNG icons from the supplied ZIP into `public/icons`. PNG images are binary files and cannot be recreated by pasting text. The SVG icon is text and can be copied normally.

Use these exact application paths:

```text
Keimoes-Rides/
  .env.example
  .firebaserc
  .gitignore
  firebase.json
  firestore.indexes.json
  firestore.rules
  index.html
  netlify.toml
  package.json
  package-lock.json
  playwright.config.js
  storage.rules
  vite.config.js
  src/
    App.jsx
    api.js
    firebase.js
    firebase-config.json
    main.jsx
    map-config.json
    runtime.js
    runtime-config.js
    styles.css
    useGeolocation.js
    useSession.js
    utils.js
    components/
      AdminPanel.jsx
      AuthDialog.jsx
      ChatPanel.jsx
      DriverApplication.jsx
      InstallApp.jsx
      MapView.jsx
      PrivatePhoto.jsx
  functions/
    config.json
    domain.cjs
    index.js
    package.json
    package-lock.json
  public/
    _headers
    _redirects
    manifest.webmanifest
    offline.html
    sw.js
    icons/
      icon.svg
      icon-192.png
      icon-512.png
      maskable-512.png
  scripts/
    build-production.mjs
    check-production.mjs
    set-admin.mjs
  tests/
    (copy every included test file with its original name)
  docs/
    (copy every included documentation file)
```

Copy additional files shown in the supplied package too; the code browser is the full inventory. `README.md`, `FILES-WITH-CODE.md` and `CODE-EXPLORER.html` are reference files, not scripts to paste into `App.jsx`.

The values in `src/firebase-config.json` and the map URL/key in `src/map-config.json` are the original ones from your uploads. Preserve them exactly. Never place an Admin SDK/service-account file inside `src` or `public`.

## 4. Install the project dependencies

Open **Terminal → New Terminal** in VS Code. It should already be in the project root, where `package.json` is visible. Run each line separately:

```sh
npm ci
npm ci --prefix functions
```

Wait for each command to finish before starting the next. `npm ci` uses the supplied lockfile. It creates the root and Functions `node_modules` folders; you do not paste dependency code manually.

If npm says it cannot find `package.json`, you are in the wrong folder. Open the correct project folder or use `cd` with your actual folder path.

## 5. Create the local environment file

In the Explorer, copy `.env.example`, paste it in the same root folder and rename the copy to **`.env.local`**. On Windows make sure it is not named `.env.local.txt`.

Its content must include:

```dotenv
VITE_USE_EMULATORS=true
```

Save it. This keeps local Auth, Firestore, Storage and Functions in the demo project. Do not put passwords, service-account keys or a payment key in this file. Restart the development server after changing an environment setting.

## 6. Terminal 1: start the local Firebase services

Run:

```sh
npm run emulators
```

The first run downloads official emulator files and needs internet access. Keep this terminal running. Wait until Auth, Firestore, Storage and Functions are ready. The project should say **`demo-keimoes-rides`**.

If a download is blocked by a network/domain restriction, allow the official destination in your environment/network settings and retry. Do not turn off TLS or checksum verification. If a port is in use, stop the other emulator instance rather than starting a duplicate.

## 7. Terminal 2: start the taxi app

Click the **+** button in the terminal panel to open a second terminal in the same project folder. Run:

```sh
npm run dev
```

Keep terminal 1 running. Open **http://localhost:5173** in Chrome, Edge or another current browser. Do not double-click `index.html` and do not use VS Code Live Server for this React app.

The browser should show the Keimoes interface and a local/demo indication. Open this localhost address on the development computer: localhost on a phone points to the phone. Plain LAN HTTP is insecure, so password and GPS features are blocked there. Use the published HTTPS Netlify app for real-device testing. GPS starts only when you choose to enable it. Map tiles and optional road previews need internet even though Firebase data services are local.

## 8. Try registration, driver review and a ride

1. Create a passenger account with an email, South African mobile number and strong password.
2. In local mode no real email is sent. Open the verification link printed in terminal 1, then return to the app and refresh verification.
3. Open a different browser profile for a driver account. Verify it, enter the vehicle details and upload a portrait, licence and permit image.
4. Register an operator account and follow [Local administrator](OPERATIONS.md#local-administrator) to grant its admin claim. Sign out/in and manually review the driver. Creating a driver account does not approve it.
5. The approved driver explicitly enables GPS and goes online. The GPS location must be inside the configured 15 km Keimoes service area. If you are physically elsewhere, use the automated test setup rather than claiming a Keimoes default pin is your live GPS.
6. The passenger chooses a pickup and destination, confirms a cash fare and requests a ride. The driver accepts, marks arrival, starts the trip, collects cash and completes it. The passenger can rate the completed trip.

The web app cannot guarantee location or incoming-request updates when the browser is closed or suspended. Keep the driver page open while online. Manual approval is a human evidence review, not automatic face recognition.

## 9. Check and build

Open a third terminal for commands that finish:

```sh
npm test
npm run build:production
```

To run the Firebase integration suite, first stop the standalone emulator terminal with **Ctrl+C** because the suite starts its own emulator instance:

```sh
npm run test:integration
```

For browser tests, install the test browser once, start the local emulators again, then run:

```sh
npx playwright install chromium
npm run test:e2e
```

The Playwright configuration controls its app server. These test suites are separate from production device testing. A passing build alone does not prove that live email, private image delivery or mobile GPS is configured.

## 10. Publish the production build on Netlify

Follow [GO-LIVE-NETLIFY.md](GO-LIVE-NETLIFY.md) in order. Run **`npm run build:production`**, which forces the real Firebase project even if `.env.local` remains in safe demo mode. Deploy the Firebase backend/rules/indexes separately, then upload the complete production `dist` to a new Netlify project and authorise its hostname in Firebase.

Keep the original Firebase Auth domain and keys. The default live email flow uses Firebase's hosted action handler; the app does not automatically insert a Netlify return URL. Local emulator accounts are separate, and emulator email links never demonstrate real inbox delivery.

Run `npm run check:production -- --site https://YOUR-PROJECT.netlify.app` using the actual address, then test real email and two real devices over HTTPS. [OPERATIONS.md](OPERATIONS.md) explains driver review and service acceptance. [DEPLOYMENT.md](DEPLOYMENT.md) describes the optional Firebase Hosting frontend alternative. No live deployment or real email delivery has been performed for you by these instructions.

## Quick fixes

| What happened | What to do |
| --- | --- |
| Blank page after opening `index.html` | Run `npm run dev` and open its localhost address. |
| Missing import/module | Finish both dependency installations and check the exact filename/folder from the code browser. |
| A pasted file shows Markdown backticks | Remove the surrounding code fences; keep only the file's source. |
| Phone cannot use laptop localhost | Localhost refers to the phone itself. Use the deployed HTTPS address for real-device testing. |
| LAN page blocks sign-in/GPS | Plain LAN HTTP is not a secure context. Publish HTTPS rather than entering real passwords there. |
| Email did not arrive locally | Use the Auth emulator's terminal link; it sends no real mail. |
| Signed-in account has no profile | Complete the profile form; do not create duplicate accounts to repair a partial registration. |
| Original phone login fails | Use the original phone-number format and existing password; do not replace it with a new account. |
| GPS denied or outside Keimoes | Check OS/browser permissions, HTTPS and your real location. A map-selected pin is not a GPS reading. |
| No drivers appear | Approve a real driver, enable in-area GPS and go online. Stale, busy and offline drivers are hidden. |
| Port 5173 or emulator ports occupied | Stop the earlier process with Ctrl+C, then start one instance. |

When you finish, stop both running terminals with **Ctrl+C**. Your edited source stays saved in the folder; local emulator accounts/data are temporary by default.
