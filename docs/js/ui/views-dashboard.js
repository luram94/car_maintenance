// Dashboard view: car summary + urgency-sorted maintenance cards.

import { state } from "../core/state.js";
import {
  computePlanRows,
  formatKm,
  formatLocalISO,
  formatRecordDate,
  sortRows,
} from "../core/calculations.js";
import { clearView, el, row } from "./dom.js";

export function renderDashboard() {
  const view = clearView();
  view.appendChild(renderCarSummary());

  view.appendChild(
    el("h3", { class: "section-heading", text: "Maintenance" })
  );

  if (!state.plan || state.plan.length === 0) {
    view.appendChild(
      el("p", {
        class: "muted",
        text:
          "Your maintenance plan is empty. Add items in Settings → Maintenance plan, or use Reset to restore the bundled defaults.",
      })
    );
    return;
  }

  const rows = sortRows(computePlanRows(state.data, state.plan));
  const list = el("div", { class: "card-list", attrs: { role: "list" } });
  for (const r of rows) list.appendChild(renderCard(r));
  view.appendChild(list);
}

function renderCarSummary() {
  const c = state.data.car;
  const cm = state.data.currentMileage;
  const wrap = el("section", {
    class: "car-summary",
    attrs: { "aria-label": "Car summary" },
  });
  wrap.appendChild(
    el("h2", { class: "car-title", text: `${c.make} ${c.model} · ${c.year}` })
  );
  const metaParts = [c.engine, `${c.powerCv} CV`, c.body, c.version]
    .filter(Boolean)
    .join(" · ");
  wrap.appendChild(el("p", { class: "muted car-meta", text: metaParts }));

  const mRow = el("div", { class: "mileage-row" });
  mRow.appendChild(
    el("span", { class: "mileage-value", text: formatKm(cm.km) })
  );
  mRow.appendChild(
    el("span", {
      class: "muted",
      text: cm.updatedAt ? `updated ${cm.updatedAt}` : "updated date unknown",
    })
  );
  mRow.appendChild(
    el("a", {
      class: "btn-small",
      href: "#/settings",
      text: "Update",
      attrs: { "aria-label": "Update current mileage" },
    })
  );
  wrap.appendChild(mRow);

  if (c.licensePlate) {
    wrap.appendChild(
      el("p", { class: "muted small", text: `Plate: ${c.licensePlate}` })
    );
  }
  return wrap;
}

function renderCard(r) {
  const a = el("a", {
    class: `card card-${r.urgency} card-kind-${r.kind}`,
    href: `#/maintenance/${encodeURIComponent(r.item.id)}`,
    attrs: { role: "listitem" },
  });

  const header = el("div", { class: "card-header" });
  header.appendChild(el("span", { class: "card-name", text: r.item.name }));
  header.appendChild(
    el("span", {
      class: `badge badge-${r.item.category}`,
      text: r.item.category,
    })
  );
  a.appendChild(header);

  if (r.kind === "repair") {
    a.appendChild(rowOrPlaceholder("Last service:", r.lastRecord));
    a.appendChild(
      el("p", {
        class: "card-note",
        text: "Repair item — tracked, not scheduled.",
      })
    );
    return a;
  }
  if (r.kind === "no-schedule") {
    a.appendChild(rowOrPlaceholder("Last service:", r.lastRecord));
    a.appendChild(
      el("p", { class: "card-note", text: "No interval configured." })
    );
    return a;
  }
  if (r.kind === "no-history") {
    a.appendChild(
      el("p", {
        class: "card-note",
        text: "No history — review recommended.",
      })
    );
    return a;
  }

  a.appendChild(rowOrPlaceholder("Last service:", r.lastRecord));
  a.appendChild(renderNextRow(r));
  a.appendChild(renderProgress(r));
  return a;
}

export function rowOrPlaceholder(label, rec) {
  if (!rec) return row(label, "No history yet");
  const km = rec.km != null ? formatKm(rec.km) : "km unknown";
  return row(label, `${km} · ${formatRecordDate(rec)}`);
}

export function renderNextRow(r) {
  const parts = [];
  if (r.nextKm != null) parts.push(formatKm(r.nextKm));
  if (r.nextDate) {
    const dateStr = formatLocalISO(r.nextDate);
    parts.push(r.nextDateApproximate ? `≈ ${dateStr}` : dateStr);
  } else if (r.estimatedDate) {
    parts.push(`est. ${formatLocalISO(r.estimatedDate)}`);
  }
  return row("Next:", parts.length ? parts.join(" · ") : "—");
}

export function renderProgress(r) {
  const wrap = el("div", { class: "card-progress-wrap" });
  const bar = el("div", {
    class: "card-progress",
    attrs: { role: "progressbar", "aria-label": `${r.item.name} progress` },
  });
  const fill = el("div", {
    class: `card-progress-fill card-progress-fill-${r.urgency}`,
  });
  let pct = 0;
  if (
    r.item.intervalKm != null &&
    r.lastRecord &&
    r.lastRecord.km != null &&
    r.nextKm != null
  ) {
    const used = state.data.currentMileage.km - r.lastRecord.km;
    pct = (used / r.item.intervalKm) * 100;
  }
  const clamped = Math.max(0, Math.min(100, pct));
  fill.style.width = `${clamped}%`;
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", "100");
  bar.setAttribute("aria-valuenow", String(Math.round(clamped)));
  bar.appendChild(fill);
  wrap.appendChild(bar);

  const info = el("div", { class: "card-remaining" });
  const parts = [];
  if (r.remainingKm != null) {
    parts.push(
      r.remainingKm < 0
        ? `${formatKm(Math.abs(r.remainingKm))} overdue`
        : `${formatKm(r.remainingKm)} remaining`
    );
  }
  if (r.remainingMonths != null) {
    const m = Math.round(r.remainingMonths);
    if (m < 0) parts.push(`${Math.abs(m)} mo overdue`);
    else if (m === 0) parts.push("due this month");
    else parts.push(`${m} mo remaining`);
  }
  if (r.estimatedDate && r.remainingMonths == null) {
    parts.push("date estimated from km/month");
  }
  info.textContent = parts.join(" · ") || "insufficient data";
  wrap.appendChild(info);
  return wrap;
}
