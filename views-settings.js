// Settings view: car details, mileage, theme, plan editor,
// GitHub config placeholder, import/export, reset.

import {
  addPlanItem,
  clearToken,
  countRecordsForType,
  createRemoteFromLocal,
  deletePlanItem,
  hasLocalChanges,
  hasToken,
  importData,
  importPlan,
  loadFromGitHub,
  refreshShas,
  resetAllToSeed,
  resetDataToSeed,
  resetPlanToSeed,
  runTestConnection,
  saveToGitHub,
  setConfig,
  setTheme,
  setToken,
  state,
  toggleTheme,
  updateCar,
  updateMileage,
  updatePlanItem,
} from "./state.js";
import {
  checkbox,
  clearView,
  downloadJson,
  el,
  errorBox,
  labelledInput,
  labelledSelect,
  noticeBox,
  pickFile,
  readFileAsText,
} from "./dom.js";
import { crossValidate } from "./validation.js";

export function renderSettings() {
  const view = clearView();
  view.appendChild(el("h2", { text: "Settings" }));
  if (hasLocalChanges()) {
    view.appendChild(
      noticeBox(
        "You have local changes in this browser. They will not appear in the GitHub data repo until you click Save to GitHub below.",
        "info"
      )
    );
  }
  view.appendChild(renderCarSection());
  view.appendChild(renderMileageSection());
  view.appendChild(renderThemeSection());
  view.appendChild(renderPlanSection());
  view.appendChild(renderGithubSection());
  view.appendChild(renderImportExportSection());
  view.appendChild(renderResetSection());
}

function section(title) {
  const s = el("section", { class: "settings-section" });
  s.appendChild(el("h3", { class: "section-heading", text: title }));
  return s;
}

// ---------- car ----------

function renderCarSection() {
  const s = section("Car details");
  const c = state.data.car;
  const form = el("form", { class: "stack-form", attrs: { novalidate: "" } });
  const errMount = el("div");
  form.appendChild(errMount);
  form.appendChild(labelledInput("Make", "make", { value: c.make }));
  form.appendChild(labelledInput("Model", "model", { value: c.model }));
  form.appendChild(labelledInput("Engine", "engine", { value: c.engine }));
  form.appendChild(
    labelledInput("Year", "year", { type: "number", min: 1900, max: 2100, value: c.year })
  );
  form.appendChild(
    labelledInput("Power (CV)", "powerCv", { type: "number", min: 0, value: c.powerCv })
  );
  form.appendChild(labelledInput("Body", "body", { value: c.body }));
  form.appendChild(labelledInput("Version", "version", { value: c.version }));
  form.appendChild(labelledInput("License plate", "licensePlate", { value: c.licensePlate || "" }));
  form.appendChild(labelledInput("VIN", "vin", { value: c.vin || "" }));

  const actions = el("div", { class: "form-actions" });
  actions.appendChild(el("button", { type: "submit", class: "btn primary", text: "Save car details" }));
  form.appendChild(actions);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    errMount.replaceChildren();
    const fd = new FormData(form);
    const errors = [];
    const year = parseNum(fd.get("year"));
    const powerCv = parseNum(fd.get("powerCv"));
    if (year != null && (year < 1900 || year > 2100)) errors.push("Year must be 1900–2100.");
    if (powerCv != null && powerCv < 0) errors.push("Power (CV) cannot be negative.");
    if (errors.length) {
      const box = errorBox(errors);
      if (box) errMount.appendChild(box);
      return;
    }
    updateCar({
      make: trimOrEmpty(fd.get("make")),
      model: trimOrEmpty(fd.get("model")),
      engine: trimOrEmpty(fd.get("engine")),
      year: year ?? c.year,
      powerCv: powerCv ?? c.powerCv,
      body: trimOrEmpty(fd.get("body")),
      version: trimOrEmpty(fd.get("version")),
      licensePlate: trimOrEmpty(fd.get("licensePlate")),
      vin: trimOrEmpty(fd.get("vin")),
    });
  });

  s.appendChild(form);
  return s;
}

// ---------- mileage ----------

function renderMileageSection() {
  const s = section("Current mileage");
  const cm = state.data.currentMileage;
  const form = el("form", { class: "stack-form", attrs: { novalidate: "" } });
  const errMount = el("div");
  form.appendChild(errMount);
  form.appendChild(
    labelledInput("Current km", "km", {
      type: "number",
      min: 0,
      step: 1,
      value: cm.km,
      required: true,
    })
  );
  form.appendChild(
    labelledInput("Updated on (YYYY-MM-DD)", "updatedAt", {
      type: "date",
      value: cm.updatedAt || "",
    })
  );
  const actions = el("div", { class: "form-actions" });
  actions.appendChild(el("button", { type: "submit", class: "btn primary", text: "Save mileage" }));
  form.appendChild(actions);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    errMount.replaceChildren();
    const fd = new FormData(form);
    const km = parseNum(fd.get("km"));
    const updatedAt = trimOrNull(fd.get("updatedAt"));
    const errors = [];
    if (km == null || km < 0) errors.push("Current km must be a non-negative number.");
    if (updatedAt && !/^\d{4}-\d{2}-\d{2}$/.test(updatedAt)) {
      errors.push("Updated on must be YYYY-MM-DD or empty.");
    }
    if (errors.length) {
      const box = errorBox(errors);
      if (box) errMount.appendChild(box);
      return;
    }
    updateMileage(km, updatedAt);
  });

  s.appendChild(form);
  return s;
}

// ---------- theme ----------

function renderThemeSection() {
  const s = section("Theme");
  const p = el("p", { class: "muted" });
  p.textContent = `Current: ${state.theme}. Default is dark; the choice is remembered in this browser.`;
  s.appendChild(p);
  const row = el("div", { class: "form-actions" });
  const dark = el("button", {
    type: "button",
    class: state.theme === "dark" ? "btn primary" : "btn",
    text: "Dark",
  });
  dark.addEventListener("click", () => setTheme("dark"));
  const light = el("button", {
    type: "button",
    class: state.theme === "light" ? "btn primary" : "btn",
    text: "Light",
  });
  light.addEventListener("click", () => setTheme("light"));
  row.appendChild(dark);
  row.appendChild(light);
  s.appendChild(row);
  return s;
}

// ---------- plan editor ----------

const CATEGORY_OPTIONS = [
  { value: "routine", label: "routine" },
  { value: "wear", label: "wear" },
  { value: "major", label: "major" },
  { value: "repair", label: "repair" },
];

// Track which plan id is currently in inline-edit mode.
let editingPlanId = null;

function renderPlanSection() {
  const s = section("Maintenance plan");
  s.appendChild(
    el("p", {
      class: "muted",
      text: "Edit intervals, add new types, or remove unused ones. Removing a type does not delete its records.",
    })
  );
  const list = el("ul", { class: "plan-list" });
  for (const item of state.plan) {
    list.appendChild(
      item.id === editingPlanId ? renderPlanEditRow(item) : renderPlanRow(item)
    );
  }
  s.appendChild(list);
  s.appendChild(renderAddPlanForm());
  return s;
}

function renderPlanRow(item) {
  const li = el("li", { class: "plan-row" });
  const top = el("div", { class: "plan-row-top" });
  top.appendChild(el("span", { class: "plan-name", text: item.name }));
  top.appendChild(
    el("span", { class: `badge badge-${item.category}`, text: item.category })
  );
  li.appendChild(top);

  const meta = el("div", { class: "plan-meta muted small" });
  const parts = [];
  parts.push(
    item.intervalKm != null
      ? `every ${item.intervalKm.toLocaleString("en-US")} km`
      : "no km interval"
  );
  parts.push(
    item.intervalMonths != null
      ? `every ${item.intervalMonths} months`
      : "no month interval"
  );
  meta.textContent = parts.join(" · ");
  li.appendChild(meta);
  if (item.notes) li.appendChild(el("div", { class: "plan-notes small", text: item.notes }));
  li.appendChild(el("div", { class: "muted small", text: `id: ${item.id}` }));

  const actions = el("div", { class: "form-actions" });
  const edit = el("button", { type: "button", class: "btn-small", text: "Edit" });
  edit.addEventListener("click", () => {
    editingPlanId = item.id;
    rerenderSelf();
  });
  const del = el("button", { type: "button", class: "btn-small danger", text: "Delete" });
  del.addEventListener("click", () => onDeletePlanItem(item));
  actions.appendChild(edit);
  actions.appendChild(del);
  li.appendChild(actions);
  return li;
}

function renderPlanEditRow(item) {
  const li = el("li", { class: "plan-row plan-edit" });
  const form = el("form", { class: "stack-form" });
  const errMount = el("div");
  form.appendChild(errMount);
  form.appendChild(labelledInput("Name", "name", { value: item.name }));
  form.appendChild(
    labelledInput("Interval km (blank = none)", "intervalKm", {
      type: "number",
      min: 0,
      step: 1,
      value: item.intervalKm ?? "",
    })
  );
  form.appendChild(
    labelledInput("Interval months (blank = none)", "intervalMonths", {
      type: "number",
      min: 0,
      step: 1,
      value: item.intervalMonths ?? "",
    })
  );
  form.appendChild(
    labelledSelect("Category", "category", CATEGORY_OPTIONS, {
      value: item.category,
    })
  );
  form.appendChild(
    labelledInput("Notes", "notes", { tag: "textarea", value: item.notes || "" })
  );
  const actions = el("div", { class: "form-actions" });
  actions.appendChild(el("button", { type: "submit", class: "btn primary", text: "Save" }));
  const cancel = el("button", { type: "button", class: "btn-small", text: "Cancel" });
  cancel.addEventListener("click", () => {
    editingPlanId = null;
    rerenderSelf();
  });
  actions.appendChild(cancel);
  form.appendChild(actions);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    errMount.replaceChildren();
    const fd = new FormData(form);
    const name = trimOrEmpty(fd.get("name"));
    const intervalKm = parseNumOrNull(fd.get("intervalKm"));
    const intervalMonths = parseNumOrNull(fd.get("intervalMonths"));
    const category = trimOrEmpty(fd.get("category"));
    const notes = trimOrEmpty(fd.get("notes"));
    const errors = [];
    if (!name) errors.push("Name is required.");
    if (intervalKm != null && intervalKm < 0) errors.push("Interval km cannot be negative.");
    if (intervalMonths != null && intervalMonths < 0) errors.push("Interval months cannot be negative.");
    if (!["routine", "wear", "major", "repair"].includes(category)) errors.push("Invalid category.");
    if (errors.length) {
      const box = errorBox(errors);
      if (box) errMount.appendChild(box);
      return;
    }
    editingPlanId = null;
    updatePlanItem(item.id, {
      name,
      intervalKm,
      intervalMonths,
      category,
      notes,
    });
  });
  li.appendChild(form);
  return li;
}

function renderAddPlanForm() {
  const wrap = el("div", { class: "plan-add" });
  wrap.appendChild(el("h4", { text: "Add plan item" }));
  const form = el("form", { class: "stack-form" });
  const errMount = el("div");
  form.appendChild(errMount);
  form.appendChild(
    labelledInput("Id (lowercase, no spaces)", "id", { required: true, placeholder: "e.g. neumaticos" })
  );
  form.appendChild(labelledInput("Name", "name", { required: true }));
  form.appendChild(
    labelledInput("Interval km", "intervalKm", { type: "number", min: 0, step: 1 })
  );
  form.appendChild(
    labelledInput("Interval months", "intervalMonths", { type: "number", min: 0, step: 1 })
  );
  form.appendChild(labelledSelect("Category", "category", CATEGORY_OPTIONS, { value: "routine" }));
  form.appendChild(labelledInput("Notes", "notes", { tag: "textarea" }));
  const actions = el("div", { class: "form-actions" });
  actions.appendChild(el("button", { type: "submit", class: "btn primary", text: "Add item" }));
  form.appendChild(actions);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    errMount.replaceChildren();
    const fd = new FormData(form);
    const id = trimOrEmpty(fd.get("id"));
    const name = trimOrEmpty(fd.get("name"));
    const intervalKm = parseNumOrNull(fd.get("intervalKm"));
    const intervalMonths = parseNumOrNull(fd.get("intervalMonths"));
    const category = trimOrEmpty(fd.get("category"));
    const notes = trimOrEmpty(fd.get("notes"));
    const errors = [];
    if (!id) errors.push("Id is required.");
    else if (!/^[a-z0-9_\-]+$/i.test(id)) {
      errors.push("Id must contain only letters, digits, underscore, or dash.");
    }
    if (!name) errors.push("Name is required.");
    if (!["routine", "wear", "major", "repair"].includes(category)) errors.push("Invalid category.");
    if (intervalKm != null && intervalKm < 0) errors.push("Interval km cannot be negative.");
    if (intervalMonths != null && intervalMonths < 0) errors.push("Interval months cannot be negative.");
    if (errors.length) {
      const box = errorBox(errors);
      if (box) errMount.appendChild(box);
      return;
    }
    const result = addPlanItem({
      id,
      name,
      intervalKm,
      intervalMonths,
      category,
      ...(notes ? { notes } : {}),
    });
    if (!result.ok) {
      const box = errorBox([result.error]);
      if (box) errMount.appendChild(box);
    }
  });

  wrap.appendChild(form);
  return wrap;
}

function onDeletePlanItem(item) {
  const count = countRecordsForType(item.id);
  let msg = `Delete plan item "${item.name}" (id: ${item.id})?`;
  if (count > 0) {
    msg +=
      `\n\n${count} maintenance record(s) reference this type.` +
      ` They will NOT be deleted, but will show a warning until either the plan item is re-added or the records are reclassified.`;
  }
  if (!confirm(msg)) return;
  deletePlanItem(item.id);
}

// ---------- GitHub sync ----------

const SYNC_LABELS = {
  notConfigured: "Local only — GitHub not configured",
  localOnly: "GitHub configured — token required",
  ready: "GitHub configured — not loaded yet",
  loading: "Loading from GitHub…",
  saving: "Saving to GitHub…",
  synced: "Synced with GitHub",
  localChangesPending: "Local changes pending — save to GitHub",
  conflict: "Conflict — remote file changed",
  error: "GitHub error",
};

function renderGithubSection() {
  const s = section("GitHub sync");

  // --- Status & action area ---
  s.appendChild(renderSyncStatusBlock(s));

  // --- Config form ---
  const cfg = state.config;
  const form = el("form", { class: "stack-form" });
  form.appendChild(labelledInput("Owner", "owner", { value: cfg.owner }));
  form.appendChild(labelledInput("Repository", "repo", { value: cfg.repo }));
  form.appendChild(labelledInput("Branch", "branch", { value: cfg.branch }));
  form.appendChild(labelledInput("Data path", "dataPath", { value: cfg.dataPath }));
  form.appendChild(labelledInput("Plan path", "planPath", { value: cfg.planPath }));

  const actions = el("div", { class: "form-actions" });
  actions.appendChild(
    el("button", {
      type: "submit",
      class: "btn primary",
      text: "Save config (no token)",
    })
  );
  form.appendChild(actions);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    setConfig({
      owner: trimOrEmpty(fd.get("owner")),
      repo: trimOrEmpty(fd.get("repo")),
      branch: trimOrEmpty(fd.get("branch")) || "main",
      dataPath: trimOrEmpty(fd.get("dataPath")) || "data/mantenimientos.json",
      planPath: trimOrEmpty(fd.get("planPath")) || "data/plan-mantenimiento.json",
    });
  });
  s.appendChild(form);

  // --- Token form ---
  s.appendChild(renderTokenBlock(s));

  // --- Action buttons (load / save / test / create-from-local) ---
  s.appendChild(renderRemoteActions(s));

  // --- Last sync result (load/save/create) ---
  if (state.lastSyncResult) s.appendChild(renderSyncResult(state.lastSyncResult));

  // --- Test connection result ---
  if (state.lastTestResult) s.appendChild(renderTestResult(state.lastTestResult));

  return s;
}

function renderSyncResult(r) {
  const verb = r.kind === "load" ? "Load from GitHub" : r.kind === "create" ? "Create remote files" : "Save to GitHub";
  const when = state.sync.lastSyncedAt
    ? new Date(state.sync.lastSyncedAt).toLocaleString()
    : null;
  if (r.ok) {
    const box = el("section", { class: "notice notice-info" });
    box.appendChild(
      el("strong", {
        text: `Last sync: ${verb} — succeeded${when ? ` at ${when}` : ""}.`,
      })
    );
    if (r.warnings && r.warnings.length) {
      box.appendChild(el("p", { class: "small", text: "Warnings:" }));
      const ul = el("ul");
      for (const w of r.warnings) ul.appendChild(el("li", { class: "small", text: w }));
      box.appendChild(ul);
    }
    return box;
  }
  // Failure: distinguish partial-save (data succeeded, plan failed).
  const box = el("section", { class: "notice notice-error" });
  if (r.partial) {
    box.appendChild(el("strong", { text: `${verb} partially succeeded.` }));
    box.appendChild(
      el("p", {
        class: "small",
        text: `Data file was saved (sha ${r.dataSavedSha ? r.dataSavedSha.slice(0, 7) : "?"}), but plan failed.`,
      })
    );
  } else {
    box.appendChild(el("strong", { text: `${verb} failed.` }));
  }
  const stage = r.stage ? `Stage: ${r.stage}. ` : "";
  if (r.error) {
    box.appendChild(
      el("p", { class: "small", text: `${stage}${r.error.code || "error"}: ${r.error.message || ""}` })
    );
  } else if (r.errors && r.errors.length) {
    box.appendChild(el("p", { class: "small", text: `${stage}validation:` }));
    const ul = el("ul");
    for (const e of r.errors) ul.appendChild(el("li", { class: "small", text: e }));
    box.appendChild(ul);
  }
  return box;
}

function renderSyncStatusBlock(sectionEl) {
  const wrap = el("div", { class: `sync-block sync-${state.sync.status}` });
  const label = SYNC_LABELS[state.sync.status] || state.sync.status;
  wrap.appendChild(el("p", { class: "sync-headline", text: label }));
  if (state.sync.lastError && state.sync.lastError.message) {
    wrap.appendChild(
      el("p", {
        class: "muted small",
        text: `${state.sync.lastError.code || "error"}: ${state.sync.lastError.message}`,
      })
    );
  }
  if (state.sync.lastSyncedAt) {
    wrap.appendChild(
      el("p", {
        class: "muted small",
        text: `Last synced: ${state.sync.lastSyncedAt}`,
      })
    );
  }
  // Conflict resolution options
  if (state.sync.status === "conflict") {
    wrap.appendChild(renderConflictActions(sectionEl));
  }
  return wrap;
}

function renderConflictActions(sectionEl) {
  const wrap = el("div", { class: "form-actions conflict-actions" });
  const reload = el("button", {
    type: "button",
    class: "btn danger",
    text: "Reload remote & discard local changes",
  });
  reload.addEventListener("click", async () => {
    if (
      !confirm(
        "This will replace your local data and plan with the remote files. Continue?"
      )
    ) return;
    await loadFromGitHub();
  });
  const force = el("button", {
    type: "button",
    class: "btn",
    text: "Keep local — refresh SHA and retry",
  });
  force.addEventListener("click", async () => {
    if (
      !confirm(
        "This will overwrite the remote files with your local data. Remote changes since last load will be lost. Continue?"
      )
    ) return;
    const r = await refreshShas();
    if (r.ok) await saveToGitHub();
  });
  const backup = el("button", {
    type: "button",
    class: "btn",
    text: "Export local backup",
  });
  backup.addEventListener("click", () => {
    downloadJson("mantenimientos.json", state.data);
    downloadJson("plan-mantenimiento.json", state.plan);
  });
  wrap.appendChild(reload);
  wrap.appendChild(force);
  wrap.appendChild(backup);
  return wrap;
}

function renderTokenBlock(sectionEl) {
  const wrap = el("div", { class: "token-block" });
  wrap.appendChild(
    el("p", {
      class: "muted small",
      text:
        "Token is stored only in this browser (localStorage). localStorage is convenient but not highly secure. Recommended: a fine-grained PAT scoped only to the private data repo, with Contents: Read and write.",
    })
  );
  const status = el("p", { class: "muted small" });
  status.textContent = hasToken()
    ? "Token saved in this browser."
    : "No token saved yet.";
  wrap.appendChild(status);

  const tokenWrap = el("label", { class: "form-field" });
  tokenWrap.appendChild(
    document.createTextNode(
      hasToken()
        ? "Enter a new token to replace the saved one (leave blank to keep)"
        : "Fine-grained PAT"
    )
  );
  const tokenInput = el("input", {
    type: "password",
    name: "token",
    attrs: { autocomplete: "off", spellcheck: "false" },
    placeholder: hasToken() ? "leave blank to keep saved token" : "ghp_… or github_pat_…",
  });
  tokenWrap.appendChild(tokenInput);
  wrap.appendChild(tokenWrap);

  const actions = el("div", { class: "form-actions" });
  const saveBtn = el("button", { type: "button", class: "btn primary", text: "Save token" });
  saveBtn.addEventListener("click", () => {
    const val = tokenInput.value.trim();
    if (!val) {
      alert("Enter a token first, or use Delete token to remove the saved one.");
      return;
    }
    setToken(val);
    tokenInput.value = "";
  });
  actions.appendChild(saveBtn);
  const delBtn = el("button", {
    type: "button",
    class: "btn-small danger",
    text: "Delete token",
    disabled: !hasToken(),
  });
  delBtn.addEventListener("click", () => {
    if (!confirm("Delete the saved GitHub token from this browser?")) return;
    clearToken();
  });
  actions.appendChild(delBtn);
  wrap.appendChild(actions);

  // Expose the live token input value to actions below by attaching it.
  wrap.__tokenInput = tokenInput;
  sectionEl.__tokenInput = tokenInput;

  return wrap;
}

function renderRemoteActions(sectionEl) {
  const wrap = el("div", { class: "form-actions remote-actions" });

  const test = el("button", { type: "button", class: "btn", text: "Test connection" });
  test.addEventListener("click", async () => {
    const inUse = effectiveToken(sectionEl);
    if (!inUse) {
      alert("Save a token or type one into the token field first.");
      return;
    }
    const cfg = { ...state.config, token: inUse };
    const r = await import("./github-api.js").then((m) => m.testConnection(cfg));
    state.lastTestResult = r;
    // re-render section
    renderSettings();
  });
  wrap.appendChild(test);

  const load = el("button", { type: "button", class: "btn", text: "Load from GitHub" });
  load.addEventListener("click", async () => {
    if (
      state.sync.dirty &&
      !confirm(
        "You have local changes. Loading from GitHub will overwrite them. Continue?"
      )
    )
      return;
    await loadFromGitHub();
  });
  wrap.appendChild(load);

  const save = el("button", { type: "button", class: "btn primary", text: "Save to GitHub" });
  save.addEventListener("click", async () => {
    await saveToGitHub();
  });
  wrap.appendChild(save);

  const create = el("button", {
    type: "button",
    class: "btn",
    text: "Create remote files from local",
  });
  create.addEventListener("click", async () => {
    if (
      !confirm(
        "This will create both files in the configured remote location using your current local data. Only do this if the files do not exist yet. Continue?"
      )
    ) return;
    await createRemoteFromLocal();
  });
  wrap.appendChild(create);

  // Disable buttons that require config/token
  const needsToken = !hasToken();
  const needsConfig = !state.config.owner || !state.config.repo;
  for (const b of [load, save, create]) {
    if (needsToken || needsConfig) {
      b.disabled = true;
      b.title = needsConfig ? "Configure owner/repo first" : "Save a token first";
    }
  }
  if (needsConfig) {
    test.disabled = true;
    test.title = "Configure owner/repo first";
  }
  return wrap;
}

function effectiveToken(sectionEl) {
  const inp = sectionEl.__tokenInput;
  const typed = inp && inp.value ? inp.value.trim() : "";
  return typed || state.token || "";
}

function renderTestResult(r) {
  if (!r) return el("div");
  const box = el("section", { class: `notice notice-${r.ok ? "info" : "error"}` });
  if (!r.ok) {
    box.appendChild(el("strong", { text: "Test connection failed:" }));
    box.appendChild(
      el("p", { class: "small", text: `${r.code || "error"}: ${r.message || ""}` })
    );
    return box;
  }
  box.appendChild(el("strong", { text: "Test connection results:" }));
  const ul = el("ul");
  for (const c of r.checks) {
    const li = el("li", {
      class: c.ok ? "check-ok" : "check-fail",
      text: `${c.ok ? "OK" : "FAIL"} — ${c.name}: ${c.message}`,
    });
    ul.appendChild(li);
  }
  box.appendChild(ul);
  return box;
}

// ---------- import / export ----------

function renderImportExportSection() {
  const s = section("Backup");
  s.appendChild(
    el("p", {
      class: "muted small",
      text: "Export the current data or plan as JSON. Imports are validated before they replace local state — invalid files are rejected with a list of errors.",
    })
  );
  const row = el("div", { class: "form-actions" });
  const expData = el("button", { type: "button", class: "btn", text: "Export data JSON" });
  expData.addEventListener("click", () => downloadJson("mantenimientos.json", state.data));
  const expPlan = el("button", { type: "button", class: "btn", text: "Export plan JSON" });
  expPlan.addEventListener("click", () => downloadJson("plan-mantenimiento.json", state.plan));
  const impData = el("button", { type: "button", class: "btn", text: "Import data JSON…" });
  impData.addEventListener("click", () => handleImport("data", s));
  const impPlan = el("button", { type: "button", class: "btn", text: "Import plan JSON…" });
  impPlan.addEventListener("click", () => handleImport("plan", s));
  row.appendChild(expData);
  row.appendChild(expPlan);
  row.appendChild(impData);
  row.appendChild(impPlan);
  s.appendChild(row);
  return s;
}

async function handleImport(kind, sectionEl) {
  // remove any prior banners we appended
  for (const n of sectionEl.querySelectorAll(".import-feedback")) n.remove();

  let file;
  try {
    file = await pickFile();
  } catch {
    return;
  }
  if (!file) return;

  let text;
  try {
    text = await readFileAsText(file);
  } catch (e) {
    sectionEl.appendChild(feedbackBox(["Could not read file."], "error"));
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    sectionEl.appendChild(
      feedbackBox(["File is not valid JSON: " + (e.message || String(e))], "error")
    );
    return;
  }

  let result;
  if (kind === "data") result = importData(parsed);
  else result = importPlan(parsed);

  if (!result.ok) {
    sectionEl.appendChild(feedbackBox(result.errors, "error"));
    return;
  }
  const warnings = result.warnings || [];
  const extra = kind === "data" ? crossValidate(parsed, state.plan) : [];
  const allWarnings = warnings.concat(extra);
  if (allWarnings.length) {
    sectionEl.appendChild(feedbackBox(allWarnings, "warn", "Imported with warnings:"));
  } else {
    sectionEl.appendChild(feedbackBox([`Imported ${kind} successfully.`], "info"));
  }
}

function feedbackBox(messages, kind, leading) {
  const box = el("div", {
    class: `notice notice-${kind} import-feedback`,
    attrs: { role: kind === "error" ? "alert" : "status" },
  });
  if (leading) box.appendChild(el("strong", { text: leading }));
  const ul = el("ul");
  for (const m of messages) ul.appendChild(el("li", { text: m }));
  box.appendChild(ul);
  return box;
}

// ---------- reset ----------

function renderResetSection() {
  const s = section("Reset");
  s.appendChild(
    el("p", {
      class: "muted small",
      text: "Discard local changes and load the bundled seed JSON shipped with the app. This does not touch GitHub.",
    })
  );
  const row = el("div", { class: "form-actions" });
  const resetData = el("button", { type: "button", class: "btn danger", text: "Reset maintenance data" });
  resetData.addEventListener("click", () => {
    if (confirm("Discard your local maintenance data and reload bundled seed?")) {
      resetDataToSeed();
    }
  });
  const resetPlan = el("button", { type: "button", class: "btn danger", text: "Reset plan" });
  resetPlan.addEventListener("click", () => {
    if (confirm("Discard your local plan and reload bundled seed?")) {
      resetPlanToSeed();
    }
  });
  const resetAll = el("button", { type: "button", class: "btn danger", text: "Reset everything" });
  resetAll.addEventListener("click", () => {
    if (confirm("Discard all local data and plan changes and reload bundled seeds?")) {
      resetAllToSeed();
    }
  });
  row.appendChild(resetData);
  row.appendChild(resetPlan);
  row.appendChild(resetAll);
  s.appendChild(row);
  return s;
}

// ---------- helpers ----------

function trimOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
function trimOrEmpty(v) {
  return v == null ? "" : String(v).trim();
}
function parseNum(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function parseNumOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function rerenderSelf() {
  renderSettings();
}
