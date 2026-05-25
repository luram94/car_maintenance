# Car Maintenance

A static, single-page web app for tracking maintenance on one personal car.
Runs entirely in the browser — **no backend, no framework, no build step**.
Data is stored as JSON files in a GitHub repository you control, written and
read through the GitHub Contents API with a personal access token kept only
in your browser's localStorage.

The seed data ships as a **demo** for a Volkswagen Polo 1.2 TSI EA211, 90 CV,
2014, with **no VIN, no plate, no real mileage, workshop or cost**. Every
field is editable in Settings — adapting to your own car is a few minutes'
work.

> ⚠️ **Do not publish real car data in the public app repository.**
> The two JSON files under `data/` in this repo are anonymized demo content.
> Your real VIN, license plate, mileage history, workshop names, and costs
> belong **only** in a separate **private** data repository, loaded at
> runtime through the GitHub Contents API. See [GitHub setup
> guide](#github-setup-guide).

---

## Contents

- [What it does](#what-it-does)
- [Screens at a glance](#screens-at-a-glance)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Local development](#local-development)
- [GitHub setup guide](#github-setup-guide)
- [Security and privacy](#security-and-privacy)
- [User guide](#user-guide)
- [Release checklist](#release-checklist)
- [Future improvements](#future-improvements)

---

## What it does

- Tracks every maintenance event for one car: oil changes, filters, brake
  fluid, spark plugs, timing chain, ad-hoc workshop visits, repairs.
- Groups related records into a single **intervention** (one workshop visit,
  one total cost). Each individual record (e.g. spark plugs, throttle body,
  ignition coils) keeps its own history without double-counting the cost.
- Computes when each maintenance item is next due, in both km and months,
  and sorts the dashboard so the most urgent items are at the top.
- Stores edits locally in `localStorage`. Optionally syncs the two JSON
  files (`mantenimientos.json` and `plan-mantenimiento.json`) to a GitHub
  repository of your choice via the Contents API.
- Distinguishes **exact** from **approximate** dates everywhere — an
  approximate record is never displayed as if it were exact.

## Screens at a glance

### Dashboard (`#/dashboard`)

```
┌────────────────────────────────────────────────┐
│ Volkswagen Polo 1.2 TSI · 2014                 │
│ EA211 · 90 CV · 5-door manual · Bluemotion     │
│ 100 000 km    updated 2024-06-15    [Update]   │
├────────────────────────────────────────────────┤
│ MAINTENANCE                                    │
│ ┌────────────────────────────────────────────┐ │
│ │ Spark plugs                 [ROUTINE]      │ │
│ │ Last service: 100 000 km · June 2024 (demo)│ │
│ │ Next:        160 000 km                    │ │
│ │ [#####...........]  60 000 km remaining    │ │
│ └────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────┐ │
│ │ Engine oil + oil filter      [ROUTINE]     │ │
│ │ No history — review recommended.           │ │
│ └────────────────────────────────────────────┘ │
│ ...                                            │
└────────────────────────────────────────────────┘
 Local only — GitHub not configured
```

> The values above (100 000 km, June 2024, "Demo Workshop") come from the
> anonymized seed in `data/mantenimientos.json`. Once you configure a
> private data repo and click **Load from GitHub**, the UI shows your real
> values without ever committing them to this codebase.

Cards are sorted **red → yellow → unknown history → green → repair**, with
ties broken by km/months remaining (ascending).

### Maintenance detail (`#/maintenance/:id`)

Plan-item metadata, a status box, the full chronological history for that
type, and the **Register new maintenance record** form (including a
sub-form to attach the record to a brand-new intervention).

### History (`#/history`)

A chronological table of every maintenance record with filters by **type /
year / category / workshop** and a free-text search. A cost summary at the
top counts each intervention's `totalCost` once plus all standalone
records' costs.

### Settings (`#/settings`)

- **Car details** form
- **Current mileage** form
- **Theme**: dark (default) or light, persisted
- **Maintenance plan editor**: edit / delete / add items, with a warning if
  records exist for a deleted type
- **GitHub sync**: configure repo, save/delete a PAT, test the connection,
  load from / save to GitHub, create remote files from local
- **Backup**: export both JSONs, import either (with strict validation)
- **Reset**: discard local changes and reload the bundled seed

### GitHub sync

A small state machine surfaces what is going on:

| Status                | Footer text                                      |
|---|---|
| notConfigured         | Local only — GitHub not configured              |
| localOnly             | GitHub configured — token required              |
| ready                 | GitHub configured — not loaded yet              |
| loading               | Loading from GitHub…                            |
| saving                | Saving to GitHub…                               |
| synced                | Synced with GitHub                              |
| localChangesPending   | Local changes pending — save to GitHub          |
| conflict              | Conflict — remote file changed                  |
| error                 | GitHub error: …                                 |

### Import / export backup

Export at any time to keep a local copy of your data. Import to restore or
to move between browsers. Imports are validated — invalid files surface a
clear error and **do not replace** local state.

---

## Architecture

- Plain **HTML + CSS + ES modules**. No bundler, no transpiler, no
  framework.
- Hash routing (`#/dashboard`, `#/maintenance/:id`, `#/history`,
  `#/settings`) — works under GitHub Pages without server rewrites.
- Persistence: bundled JSON seeds → `localStorage` overrides → optional
  GitHub Contents API sync. Every mutation snapshots to `localStorage`
  before any network call, so a failed remote write can never lose data.
- Each module loads natively as a `<script type="module">` import. The
  browser walks the relative imports for you.
- **Docker Compose is the recommended dev workflow.** The deployed site
  uses none of it.

---

## Repository layout

```
.
├── index.html                  single-page shell
├── styles.css                  CSS variables + components, mobile-first
├── app.js                      boot, hash router, view dispatch
├── state.js                    state, localStorage, mutators, sync state machine
├── validation.js               data/plan validators, strict ISO date check
├── calculations.js             maintenance engine (next due, urgency, cost summary)
├── dom.js                      safe DOM helpers (el/row/labelledInput/etc.)
├── views-dashboard.js          dashboard view
├── views-detail.js             detail view + Register-new-record form
├── views-history.js            history view, filters, cost summary
├── views-settings.js           settings, plan editor, GitHub sync, import/export, reset
├── github-api.js               GitHub Contents API adapter (no domain logic)
│
├── data/
│   ├── mantenimientos.json     seed: car + currentMileage + interventions + records
│   └── plan-mantenimiento.json seed: maintenance plan items
│
├── docker-compose.yml          dev only — serves the static site
├── Dockerfile                  dev only — Node + http-server
├── package.json                dev only — check + serve scripts
├── .dockerignore               dev only
├── README.md                   you are here
│
└── .claude/skills/car-maintenance-app/SKILL.md   project context for Claude
```

Everything outside `data/`, `*.html`, `*.css`, and `*.js` is dev tooling
and **never deployed**.

---

## Local development

Docker Compose is the recommended workflow. You need only Docker installed
on the host — no Node, no npm, no `node_modules`.

```bash
# Build (first time only) and serve at http://localhost:8000
docker compose up

# Quality checks: JS syntax + JSON parse
docker compose run --rm app npm run check

# Ad-hoc shell inside the dev container
docker compose run --rm app sh
```

The container mounts `./` into `/app`, so edits on the host are picked up
by the next page refresh. The deployed GitHub Pages site never sees the
container or `package.json`.

### Fallback: anything that serves static files

If Docker is not available, any local static-file server works — the app
has no runtime dependencies. The only constraint is that the page must
load over HTTP, not `file://`, because it uses `fetch()` to load the JSON
seeds.

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Docker Compose is still the preferred path because it reproduces the same
environment used by `npm run check`.

---

## GitHub setup guide

### Recommended layout: two repositories

| Repository        | Visibility | Holds                                                                                          |
|---|---|---|
| `car-maintenance` | **public** | the app (this codebase) — **demo seed only**, no real car data, served by GitHub Pages         |
| `car-data`        | **private** | your real `mantenimientos.json` and `plan-mantenimiento.json`                                  |

This is the recommended setup for personal use because:

- The app itself is harmless to share publicly.
- The data file contains the **VIN**, **license plate**, **workshop
  names**, **mileage history**, and **cost history** — personal data you
  probably do not want indexed by search engines.
- The app reads/writes the data repo through a fine-grained PAT scoped to
  that single repo. The PAT lives only in your browser's localStorage.
- The `data/` files in **this** repo are intentionally anonymized so the
  app can render its UI on first load without exposing anyone's car. The
  demo will be replaced in-memory by your real data on first **Load from
  GitHub**.

Single-repo layouts also work — set `dataPath` and `planPath` to point
inside the same repo. **Be careful**: if that repo is public, all your
maintenance data is publicly readable.

> **Note**: Private GitHub Pages is **not** generally available to all
> users. It depends on having a GitHub Enterprise Cloud / organisation
> plan with the relevant settings. For personal accounts, plan around the
> two-repo split rather than relying on private Pages.

### What your real data should look like (for the PRIVATE repo)

The two files committed in `data/` here are demo. In your **private**
data repo, the same files contain the real values. For example,
`data/mantenimientos.json` in the private repo might look like:

```jsonc
{
  "schemaVersion": 1,
  "updatedAt": "2026-05-21T00:00:00.000Z",
  "car": {
    "make": "Volkswagen",
    "model": "Polo 1.2 TSI",
    "engine": "EA211",
    "year": 2014,
    "powerCv": 90,
    "body": "5-door manual",
    "version": "Bluemotion",
    "licensePlate": "<your plate>",       // e.g. "1234 ABC"
    "vin": "<your VIN>"                   // 17 alphanumerics
  },
  "currentMileage": {
    "km": 0,                              // your current km
    "updatedAt": "2024-01-01"
  },
  "interventions": [
    {
      "id": "<crypto.randomUUID()>",
      "date": "2024-01-01",
      "dateApproximate": true,
      "dateText": "<e.g. January 2024 approximate>",
      "km": 0,
      "workshop": "<your workshop name>",
      "totalCost": 0,
      "currency": "EUR",
      "notes": "<description of the visit>"
    }
  ],
  "maintenanceRecords": [
    // ... your real records, linked to interventions via interventionId ...
  ]
}
```

The `<...>` and zero values above are placeholders so this README does
not impersonate a real car. The actual numbers, plate, VIN, workshop,
and notes are filled in by you, in your **private** data repo, via the
Settings forms.

Easiest way to get there: open the app at least once, edit Settings →
Car details / Current mileage with your real values, register your
historical maintenance records, click **Export data JSON** to get a
complete file, and commit that file to your private data repo. From then
on, **Save to GitHub** writes to the same path.

**Do not** commit a file like the above into this (public) app repo.
That is what the warning at the top of this README is about.

### Step by step

**A. Create or fork the app repo.**
Push this codebase (or a fork) to a new repo, e.g.
`github.com/<you>/car-maintenance`. Keep it public. **Before pushing**:
confirm `data/mantenimientos.json` and `data/plan-mantenimiento.json`
contain only the demo content (no VIN, no plate, no real workshop, no
real costs). See the [Release checklist](#release-checklist) for the
exact grep commands.

**B. Enable GitHub Pages.**
Settings → Pages → Source: `Deploy from a branch` → Branch: `main` /
`(root)`. After Pages publishes, visit `https://<you>.github.io/car-maintenance/`.

**C. Create a private data repo.**
Create `github.com/<you>/car-data` (or any name) as **private**. Leave it
empty for now; the app will create the two JSON files on first sync
(step I). This repo is where your real VIN, plate, mileage, workshop and
cost history will live — never the public app repo.

**D. Create a fine-grained personal access token.**

- GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens → **Generate new token**.
- **Token name**: something obvious, e.g. `car-maintenance-data`.
- **Expiration**: required by GitHub. Pick a date you can rotate (1 month / 3 months / 1 year). The app will surface a clear `unauthorized` error when the token expires.
- **Resource owner**: your account.
- **Repository access**: **Only select repositories** → pick **only** the
  private data repo.
- **Repository permissions**: **Contents → Read and write**. Leave
  everything else as "No access".
- Click **Generate token** and copy the value (starts with
  `github_pat_…`). **You will not see it again** — paste it into the app
  next.

**E. Open the deployed app** at `https://<you>.github.io/car-maintenance/`.

**F. Settings → GitHub sync** — fill in:
- Owner: `<you>`
- Repository: `car-data`
- Branch: `main`
- Data path: `data/mantenimientos.json`
- Plan path: `data/plan-mantenimiento.json`

Click **Save config (no token)**.

**G. Paste the PAT into the token field** and click **Save token**. The
field clears and the block reads "Token saved in this browser."

**H. Click Test connection.** Expected result:
- OK — repo: Repository `<you>/car-data` reachable.
- OK — branch: Branch "main" reachable.
- FAIL — data: data file missing at `data/mantenimientos.json` (can be created from local)
- FAIL — plan: plan file missing at `data/plan-mantenimiento.json` (can be created from local)

**I. If the files are missing, click Create remote files from local.**
This PUTs the current in-memory data (the **demo** if you have not yet
edited anything) to your **private** repo as the first version. Footer
flips `saving → synced`. Visit the private data repo on github.com — you
should see two commits, "Update car maintenance data" and "Update
maintenance plan", containing the demo skeleton.

Now go to Settings → Car details / Current mileage / detail views and
**enter your real values**. Each edit flips the footer to "Local changes
pending — save to GitHub". Click **Save to GitHub** when ready. Your
real data lands in the **private** repo, never in the public app repo.

**J. Daily use.** Make local edits → footer flips to "Local changes
pending — save to GitHub". Click **Save to GitHub** when you want to
push them. On another device (after configuring the same repo and PAT),
click **Load from GitHub** to pull.

---

## Security and privacy

This is a static app with no backend. Everything sensitive lives in two
places: the GitHub data repo, and the browser running the app.

### What the app does

- The PAT is stored in `localStorage` **only after you click Save token**.
  No code path persists it otherwise.
- The PAT is used only as `Authorization: Bearer …` against
  `https://api.github.com`. It is **never** logged, rendered, included in
  error messages, included in JSON exports, or sent anywhere else.
- The token input is `type="password"` with `autocomplete="off"`.
- Settings shows "Token saved in this browser." but never displays the
  value itself.
- A **Delete token** button removes the token from `localStorage` and
  clears all SHA caches.
- No third-party scripts, no analytics, no CDNs.
- JSON exports contain `data` and `plan` only — never the token, never
  the config.

### What `localStorage` does not protect against

- **Browser extensions** with access to this origin can read
  `localStorage`. Audit your extensions before pasting a PAT.
- **Shared devices** — anyone using the same browser profile can use the
  saved token. Use Delete token before stepping away.
- **XSS** in the app would expose the token. The code uses
  `textContent` / `createElement` everywhere for dynamic values; there
  are no `innerHTML` writes of untrusted data. The check pipeline grep
  enforces this.
- **No encryption at rest.** Pure browsers cannot meaningfully encrypt a
  client-side secret without a user passphrase, and the threat model
  here does not justify the friction. Rotate the PAT regularly instead.

### Recommendations

- Use a **fine-grained PAT scoped to a single private repo** with
  **Contents: Read and write**. Avoid classic tokens with broad scopes.
- Use the recommended **two-repo split** (public app, private data).
- Set the PAT to expire — at most one year. Rotate it on schedule.
- Click **Delete token** on machines that are not yours and before
  uninstalling.
- Treat the GitHub data repo as sensitive: it contains your VIN, plate,
  workshop names, mileage, and cost history.

---

## User guide

### Updating current mileage

Dashboard → **Update** button (top right of the car block) → Settings →
**Current mileage** section. Enter a new km value and the date it was
read. Save.

### Adding a maintenance record

Dashboard → click any maintenance card → **Register new record** form at
the bottom of the detail view.

Required (any one of): a date, a km, or a date-text. Everything else is
optional. Empty fields are stored as `null` / `""` — never invented.

### Adding a grouped intervention

In the **Register new record** form, scroll to **Intervention** and pick
**Create a new intervention**. Fill the intervention fields (same date /
km / workshop / total cost / etc.). The record you just filled out at
the top becomes one of the records attached to that intervention.

For subsequent records belonging to the same workshop visit, currently
the easiest path is: pick the same date/km/workshop and leave the
intervention as **Standalone** (so the cost is not double-counted).
A first-class "attach to existing intervention" UI is in the
[Future improvements](#future-improvements) list.

### Approximate dates

If you only know "May 2026" but not the exact day, check **Date is
approximate** and set Date-text to `"May 2026 approximate"`. The UI
will display the human text and mark anything computed from this date
(e.g. next-due date) with a leading `≈`. Never invent an exact date for
a record that is genuinely approximate.

### Urgency colors

| Color   | Meaning                                                                    |
|---|---|
| red     | Overdue, **or** less than 1 000 km remaining, **or** less than 1 month     |
| yellow  | Less than 5 000 km remaining **or** less than 3 months                     |
| green   | More than 5 000 km remaining **and** more than 3 months                    |
| neutral | No history, no schedule, or a repair-only item — review recommended        |

Color is never the only signal: each card also has explicit text
("60 000 km remaining", "No history — review recommended", "Repair item
— tracked, not scheduled").

### History filters

History → top of the page. Filter by **type / year / category /
workshop** and a free-text search across brand / reference / workshop /
notes / type. Filters compose. **Clear filters** resets all of them.

### Editing the maintenance plan

Settings → **Maintenance plan**. Each item is editable inline (Edit /
Save / Cancel). **Delete** asks for confirmation and warns if any
records reference that type — records are kept and shown with a "type
not in plan" warning until you re-add the item or reclassify the
records. **Add plan item** at the bottom takes id, name, intervals,
category, notes.

### Export / import / reset

Settings → **Backup**.

- **Export data JSON** / **Export plan JSON** — download `mantenimientos.json` and `plan-mantenimiento.json`.
- **Import data JSON** / **Import plan JSON** — pick a file, parsed and
  validated. Errors are shown in a red notice and **local state is not
  replaced**.
- **Reset → Reset maintenance data / Reset plan / Reset everything** —
  discard local edits and reload the bundled seed.

### Load from GitHub

Settings → GitHub sync → **Load from GitHub**. Fetches both files,
validates them, replaces in-memory state, persists to localStorage,
updates SHAs, and flips the status to `synced`. If you have unsaved
local changes, the action confirms before overwriting.

### Save to GitHub

Settings → GitHub sync → **Save to GitHub**. Validates local data and
plan, then PUTs each file with its latest SHA. On full success, the
status flips to `synced`. Saves are serialised — concurrent calls
queue rather than overlap.

### Resolve conflicts

When GitHub returns 409 (or a 422 referencing SHA), status flips to
`conflict` and three explicit actions appear in Settings → GitHub sync:

1. **Reload remote & discard local changes** — replaces local with the
   current remote. Confirms first.
2. **Keep local — refresh SHA and retry** — re-fetches just to update
   the SHA cache, then saves local-over-remote. Confirms first.
3. **Export local backup** — downloads both JSONs as a safety net before
   you decide.

The app never automatically resolves a conflict.

---

## Release checklist

Before publishing a new version of the app, run through this list:

- [ ] `docker compose run --rm app npm run check` — JS + JSON pass.
- [ ] `docker compose up` — opens at <http://localhost:8000>, no console errors.
- [ ] Dashboard renders all 14 seed plan items, urgency order correct.
- [ ] Add a record from any detail view → appears in detail history and
      global history.
- [ ] Add a grouped intervention from the form → appears in history with
      the totalCost counted once.
- [ ] Edit a plan item → dashboard reflects new intervals.
- [ ] Delete a plan item that has records → confirms with a warning,
      records remain with "type not in plan" notice.
- [ ] Export data + plan → re-import same file → "Imported successfully".
- [ ] Import an obviously bad file → red notice listing errors, state
      not replaced.
- [ ] Reset data / plan / everything → bundled seed restored.
- [ ] Theme toggle (header) → persists across reload.
- [ ] GitHub sync (against a real private data repo):
  - [ ] Save config (no token), Save token, Test connection (all green
        once files exist).
  - [ ] If files missing, Create remote files from local → 2 commits on
        github.com.
  - [ ] Local edit → "Local changes pending" → Save to GitHub → "Synced".
  - [ ] Load from GitHub on a second device replaces local with remote.
  - [ ] Force a conflict (edit on two devices) → conflict UI appears,
        the three options behave as described above.
- [ ] Delete token → token + all SHA caches removed.
- [ ] **Privacy sweep before push to public app repo** — all of these
      should return nothing (or only the demo placeholders):

      ```bash
      grep -rn 'github_pat_' .                     # no PAT in repo
      grep -rn 'WVWZZZ' data/                      # no real VIN prefix
      grep -rn -iE '"vin": "[A-Z0-9]{10,}"' data/  # no real VIN string
      grep -rn -iE '"licensePlate": "[A-Z0-9]+"' data/  # no real plate
      grep -rn -E '"workshop": "(?!Demo Workshop")' data/  # no real workshop
      grep -rn -E '"totalCost": [0-9]+' data/      # no real costs
      grep -rn -E '"km": [0-9]+' data/             # all km values are round demo numbers
      ```

      The only matches in `data/` should be demo values (empty VIN/plate,
      "Demo Workshop", `totalCost: null`, round km).

- [ ] App repo is **public** but contains only demo seed.
- [ ] Data repo is **private** (or you have explicitly accepted the
      public tradeoff in a single-repo setup).
- [ ] App repo's GitHub Pages is enabled and serving the latest commit.

---

## Future improvements

These are not implemented. They are worth documenting so future work has
a backlog.

- **Service worker / offline mode.** Cache the shell and JSONs so the
  app keeps working without network. Would need careful interaction with
  the GitHub sync flow.
- **Background reminders / notifications.** Surface "spark plugs overdue"
  proactively via Web Notifications or by sending mail to yourself.
- **CSV export.** Useful for spreadsheet analysis or for tax / warranty
  paperwork.
- **Richer charts.** A cost-over-time chart, km-per-month sparkline,
  cost per category.
- **Multi-car support.** Switch between several cars stored under
  separate paths in the same data repo.
- **Attach a record to an existing intervention.** Currently the form
  only supports "standalone" or "create new intervention".
- **Smarter merge / conflict UI.** Side-by-side diff and per-field
  picker instead of the all-or-nothing reload/force-save options.
- **Automated UI tests** with Playwright (real browser) or Vitest
  (modules in isolation). The current `npm run check` covers syntax and
  validators only.
- **Encrypted local token storage.** A pure static app cannot
  meaningfully encrypt a secret without a user passphrase. If a
  passphrase prompt on app open is acceptable, this becomes feasible.
- **Versioned data schema with migrations.** `schemaVersion` is checked
  but there is no migration framework yet.

---

## License

This project's code is unlicensed by default — treat it as "all rights
reserved" and adapt at will for your own personal use. If you fork it
publicly, consider adding an explicit licence.
