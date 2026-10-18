# Get started with the complete replacement

Use the newest source ZIP in a new empty folder. The updated code browser and Markdown source contain **complete file contents**; replace the whole matching file if copying manually. Preserve the supplied Firebase and CARTO configuration files exactly.

1. **Publish for real passengers and phones:** follow [GO-LIVE-NETLIFY.md](GO-LIVE-NETLIFY.md). It covers Firebase setup/deployment, a new Netlify project, real email, production checks and two-device acceptance.
2. **Create/open every file in VS Code:** follow [VS-CODE-SETUP.md](VS-CODE-SETUP.md). Extracting the full ZIP preserves binary icons and all paths.
3. **Understand the files:** use [FILE-GUIDE.md](FILE-GUIDE.md), `CODE-EXPLORER.html` and `FILES-WITH-CODE.md`.
4. **Run the local demo:** install root/Functions dependencies, copy the complete `.env.example` to `.env.local`, then run `npm run emulators` and `npm run dev` in separate terminals on the development computer.
5. **Build for publication:** use **`npm run build:production`**. It forces live Firebase even when the local environment file says `VITE_USE_EMULATORS=true`.
6. **Operate the service:** follow [OPERATIONS.md](OPERATIONS.md). [VALIDATION.md](VALIDATION.md) records local test evidence and production checks still required.

Local demo accounts are separate from production. The Auth emulator never sends mail, phone localhost refers to the phone, and plain LAN HTTP is blocked for sensitive features. Real phone/email testing uses the published HTTPS app. No production deployment or email delivery is claimed by these instructions.
