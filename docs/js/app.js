// Boot, hash router, view dispatch. All the heavy lifting lives in the
// other modules: state, validation, calculations, dom, views-*.

import {
  applySeeds,
  applyTheme,
  canAutoLoad,
  loadFromGitHub,
  loadPreferences,
  refreshSyncStatus,
  setChangeHook,
  state,
  toggleTheme,
} from "./core/state.js";
import { renderDashboard } from "./ui/views-dashboard.js";
import { renderDetail } from "./ui/views-detail.js";
import { renderHistory } from "./ui/views-history.js";
import { renderSettings } from "./ui/views-settings.js";
import { clearView, el } from "./ui/dom.js";

const DATA_PATH = "./data/mantenimientos.json";
const PLAN_PATH = "./data/plan-mantenimiento.json";

function parseRoute(hash) {
  const path = (hash || "").replace(/^#\/?/, "");
  if (!path || path === "dashboard") return { name: "dashboard" };
  if (path === "history") return { name: "history" };
  if (path === "settings") return { name: "settings" };
  const m = path.match(/^maintenance\/(.+)$/);
  if (m) return { name: "detail", params: { id: decodeURIComponent(m[1]) } };
  return { name: "not-found", params: { path } };
}

function updateNavActive(route) {
  document.querySelectorAll(".app-nav a").forEach((a) => {
    const target = a.getAttribute("href") || "";
    const matches =
      (route.name === "dashboard" && target === "#/dashboard") ||
      (route.name === "history" && target === "#/history") ||
      (route.name === "settings" && target === "#/settings");
    if (matches) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

function updateThemeToggleLabel() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  // Label shows the theme you'd switch to.
  btn.textContent = state.theme === "dark" ? "Light theme" : "Dark theme";
  btn.setAttribute("aria-label", `Switch to ${state.theme === "dark" ? "light" : "dark"} theme`);
}

const SYNC_FOOTER = {
  notConfigured: { text: "Local only — GitHub not configured", state: "idle" },
  localOnly: { text: "GitHub configured — token required", state: "idle" },
  ready: { text: "GitHub configured — not loaded yet", state: "idle" },
  loading: { text: "Loading from GitHub…", state: "loading" },
  saving: { text: "Saving to GitHub…", state: "saving" },
  synced: { text: "Synced with GitHub", state: "synced" },
  localChangesPending: { text: "Local changes pending — save to GitHub", state: "local" },
  conflict: { text: "Conflict — remote file changed", state: "error" },
  error: { text: "GitHub error", state: "error" },
};

function updateSyncStatus() {
  const node = document.getElementById("sync-status");
  if (!node) return;
  const entry = SYNC_FOOTER[state.sync.status] || SYNC_FOOTER.notConfigured;
  let text = entry.text;
  if (state.sync.status === "error" && state.sync.lastError && state.sync.lastError.message) {
    text = `GitHub error: ${state.sync.lastError.message}`;
  }
  node.textContent = text;
  node.setAttribute("data-state", entry.state);
}

function renderLoading() {
  const view = clearView();
  view.appendChild(el("p", { class: "boot-message", text: "Loading…" }));
}

function renderLoadError() {
  const view = clearView();
  view.appendChild(el("h2", { text: "Could not load local data" }));
  view.appendChild(
    el("p", {
      text:
        state.loadError ||
        "Unknown error reading data/mantenimientos.json or data/plan-mantenimiento.json.",
    })
  );
  view.appendChild(
    el("p", {
      class: "muted",
      text:
        "Serve the project with: python3 -m http.server (or npm run serve in the Docker dev image), then open http://localhost:8000",
    })
  );
}

function renderNotFound(path) {
  const view = clearView();
  view.appendChild(el("h2", { text: "Route not found" }));
  view.appendChild(
    el("p", {
      text: `No view for "${path || ""}". Use the navigation above.`,
    })
  );
}

function dispatch(route) {
  switch (route.name) {
    case "dashboard":
      return renderDashboard();
    case "detail":
      return renderDetail(route.params.id);
    case "history":
      return renderHistory();
    case "settings":
      return renderSettings();
    default:
      return renderNotFound(route.params?.path);
  }
}

function handleRoute() {
  if (!location.hash || location.hash === "#") {
    history.replaceState(null, "", "#/dashboard");
  }
  const route = parseRoute(location.hash);
  updateNavActive(route);
  updateThemeToggleLabel();
  updateSyncStatus();
  if (state.loadError) return renderLoadError();
  if (!state.data || !state.plan) return renderLoading();
  dispatch(route);
}

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}: HTTP ${res.status}`);
  return res.json();
}

function wireThemeToggle() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  btn.addEventListener("click", () => toggleTheme());
}

async function boot() {
  loadPreferences();
  applyTheme();
  wireThemeToggle();
  window.addEventListener("hashchange", handleRoute);
  setChangeHook(handleRoute);

  try {
    const [seedData, seedPlan] = await Promise.all([
      fetchJson(DATA_PATH),
      fetchJson(PLAN_PATH),
    ]);
    applySeeds(seedData, seedPlan);
  } catch (err) {
    state.loadError = err && err.message ? err.message : String(err);
  }
  refreshSyncStatus();
  handleRoute();

  // Auto-load from GitHub only when: config + token are present and there
  // are no unsynced local changes. This must never silently overwrite local
  // work; see the dirty flag handling in state.js.
  if (!state.loadError && canAutoLoad()) {
    // Fire-and-forget — handleRoute will re-render via the change hook.
    loadFromGitHub();
  }
}

boot();
