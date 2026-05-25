---
name: car-maintenance-app
description: Use when working on the Volkswagen Polo car-maintenance static web app in this repo — building, editing, or extending the GitHub-Pages-hosted, GitHub-API-persisted maintenance tracker. Triggers on changes to index.html, app.js, github-api.js, styles.css, or data/*.json; on questions about the maintenance plan, urgency calculations, sync state, GitHub PAT handling; or on phase-by-phase build work. Encodes the owner's workflow rules, locked decisions, data model, and safety constraints so future sessions stay consistent.
---

# Car maintenance app — working agreement

This skill encodes the rules for building and maintaining this project. Read it fully before editing any file or proposing changes. The user enforces these rules strictly; violating them wastes their time.

## Workflow rules (non-negotiable)

1. **Plan before code.** For any non-trivial change, first summarize architecture, list files to touch, state assumptions, list risks, and ask for confirmation. Do not write or modify code until the user confirms.
2. **Phase-by-phase.** Build in small verifiable phases. After each phase: report what changed, what works, what is pending. Stop and wait for the user to say "continue" before starting the next phase.
3. **Never invent data.** Unknown date, brand, reference, cost, or value → represent as `null` or `""` explicitly. Never fabricate a maintenance record, exact date, brand, or price.
4. **Never fake exact dates.** If only a year or month is known, the record uses `date: null` (or a clearly-marked approximate first-of-month/year date), `dateApproximate: true`, and a human-readable `dateText`. The UI must show approximate dates as approximate.
5. **Never log or commit the GitHub PAT.** Token lives only in `localStorage`. Treat it like a password. Settings must offer a visible "Delete token" action.
6. **Confirm before risky actions** — destructive git, force-push, public publishing of data, anything that could leak the VIN/plate/cost history.

## Project at a glance

- **Static web app** hosted on GitHub Pages, persisting JSON in a GitHub repo via the Contents API. No backend, no database, no build step.
- **Recommended deployment**: public repo for the app, **private** repo for the data. Single-repo setup is also supported via config, but the README must warn that public-repo data exposes VIN/plate/costs.
- **Stack**: vanilla HTML + CSS + ES-module JavaScript. No framework. Alpine/Petite-Vue may only be proposed with strong justification, never assumed.
- **Routing**: hash-only (`#/dashboard`, `#/maintenance/:id`, `#/history`, `#/settings`) because GitHub Pages cannot do server-side routing.
- **Demo car (anonymized seed)**: VW Polo 1.2 TSI EA211, 90 CV, 2014, 5-door manual, Bluemotion. VIN and license plate intentionally empty in the public seed; real values belong only in the user's private data repo. The owner's actual values are NOT stored in this codebase.

## File map

```
index.html                       single-page shell, view container, hash-route targets
styles.css                       CSS variables, dark default + prefers-color-scheme light
app.js                           state, router, calculations, rendering, forms
github-api.js                    GitHub Contents API adapter (no domain logic)
data/mantenimientos.json         car + currentMileage + interventions[] + maintenanceRecords[]
data/plan-mantenimiento.json     14-item maintenance plan (routine/wear/major/repair)
README.md                        setup, PAT creation, Pages activation, privacy warnings (Phase 5)
.claude/skills/car-maintenance-app/SKILL.md   this file
```

Only add helper files (e.g. `calc.js`, `views.js`) if `app.js` grows past ~800 lines, and only after proposing the split and getting approval.

## Data model essentials

- `schemaVersion: 1` on `mantenimientos.json`. Bump only with a migration plan.
- **Intervention** groups multiple records from one workshop visit. Carries `totalCost`. Per-record `cost` stays `null` for items rolled into an intervention — this prevents double-counting in summaries.
- **maintenanceRecord** has `interventionId` (or `null` for standalone). `type` matches a plan-item `id`.
- Plan categories: `routine` (km + months intervals), `wear` (variable), `major` (timing chain etc.), `repair` (no schedule; history only).
- IDs: `crypto.randomUUID()` at runtime. Seed records use fixed UUID-v4-shaped strings for reproducibility.

## Locked-in decisions (do not re-litigate)

The original conversation established these patterns using the owner's real records. The values are now replaced by anonymized demo entries in the public seed, but the **patterns** remain:

| Decision | Pattern |
|---|---|
| Year-only historical record (e.g. timing chain) | `date: null`, `dateApproximate: true`, `dateText: "<year> approximate"` (or `"demo entry — replace me"` in the seed). |
| Approximate-month grouped intervention | `date: "<yyyy-mm-01>"`, `dateApproximate: true`, `dateText: "<Month YYYY>"` on the intervention, mirrored on its records. |
| Per-record cost when an intervention exists | `cost: null` on each record; `totalCost` lives on the intervention so it's counted once. |
| Repo layout | Two-repo recommended (public app + **private** data). Single-repo supported via config with a clear warning. |
| Public app repo MUST NOT contain real car data | `data/mantenimientos.json` in this repo is demo-only. Real VIN, plate, mileage, workshop names and costs live ONLY in the user's private data repo (loaded at runtime via the GitHub Contents API). |
| Private GitHub Pages | Do NOT claim it's generally available on paid plans. Depends on GitHub Enterprise Cloud / org capabilities. Personal users: public app + private data. |
| GitHub PAT | Fine-grained, **Contents: Read and write**, scoped to the private data repo only. |
| Default theme | Dark. Light via `prefers-color-scheme` or user toggle, persisted in localStorage. |
| Currency | EUR throughout. |

## Calculation rules (Phase 2 territory)

- For each plan item, find the latest matching record by `type`.
- No history → "No history — review recommended" (gray/neutral, not red).
- `intervalKm` set → `nextKm = lastRecord.km + intervalKm`, `remainingKm = nextKm - currentMileage.km`.
- `intervalMonths` set AND `lastRecord.date` known AND `dateApproximate === false` → compute `nextDate` and `remainingTime`. If approximate, treat the date-based projection as estimated, never exact.
- km/month average requires ≥ 2 dated mileage points with `dateApproximate === false`. With fewer, leave projection unset, do not guess.
- Both intervals set → due whichever comes first.
- `repair` category → history view only, never marked due/overdue unless user sets an interval.

### Urgency thresholds

| Color | Condition |
|---|---|
| red | overdue OR < 1 000 km remaining OR < 1 month remaining |
| yellow | < 5 000 km remaining OR < 3 months remaining |
| green | > 5 000 km remaining OR > 3 months remaining |
| gray | insufficient data, no schedule, or repair-only |

Dashboard order: most urgent → unknown history → normal scheduled → repair/unscheduled.

## GitHub API rules (Phase 4 territory)

`github-api.js` must contain **zero** car-maintenance logic — it is a generic Contents API adapter.

- Base URL: `https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={branch}`.
- Read → decode Base64 as UTF-8 (use `TextDecoder`, not `atob` + naive split).
- Write → encode JSON as UTF-8 Base64 (use `TextEncoder` then base64). PUT with the last-known `sha`. Response carries the new `sha` — use it, do not re-read.
- Map errors to structured returns (no throws): `unauthorized` (401), `forbidden` (403), `not_found` (404), `conflict` (409), `validation` (422), `network`, `unknown`. Each includes `status` and a human message.
- In-module mutex prevents overlapping writes in the same tab. SHA mismatch on write → surface conflict to user, do **not** silently overwrite.
- Contents API size note in README: ≤ 1 MB fully supported; 1–100 MB limited by media type; > 100 MB unsupported by this endpoint. (Do **not** call it a "1 MB limit".) Our files will stay far below.

## Privacy and security rules

- Never `console.log` the PAT, never include it in error messages or rendered DOM.
- `type="password"` on the token input.
- "Delete token" button always visible in Settings.
- Snapshot every mutation to `localStorage` **before** attempting remote save, so a failed PUT never loses data.
- No third-party scripts. No analytics. No external CDNs (would defeat private-data setup).
- README must warn: localStorage is convenient but not highly secure; XSS or a malicious extension can exfiltrate the token; rotate tokens periodically (fine-grained tokens expire ≤ 1 year).

## Style and code rules

- Plain ES modules. No TypeScript, no bundler, no Node-only APIs at runtime.
- Default to no comments. Only add a comment when the *why* is non-obvious.
- Use `textContent` and `createElement` for any value that originated from user input, JSON data, or GitHub responses. Reserve `innerHTML` for purely-static template fragments.
- Validate imported JSON before replacing in-memory state (schema check + required fields). Reject silently-broken imports with a clear error.
- Accessibility: every input has a `<label>`, buttons have accessible names, focus rings visible, tap targets comfortable on mobile, respects `prefers-color-scheme`.

## Phase plan and where we are

| Phase | Scope | Status |
|---|---|---|
| 0 | Plan, file list, assumptions, risks, confirmation | ✅ complete |
| 1 | Folder + file skeleton, valid seed JSON, minimal HTML/CSS/JS boot | ✅ complete |
| 2 | Local-only: fetch seeds, hash router, dashboard, calc engine, detail view, placeholder history/settings, Docker dev tooling | ✅ complete |
| 3 | Full local UI: detail form + new intervention, history with filters/summary, settings (car/mileage/plan editors), theme toggle, import/export, localStorage persistence, validators, module split | ✅ complete |
| 4 | `github-api.js` real implementation, SHA + Base64 + UTF-8 + conflict + sync state, Docker Compose workflow, token management, auto-load | ✅ complete |
| 5 | README, accessibility (aria-live footer, role=status notices), mobile polish (form-field min-width), empty/error states (empty plan, zero records), inline load/save result notices, search-input focus retention, history filter partial re-render | ✅ complete |

## Post-Phase-5 status — release-ready

- `README.md` is the single source of truth for setup, deployment, security, user guide, and the release checklist. Update it when behaviour changes.
- `docker compose run --rm app npm run check` is the single dev-time quality gate.
- No further phases planned. New work goes in via fresh issues/branches.

## Docker Compose dev workflow (added in Phase 4.0)

```bash
docker compose up                              # serve at http://localhost:8000
docker compose run --rm app npm run check      # JS syntax + JSON parse
docker compose run --rm app sh                 # ad-hoc shell
```

`docker-compose.yml` mounts `./` into `/app` and exposes 8000. The Dockerfile's CMD runs `http-server`; `compose run` overrides this with whatever you append. `node_modules` never lands on the host (http-server is globally installed inside the image).

## Sync state machine (Phase 4)

Steady states (derived in `baseStatus()`):
- `notConfigured` — no owner/repo
- `localOnly` — config saved but no token
- `ready` — config + token, never synced
- `synced` — last load/save succeeded, no local changes since
- `localChangesPending` — `dirty=true`

Transient states (set explicitly by ops):
- `loading`, `saving`, `conflict`, `error`

Any mutation that persists data or plan calls `markDirty()` → flips `dirty=true` and downgrades `synced` → `localChangesPending`. `markClean()` (called after successful load/save) resets `dirty=false` and stamps `lastSyncedAt`. `setConfig` clears SHA cache and `lastSyncedAt` if owner/repo/branch/paths changed.

## localStorage keys (Phase 4 additions)

| Key | Set when |
|---|---|
| `car-maint:token` | only when user clicks **Save token** |
| `car-maint:dirty` | mirrors `state.sync.dirty` (`"1"` / `"0"`) |
| `car-maint:lastSyncedAt` | ISO timestamp after successful load/save |
| `car-maint:sha:<owner>:<repo>:<branch>:<path>` | per-file SHA cache (one key per path) |

`car-maint:token` is **never** written by any other code path. Cleared by **Delete token** in Settings, which also clears all `car-maint:sha:*` entries.

## github-api.js contract (Phase 4)

- `loadJsonFile(config, path)` → `{ok:true, data, sha, path, source:'github'}` or structured error.
- `saveJsonFile(config, path, data, message, {create, sha}?)` → `{ok:true, sha, commitSha}` or error. Serialised through an internal `_saveChain` promise — concurrent calls queue.
- `testConnection(config)` → `{ok:true, checks:[{name,ok,message,missing?}, …]}` or error.
- `getStoredSha`, `setStoredSha`, `clearShaCache` — exported for state-layer use only.
- `__codec.utf8ToBase64` / `__codec.base64ToUtf8` — exported for behavioural tests only.

Token is in `config.token`, used **only** in the `Authorization: Bearer …` header. It is never logged, never put into an error message, never returned in any structured result. The behavioural test asserts this with a sentinel token.

## Security rules (re-stated, now enforced)

- Token persisted only on explicit **Save token** click.
- Token input is `type="password"` with `autocomplete="off"`, `spellcheck="false"`.
- The Settings GitHub block shows "Token saved in this browser" but never displays the value.
- Backup exports include `data` and `plan` JSON only — never the token, never the config.
- Conflict handling never silently overwrites: 409 / sha-mismatch flips to `conflict` state and surfaces three explicit options (reload-and-discard / keep-local-and-force / export-backup).

## Module layout (Phase 3 split)

Native ES modules, no bundler. `app.js` is the boot/router orchestrator only.

```
app.js               boot, hash router, view dispatch, sync-status text
state.js             state object, localStorage persistence, mutators, change hook
validation.js        validateData / validatePlan / crossValidate; strict ISO date check
calculations.js      pure calc engine (find-latest, km/month estimate, urgency, sort, cost summary)
dom.js               el / row / labelledInput / labelledSelect / checkbox / errorBox / noticeBox / pickFile / readFileAsText / downloadJson
views-dashboard.js   car summary + urgency-sorted cards
views-detail.js      plan-item meta + status box + history list + Register-new-record form
views-history.js     chronological list with type/year/category/workshop/search filters + cost summary
views-settings.js    car form, mileage form, theme toggle, plan editor, GitHub placeholder, import/export, reset
github-api.js        still a stub until Phase 4
```

Cross-module rules:
- Views import only from `state`, `dom`, `calculations`, and other view modules.
- Mutators in `state.js` call a `_onChange` hook registered by `app.js`. This avoids circular imports for re-render.
- No module imports from `app.js`.

## localStorage keys (Phase 3)

| Key | Type | Notes |
|---|---|---|
| `car-maint:data` | full mantenimientos object | validated before adoption on boot |
| `car-maint:plan` | full plan array | validated before adoption on boot |
| `car-maint:theme` | `"dark"` \| `"light"` | applied via `data-theme` attribute |
| `car-maint:config` | `{owner,repo,branch,dataPath,planPath}` | non-token fields only |

No PAT is stored yet. The token input in Settings is disabled and labelled "Phase 4". Do not add token persistence outside of `github-api.js`/Phase 4 wiring.

## Dev tooling (added in Phase 2)

- `Dockerfile` + `package.json` + `.dockerignore` exist for local development **only**. They never ship to GitHub Pages. The deployed app is plain static files — no Node, no build step.
- `npm run check` runs `node --check` on both JS files and JSON.parse on both data files.
- `npm run serve` runs `http-server` on port 8000. Same effect as `python3 -m http.server`.
- Container usage: `docker build -t car-maintenance-dev .` then `docker run --rm -p 8000:8000 -v "$PWD":/app car-maintenance-dev` (CMD already runs the server).
- `http-server` is installed **globally** inside the image so bind-mounting `/app` does not hide it. Do not switch to a local-only install without solving that.

When the user says "continue" or "next phase", confirm which phase you are starting and what files you will touch before editing.

## When to refresh this skill

Update this file when:
- A phase completes (move its row to ✅ and record any deviation from the original plan).
- A new locked-in decision is made (add a row to the table; never remove existing rows without the user's explicit go-ahead).
- The data schema changes (`schemaVersion` bump, new fields).
- The user gives feedback that should bind future sessions.

Do not update this file for transient state, in-flight edits, or things derivable from `git log` or current file contents.
