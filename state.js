// Application state + localStorage persistence + mutators.
// Pure persistence — no DOM rendering. Mutators call a change hook so the
// router can re-render. No GitHub token is stored here (Phase 4).

import { validateData, validatePlan, crossValidate } from "./validation.js";
import {
  clearShaCache,
  loadJsonFile,
  saveJsonFile,
  testConnection,
} from "./github-api.js";

const KEYS = {
  data: "car-maint:data",
  plan: "car-maint:plan",
  theme: "car-maint:theme",
  config: "car-maint:config",
  token: "car-maint:token",
  dirty: "car-maint:dirty",
  lastSyncedAt: "car-maint:lastSyncedAt",
};

const DEFAULT_CONFIG = {
  owner: "",
  repo: "",
  branch: "main",
  dataPath: "data/mantenimientos.json",
  planPath: "data/plan-mantenimiento.json",
};

export const state = {
  data: null,
  plan: null,
  seedData: null,
  seedPlan: null,
  theme: "dark",
  config: { ...DEFAULT_CONFIG },
  loadError: null,
  usingStoredData: false,
  usingStoredPlan: false,
  token: null,
  sync: {
    status: "notConfigured", // see baseStatus()
    lastError: null,
    lastSyncedAt: null,
    dirty: false,
  },
  lastTestResult: null, // { ok, checks?, code?, message? } or null
  lastSyncResult: null, // { kind: 'load'|'save'|'create', ok, ...details } or null
};

let _onChange = () => {};

export function setChangeHook(fn) {
  _onChange = typeof fn === "function" ? fn : () => {};
}

function notify() {
  try {
    _onChange();
  } catch (e) {
    console.error("rerender hook failed:", e);
  }
}

function readJson(key) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? null : JSON.parse(v);
  } catch {
    return null;
  }
}

function writeJson(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
    return true;
  } catch (e) {
    console.warn(`localStorage write failed for ${key}:`, e);
    return false;
  }
}

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

export function loadPreferences() {
  const t = localStorage.getItem(KEYS.theme);
  if (t === "dark" || t === "light") state.theme = t;

  const cfg = readJson(KEYS.config);
  if (cfg && typeof cfg === "object" && !Array.isArray(cfg)) {
    state.config = { ...DEFAULT_CONFIG, ...cfg };
  }

  try {
    const tk = localStorage.getItem(KEYS.token);
    if (typeof tk === "string" && tk.length > 0) state.token = tk;
  } catch {
    /* ignore */
  }
  state.sync.dirty = localStorage.getItem(KEYS.dirty) === "1";
  const ts = localStorage.getItem(KEYS.lastSyncedAt);
  state.sync.lastSyncedAt = ts || null;
  refreshSyncStatus();
}

// Called after seeds are fetched. If valid localStorage copies exist, use
// them; otherwise initialise from the bundled seeds.
export function applySeeds(seedData, seedPlan) {
  state.seedData = clone(seedData);
  state.seedPlan = clone(seedPlan);

  const storedData = readJson(KEYS.data);
  if (storedData) {
    const r = validateData(storedData);
    if (r.ok) {
      state.data = storedData;
      state.usingStoredData = true;
    } else {
      console.warn("Stored data invalid, using seeds:", r.errors);
      state.data = clone(seedData);
    }
  } else {
    state.data = clone(seedData);
  }

  const storedPlan = readJson(KEYS.plan);
  if (storedPlan) {
    const r = validatePlan(storedPlan);
    if (r.ok) {
      state.plan = storedPlan;
      state.usingStoredPlan = true;
    } else {
      console.warn("Stored plan invalid, using seeds:", r.errors);
      state.plan = clone(seedPlan);
    }
  } else {
    state.plan = clone(seedPlan);
  }
}

export function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme);
}

export function setTheme(t) {
  if (t !== "dark" && t !== "light") return;
  state.theme = t;
  localStorage.setItem(KEYS.theme, t);
  applyTheme();
  notify();
}

export function toggleTheme() {
  setTheme(state.theme === "dark" ? "light" : "dark");
}

export function setConfig(patch) {
  const before = { ...state.config };
  state.config = { ...state.config, ...patch };
  writeJson(KEYS.config, state.config);
  // If the sync target changed (owner/repo/branch/paths), our cached SHAs
  // and "lastSyncedAt" no longer apply to the new target.
  const targetChanged =
    before.owner !== state.config.owner ||
    before.repo !== state.config.repo ||
    before.branch !== state.config.branch ||
    before.dataPath !== state.config.dataPath ||
    before.planPath !== state.config.planPath;
  if (targetChanged) {
    clearShaCache();
    state.sync.lastSyncedAt = null;
    try {
      localStorage.removeItem(KEYS.lastSyncedAt);
    } catch {
      /* ignore */
    }
    if (!TRANSIENT.has(state.sync.status)) refreshSyncStatus();
  } else {
    refreshSyncStatus();
  }
  notify();
}

function touchAndPersistData() {
  state.data.updatedAt = new Date().toISOString();
  writeJson(KEYS.data, state.data);
  state.usingStoredData = true;
  markDirty();
}

export function persistDataAndNotify() {
  touchAndPersistData();
  notify();
}

export function persistPlanAndNotify() {
  writeJson(KEYS.plan, state.plan);
  state.usingStoredPlan = true;
  markDirty();
  notify();
}

export function updateCar(patch) {
  Object.assign(state.data.car, patch);
  persistDataAndNotify();
}

export function updateMileage(km, updatedAt) {
  state.data.currentMileage.km = km;
  if (updatedAt) state.data.currentMileage.updatedAt = updatedAt;
  persistDataAndNotify();
}

export function addRecord(record, newIntervention) {
  if (newIntervention) {
    state.data.interventions.push(newIntervention);
    record.interventionId = newIntervention.id;
  }
  state.data.maintenanceRecords.push(record);
  persistDataAndNotify();
}

export function addPlanItem(item) {
  if (state.plan.some((p) => p.id === item.id)) {
    return { ok: false, error: `Plan item id "${item.id}" already exists.` };
  }
  state.plan.push(item);
  persistPlanAndNotify();
  return { ok: true };
}

export function updatePlanItem(id, patch) {
  const item = state.plan.find((p) => p.id === id);
  if (!item) return { ok: false, error: "Plan item not found." };
  Object.assign(item, patch);
  persistPlanAndNotify();
  return { ok: true };
}

export function deletePlanItem(id) {
  const i = state.plan.findIndex((p) => p.id === id);
  if (i < 0) return { ok: false, error: "Plan item not found." };
  state.plan.splice(i, 1);
  persistPlanAndNotify();
  return { ok: true };
}

export function countRecordsForType(type) {
  return state.data.maintenanceRecords.filter((r) => r.type === type).length;
}

// Replace whole data document after validation passes.
export function importData(parsed) {
  const r = validateData(parsed);
  if (!r.ok) return r;
  state.data = parsed;
  touchAndPersistData();
  notify();
  return r;
}

export function importPlan(parsed) {
  const r = validatePlan(parsed);
  if (!r.ok) return r;
  state.plan = parsed;
  persistPlanAndNotify();
  return r;
}

export function resetDataToSeed() {
  state.data = clone(state.seedData);
  localStorage.removeItem(KEYS.data);
  state.usingStoredData = false;
  markDirty();
  notify();
}

export function resetPlanToSeed() {
  state.plan = clone(state.seedPlan);
  localStorage.removeItem(KEYS.plan);
  state.usingStoredPlan = false;
  markDirty();
  notify();
}

export function resetAllToSeed() {
  resetDataToSeed();
  resetPlanToSeed();
}

export function clearStoredData() {
  localStorage.removeItem(KEYS.data);
  localStorage.removeItem(KEYS.plan);
  state.usingStoredData = false;
  state.usingStoredPlan = false;
  notify();
}

// True when the in-memory data/plan differs from the last successfully
// synced (or never-synced) remote. Drives the "you have local changes"
// notice — must NOT be conflated with "localStorage has a cached copy",
// which is true whenever the app has been used.
export function hasLocalChanges() {
  return state.sync.dirty === true;
}

export function newId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Last-resort fallback. Browsers we care about all have randomUUID.
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// =====================================================================
// Phase 4 — GitHub sync state machine + operations
// =====================================================================

// Steady-state status derived from config/token/dirty/lastSyncedAt. The
// "transient" statuses (loading, saving, conflict, error) are set explicitly
// by the operations below and persist until refreshSyncStatus is called.
function baseStatus() {
  if (!state.config.owner || !state.config.repo) return "notConfigured";
  if (!state.token) return "localOnly";
  if (state.sync.dirty) return "localChangesPending";
  if (state.sync.lastSyncedAt) return "synced";
  return "ready";
}

const TRANSIENT = new Set(["loading", "saving", "conflict", "error"]);

export function refreshSyncStatus() {
  if (TRANSIENT.has(state.sync.status)) return;
  state.sync.status = baseStatus();
}

function setStatus(status, error) {
  state.sync.status = status;
  state.sync.lastError = error || null;
}

function markDirty() {
  state.sync.dirty = true;
  try {
    localStorage.setItem(KEYS.dirty, "1");
  } catch {
    /* ignore */
  }
  // If we were in a steady "all-good" state, downgrade. If we are mid-op or
  // mid-error/conflict, leave the explicit state alone.
  if (state.sync.status === "synced" || state.sync.status === "ready") {
    setStatus("localChangesPending");
  } else if (!TRANSIENT.has(state.sync.status)) {
    refreshSyncStatus();
  }
}

function markClean() {
  state.sync.dirty = false;
  state.sync.lastSyncedAt = new Date().toISOString();
  try {
    localStorage.setItem(KEYS.dirty, "0");
    localStorage.setItem(KEYS.lastSyncedAt, state.sync.lastSyncedAt);
  } catch {
    /* ignore */
  }
  setStatus("synced");
}

// ---- Token storage ----

export function setToken(token) {
  if (typeof token !== "string" || token.length === 0) return false;
  state.token = token;
  try {
    localStorage.setItem(KEYS.token, token);
  } catch {
    /* ignore */
  }
  refreshSyncStatus();
  notify();
  return true;
}

export function clearToken() {
  state.token = null;
  try {
    localStorage.removeItem(KEYS.token);
  } catch {
    /* ignore */
  }
  clearShaCache();
  refreshSyncStatus();
  notify();
}

export function hasToken() {
  return !!state.token;
}

function configWithToken() {
  return { ...state.config, token: state.token };
}

// ---- Operations ----

export function canAutoLoad() {
  return (
    !!state.config.owner &&
    !!state.config.repo &&
    !!state.token &&
    !state.sync.dirty
  );
}

export async function runTestConnection() {
  const cfg = configWithToken();
  const r = await testConnection(cfg);
  state.lastTestResult = r;
  notify();
  return r;
}

export async function loadFromGitHub() {
  const cfg = configWithToken();
  setStatus("loading");
  state.lastSyncResult = null;
  notify();

  const dataRes = await loadJsonFile(cfg, cfg.dataPath);
  if (!dataRes.ok) {
    setStatus("error", dataRes);
    state.lastSyncResult = { kind: "load", ok: false, stage: "load-data", error: dataRes };
    notify();
    return { ok: false, stage: "load-data", result: dataRes };
  }
  const planRes = await loadJsonFile(cfg, cfg.planPath);
  if (!planRes.ok) {
    setStatus("error", planRes);
    state.lastSyncResult = { kind: "load", ok: false, stage: "load-plan", error: planRes };
    notify();
    return { ok: false, stage: "load-plan", result: planRes };
  }

  const dV = validateData(dataRes.data);
  if (!dV.ok) {
    setStatus("error", {
      code: "validation",
      message: "Remote data failed validation; local state kept.",
    });
    state.lastSyncResult = { kind: "load", ok: false, stage: "validate-data", errors: dV.errors };
    notify();
    return { ok: false, stage: "validate-data", errors: dV.errors, warnings: dV.warnings };
  }
  const pV = validatePlan(planRes.data);
  if (!pV.ok) {
    setStatus("error", {
      code: "validation",
      message: "Remote plan failed validation; local state kept.",
    });
    state.lastSyncResult = { kind: "load", ok: false, stage: "validate-plan", errors: pV.errors };
    notify();
    return { ok: false, stage: "validate-plan", errors: pV.errors, warnings: pV.warnings };
  }

  state.data = dataRes.data;
  state.plan = planRes.data;
  writeJson(KEYS.data, state.data);
  writeJson(KEYS.plan, state.plan);
  state.usingStoredData = true;
  state.usingStoredPlan = true;

  markClean();
  const warnings = crossValidate(state.data, state.plan);
  state.lastSyncResult = { kind: "load", ok: true, warnings, dataSha: dataRes.sha, planSha: planRes.sha };
  notify();
  return { ok: true, warnings, dataSha: dataRes.sha, planSha: planRes.sha };
}

export async function saveToGitHub({ create = false } = {}) {
  const cfg = configWithToken();

  const dV = validateData(state.data);
  if (!dV.ok) {
    setStatus("error", {
      code: "validation",
      message: "Local data failed validation; nothing was sent.",
    });
    notify();
    return { ok: false, stage: "validate-data", errors: dV.errors };
  }
  const pV = validatePlan(state.plan);
  if (!pV.ok) {
    setStatus("error", {
      code: "validation",
      message: "Local plan failed validation; nothing was sent.",
    });
    notify();
    return { ok: false, stage: "validate-plan", errors: pV.errors };
  }

  const kind = create ? "create" : "save";
  setStatus("saving");
  state.lastSyncResult = null;
  notify();

  const dataRes = await saveJsonFile(
    cfg,
    cfg.dataPath,
    state.data,
    "Update car maintenance data",
    { create }
  );
  if (!dataRes.ok) {
    if (dataRes.code === "conflict") setStatus("conflict", dataRes);
    else setStatus("error", dataRes);
    state.lastSyncResult = { kind, ok: false, stage: "save-data", error: dataRes };
    notify();
    return { ok: false, stage: "save-data", result: dataRes };
  }

  const planRes = await saveJsonFile(
    cfg,
    cfg.planPath,
    state.plan,
    "Update maintenance plan",
    { create }
  );
  if (!planRes.ok) {
    if (planRes.code === "conflict") setStatus("conflict", planRes);
    else setStatus("error", planRes);
    state.lastSyncResult = {
      kind,
      ok: false,
      stage: "save-plan",
      error: planRes,
      partial: true,
      dataSavedSha: dataRes.sha,
    };
    notify();
    return {
      ok: false,
      stage: "save-plan",
      result: planRes,
      partial: true,
      dataSavedSha: dataRes.sha,
    };
  }

  markClean();
  const warnings = crossValidate(state.data, state.plan);
  state.lastSyncResult = { kind, ok: true, warnings, dataSha: dataRes.sha, planSha: planRes.sha };
  notify();
  return { ok: true, warnings, dataSha: dataRes.sha, planSha: planRes.sha };
}

export async function createRemoteFromLocal() {
  // Clears any stale SHA cache and saves both files with create: true so
  // GitHub treats them as new files (no sha in body).
  clearShaCache();
  return saveToGitHub({ create: true });
}

// Conflict-resolution option 2: re-fetch the remote files just to refresh
// the SHA cache without touching local state. After this, a normal save
// will write local-over-remote.
export async function refreshShas() {
  const cfg = configWithToken();
  const a = await loadJsonFile(cfg, cfg.dataPath); // updates SHA internally
  const b = await loadJsonFile(cfg, cfg.planPath);
  if (!a.ok || !b.ok) {
    const failed = !a.ok ? a : b;
    setStatus("error", failed);
    notify();
    return { ok: false, failed };
  }
  // After refresh, we have not adopted remote data; local is still dirty.
  setStatus("localChangesPending");
  notify();
  return { ok: true };
}

