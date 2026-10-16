# لوحة المشاهد — context for Claude Code sessions

**Read first in every new session:** this file, then `PROGRESS.md` (where we stopped), then `updates/update-1/UPDATE-1.md` (top authority for Update 1; wins over SPEC where they differ), then `SPEC.md` and `prototype/HANDOFF.md`.

## The user
- A director/cinematographer, **not a programmer**. Talk to him in **simple Arabic**.
- When you need something from him: numbered steps, one at a time.
- **Never ask him to paste a password, token or key into the chat.** Secrets go into the cloud environment settings or are typed by him into a page/terminal himself.
- Don't add features outside SPEC.md — write suggestions at the end of the report instead.
- Don't hide problems: failing tests or unfinished work are reported plainly.
- Ambiguity → choose what is closest to the prototype, log it in PROGRESS.md, continue. Ask only for hard-to-reverse decisions.
- Don't change SPEC §1 decisions or §2 tech choices without asking him and explaining simply.

## Fixed decisions (SPEC §1, as amended by Update 1 §1)
1. Single user now; `owner_id` column on main tables (constant value) for future teams.
2. Login = one password, no email/accounts; the device remembers the session (signed cookie, 1 year).
3. One web app for laptop + mobile; mobile installs as a PWA (manifest + icons, `display: standalone`).
4. Online-first. Exception (U1 ق6): **ideas only** (text + compressed images) queue in IndexedDB on the phone and send when back online; a small service worker caches **only the app shell** (HTML/JS/CSS/fonts/icons, versioned) — **never `/api/*` or any data**. Every other edit needs a connection (offline → clear message + disabled buttons).
5. (U1 ق5) **Mobile = full editor** for projects, scenes, shots, library and ideas. **The free board stays laptop-only** (no moving board items on mobile).
6. Arabic RTL UI, prototype design system (fonts, colours, components), light + dark.
7. Four layers against loss: undo/redo, 30-day trash, project export/import file, daily automatic backup.
8. Out of scope (U1 ق8): multi-user/permissions, client share links, comments, AI, voice notes, copy between projects, moving board items from mobile, connector arrows, full offline work.
9. (U1 ق1) Full control: everything the user creates can be renamed, edited, duplicated where sensible, and deleted to trash with undo — laptop and phone.
10. (U1 ق2) The app opens on **Home** on both devices; logo and the «الرئيسية ‹ project» breadcrumb go back to it.
11. (U1 ق3) **Ideas box replaces the inbox**: global (project/scene optional), idea = text + images + links. `inbox_items` stays in the DB (no drop) but is never written again; old clients' inbox creates are stored as ideas.
12. (U1 ق7) New-version banner when a new deploy is live while the app is open.
13. DB changes are **additive only** (ADD COLUMN / CREATE TABLE / copy). Before any production migration: export prod D1, test the migration on the copy locally, take an R2 backup, verify counts after.

## Architecture (SPEC §2)
- **Cloudflare Workers** (static assets + API) · **D1** (SQLite) · **R2** (images, backups) · **Cron** `0 0 * * *` (03:00 Riyadh).
- Front end: **Vite + React + TypeScript** in `web/`. Server: **Hono** in `worker/`. Shared types/logic in `shared/`.
- Dev runs both through `@cloudflare/vite-plugin` (same workerd runtime + local D1/R2 as `wrangler dev`).
- Per-item API writes (PATCH changed fields only, field-level last-write-wins), optimistic UI, 10 s polling `GET /api/projects/:id/changes?since=`.
- Numbers of scenes/shots are **derived from `position`**, never stored.

## Layout
```
SPEC.md, PROMPT.md          handoff instructions (do not edit)
prototype/                  Claude Design prototype (reference only)
updates/update-1/           Update 1 brief (UPDATE-1.md), mockups (open *.html#theme=…&clean=1), shots
reference/screenshots/      Playwright captures of every prototype state (visual reference)
reference/sb-logic.js       readable copy of the prototype logic (sb-core + sb-view)
assets/equipment-icons.svg  equipment icons keyed by equipment.json `icon`
tools/unpack.py             unpacks prototype/*.html → unpacked/ (gitignored)
web/                        React app (src/, public/ fonts + logos)
worker/                     Hono API (src/), D1 migrations (migrations/), tests (test/)
shared/                     code used by both sides
e2e/                        Playwright end-to-end tests
```

## Commands
```
npm install                 # .npmrc sets legacy-peer-deps (npm arborist bug otherwise)
cp .dev.vars.example .dev.vars   # local secrets for dev (gitignored)
npm run dev                 # applies local migrations, then Vite + Worker on http://localhost:5173
npm run typecheck           # tsc -b (web, worker, node configs)
npm test                    # Vitest inside workerd (worker + shared tests)
npm run test:e2e            # Playwright, laptop 1440×900 + mobile 390×844 (starts its own server)
npm run build               # production build to dist/
npm run types               # regenerate worker/worker-configuration.d.ts after editing wrangler.jsonc
npm run seed                # (dev server running) loads the 4 prototype demo projects; dev password: dev-password
npm run deploy              # build + scripts/deploy.mjs (web files embedded in the Worker; stops at 2.5 MB compressed)
npm run size                # same bundle + size check, no deploy
node scripts/backup-prod.mjs <label>   # production backup to R2 (same format as the nightly one) — before every prod migration
node scripts/check-offline.mjs          # offline start + idea queue against `vite build && vite preview --port 5300` (the SW only runs in builds)
```
- Playwright is pinned to 1.56.1 to match the preinstalled Chromium in /opt/pw-browsers. Do not run `playwright install`.
- To re-shoot the prototype: unpack is not needed; open `prototype/laptop.html#screen=…&theme=…` (states listed in HANDOFF.md / prototype index).

## Server notes
- All writes go through `applyOps` (worker/src/ops.ts): ops grouped into few `json_each` statements, one D1 batch (= transaction).
- Free plan: ≤ 50 D1 queries per invocation — keep handlers within that (snapshot ≈ 17, daily cron ≈ 40).
- D1 rejects compound SELECTs with many UNION terms — use NOT EXISTS.
- Tests: `worker/test/setup.ts` wipes D1 + R2 before each test. E2E uses its own state dir `.wrangler/e2e` (wiped per run).
- Trashable entities: projects, scenes, shots, notes, characters, locations, moodboards. Others tombstone (deleted_at) and are hard-deleted after 30 days.
- Production: https://lawhat-almashahed.mstrstyf80.workers.dev. Deploy from the cloud session with `CLOUDFLARE_API_TOKEN=proxy-injected NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt npm run deploy` (the proxy injects the real token; it also breaks wrangler's static-asset upload, hence the embedded files — PROGRESS decision 28). If the size gate trips: move to GitHub + Workers Builds.
- New font weight in the UI → add its @font-face in web/src/styles/fonts.css and the file in web/public/fonts (only used weights ship).
- Never use `pkill -f <pattern>` inside a Bash command containing the same pattern: it kills the shell itself.

## Workflow
After each phase: run tests → commit → update PROGRESS.md → send the user a 2-line Arabic summary + what he can try.
Branch: work on `claude/pensive-feynman-nwosmr` (this is the deployed code). After each deployed phase, fast-forward the default branch `claude/viewfinder-app-build-7du511` to it so new sessions start from the right code.
