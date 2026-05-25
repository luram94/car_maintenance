// Global history view: chronological list with filters + cost summary.

import { state } from "./state.js";
import {
  computeCostSummary,
  formatKm,
  formatRecordDate,
} from "./calculations.js";
import { clearView, el, labelledInput, labelledSelect } from "./dom.js";

// Module-level filter state, kept across re-renders within a session.
const filters = {
  type: "",
  year: "",
  category: "",
  workshop: "",
  q: "",
};

export function renderHistory() {
  const view = clearView();
  view.appendChild(el("h2", { text: "History" }));
  const total = (state.data.maintenanceRecords || []).length;
  if (total === 0) {
    view.appendChild(
      el("p", {
        class: "muted",
        text:
          "No maintenance records yet. Open a maintenance type from the dashboard to register one.",
      })
    );
    return;
  }
  view.appendChild(renderOverallSummary());
  view.appendChild(renderFilterBar());
  const container = el("div", { id: "history-results-container" });
  container.appendChild(renderResults());
  view.appendChild(container);
}

function refreshResults() {
  const container = document.getElementById("history-results-container");
  if (!container) return;
  container.replaceChildren(renderResults());
}

function renderOverallSummary() {
  const s = computeCostSummary(state.data);
  const box = el("section", { class: "summary-box", attrs: { "aria-label": "Cost summary" } });
  box.appendChild(el("h3", { class: "section-heading", text: "Cost summary (all time)" }));

  const dl = el("dl", { class: "summary-grid" });
  pushDef(dl, "Total known cost", money(s.total));
  pushDef(
    dl,
    "Interventions",
    `${s.intervCount} (${s.intervKnownCount} with cost) — ${money(s.intervTotal)}`
  );
  pushDef(
    dl,
    "Standalone records",
    `${s.standaloneCount} (${s.standaloneKnownCount} with cost) — ${money(s.standaloneTotal)}`
  );
  pushDef(
    dl,
    "Average annual cost",
    s.avgAnnual == null
      ? "insufficient dated cost data"
      : money(s.avgAnnual) + " / year"
  );
  pushDef(
    dl,
    "Cost per km",
    s.costPerKm == null
      ? "insufficient data"
      : `${s.costPerKm.toFixed(3)} EUR / km (over ${formatKm(s.kmRange)})`
  );
  box.appendChild(dl);
  box.appendChild(
    el("p", {
      class: "muted small",
      text: "Each intervention's totalCost is counted once. Per-record costs inside an intervention are not added separately. Records with null cost are excluded from totals.",
    })
  );
  return box;
}

function pushDef(dl, k, v) {
  dl.appendChild(el("dt", { text: k }));
  dl.appendChild(el("dd", { text: v }));
}

function money(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(2)} EUR`;
}

function uniqueSorted(values) {
  const set = new Set();
  for (const v of values) {
    if (v != null && v !== "") set.add(String(v));
  }
  return Array.from(set).sort();
}

function recordYear(r) {
  if (r.date) {
    const m = /^(\d{4})-/.exec(r.date);
    if (m) return Number(m[1]);
  }
  if (r.dateText) {
    const m = /\b(19|20)\d{2}\b/.exec(r.dateText);
    if (m) return Number(m[0]);
  }
  return null;
}

function renderFilterBar() {
  const types = uniqueSorted(state.data.maintenanceRecords.map((r) => r.type));
  const years = uniqueSorted(
    state.data.maintenanceRecords.map(recordYear).filter((y) => y != null)
  );
  const workshops = uniqueSorted(
    state.data.maintenanceRecords.map((r) => r.workshop)
  );
  const categories = uniqueSorted(state.plan.map((p) => p.category));

  const bar = el("section", { class: "filter-bar", attrs: { "aria-label": "Filters" } });

  bar.appendChild(
    labelledSelect(
      "Type",
      "filter-type",
      [{ value: "", label: "All types" }].concat(
        types.map((t) => ({ value: t, label: t }))
      ),
      { value: filters.type }
    )
  );
  bar.appendChild(
    labelledSelect(
      "Year",
      "filter-year",
      [{ value: "", label: "All years" }].concat(
        years.map((y) => ({ value: String(y), label: String(y) }))
      ),
      { value: filters.year }
    )
  );
  bar.appendChild(
    labelledSelect(
      "Category",
      "filter-category",
      [{ value: "", label: "All categories" }].concat(
        categories.map((c) => ({ value: c, label: c }))
      ),
      { value: filters.category }
    )
  );
  bar.appendChild(
    labelledSelect(
      "Workshop",
      "filter-workshop",
      [{ value: "", label: "All workshops" }].concat(
        workshops.map((w) => ({ value: w, label: w }))
      ),
      { value: filters.workshop }
    )
  );
  bar.appendChild(
    labelledInput("Search", "filter-q", {
      value: filters.q,
      placeholder: "brand, notes, ref…",
    })
  );

  const clear = el("button", {
    type: "button",
    class: "btn-small",
    text: "Clear filters",
  });
  clear.addEventListener("click", () => {
    filters.type = filters.year = filters.category = filters.workshop = filters.q = "";
    renderHistory();
  });
  bar.appendChild(clear);

  bar.addEventListener("change", (e) => {
    const t = e.target;
    if (!t || !t.name) return;
    switch (t.name) {
      case "filter-type":
        filters.type = t.value;
        break;
      case "filter-year":
        filters.year = t.value;
        break;
      case "filter-category":
        filters.category = t.value;
        break;
      case "filter-workshop":
        filters.workshop = t.value;
        break;
      case "filter-q":
        filters.q = t.value;
        break;
      default:
        return;
    }
    refreshResults();
  });
  bar.addEventListener("input", (e) => {
    if (e.target && e.target.name === "filter-q") {
      filters.q = e.target.value;
      // Refresh only the results so the focused text input is not destroyed.
      refreshResults();
    }
  });

  return bar;
}

function matchesFilters(r, planById) {
  if (filters.type && r.type !== filters.type) return false;
  if (filters.year) {
    const y = recordYear(r);
    if (String(y) !== filters.year) return false;
  }
  if (filters.category) {
    const cat = planById.get(r.type)?.category || "";
    if (cat !== filters.category) return false;
  }
  if (filters.workshop && r.workshop !== filters.workshop) return false;
  if (filters.q) {
    const hay = [
      r.type,
      r.brand,
      r.reference,
      r.workshop,
      r.notes,
      r.dateText,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!hay.includes(filters.q.toLowerCase())) return false;
  }
  return true;
}

function sortDescByDateThenKm(a, b) {
  const ad = a.date || "";
  const bd = b.date || "";
  if (ad !== bd) return ad < bd ? 1 : -1;
  return (b.km ?? -Infinity) - (a.km ?? -Infinity);
}

function renderResults() {
  const planById = new Map(state.plan.map((p) => [p.id, p]));
  const matching = state.data.maintenanceRecords
    .filter((r) => matchesFilters(r, planById))
    .sort(sortDescByDateThenKm);

  const wrap = el("section", { class: "history-results" });

  const headingText = `${matching.length} record${matching.length === 1 ? "" : "s"}`;
  wrap.appendChild(el("h3", { class: "section-heading", text: headingText }));

  if (!matching.length) {
    wrap.appendChild(
      el("p", { class: "muted", text: "No records match the current filters." })
    );
    return wrap;
  }

  // Filtered subset metrics — standalone costs only, intervention totals shown
  // separately to avoid misleading partial sums.
  let standaloneSum = 0;
  let standaloneKnown = 0;
  const intvIds = new Set();
  for (const r of matching) {
    if (r.interventionId) intvIds.add(r.interventionId);
    else if (r.cost != null && Number.isFinite(r.cost)) {
      standaloneSum += r.cost;
      standaloneKnown++;
    }
  }
  let intvSum = 0;
  let intvKnown = 0;
  for (const id of intvIds) {
    const iv = state.data.interventions.find((i) => i.id === id);
    if (iv && iv.totalCost != null && Number.isFinite(iv.totalCost)) {
      intvSum += iv.totalCost;
      intvKnown++;
    }
  }
  const subset = el("p", { class: "muted small" });
  subset.textContent =
    `Filtered: ${standaloneKnown} known standalone cost(s) = ${money(standaloneSum)} · ` +
    `${intvIds.size} intervention(s) touched (${intvKnown} with cost = ${money(intvSum)}). ` +
    `Intervention totals shown separately because one intervention can contain multiple records.`;
  wrap.appendChild(subset);

  const ul = el("ul", { class: "record-list" });
  for (const r of matching) {
    ul.appendChild(renderHistoryRow(r, planById));
  }
  wrap.appendChild(ul);
  return wrap;
}

function renderHistoryRow(rec, planById) {
  const li = el("li", { class: "record-item history-row" });

  const a = el("a", {
    class: "history-link",
    href: `#/maintenance/${encodeURIComponent(rec.type)}`,
  });

  const top = el("div", { class: "record-top" });
  const planName = planById.get(rec.type)?.name || rec.type;
  top.appendChild(el("span", { class: "record-km", text: planName }));
  top.appendChild(
    el("span", { class: "record-date", text: formatRecordDate(rec) })
  );
  a.appendChild(top);

  const meta2 = el("div", { class: "record-meta" });
  const parts = [];
  parts.push(rec.km != null ? formatKm(rec.km) : "km unknown");
  if (rec.brand) parts.push(rec.brand);
  if (rec.reference) parts.push(`ref ${rec.reference}`);
  if (rec.quantity && rec.quantity > 1) parts.push(`× ${rec.quantity}`);
  if (rec.workshop) parts.push(`@ ${rec.workshop}`);
  if (rec.cost != null) parts.push(`${rec.cost} ${rec.currency || ""}`.trim());
  else parts.push("cost unknown");
  meta2.textContent = parts.join(" · ");
  a.appendChild(meta2);

  if (rec.interventionId) {
    const iv = state.data.interventions.find((i) => i.id === rec.interventionId);
    if (iv) {
      a.appendChild(
        el("div", {
          class: "muted record-intv",
          text: `Grouped: ${iv.workshop || "intervention"} · ${formatRecordDate(iv)} · ${
            iv.totalCost != null ? `${iv.totalCost} ${iv.currency || ""}`.trim() : "total unknown"
          }`,
        })
      );
    }
  }

  if (!planById.has(rec.type)) {
    a.appendChild(
      el("div", {
        class: "warn-line",
        text: `Type "${rec.type}" is not in the current plan.`,
      })
    );
  }

  li.appendChild(a);
  return li;
}
