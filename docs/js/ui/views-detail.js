// Maintenance detail view: plan-item info, status box, history list,
// and the "Register new maintenance record" form.

import {
  addRecord,
  deleteRecord,
  newId,
  state,
  updateRecord,
} from "../core/state.js";
import {
  computePlanRows,
  formatKm,
  formatRecordDate,
} from "../core/calculations.js";
import {
  checkbox,
  clearView,
  el,
  errorBox,
  labelledInput,
} from "./dom.js";
import {
  renderNextRow,
  renderProgress,
  rowOrPlaceholder,
} from "./views-dashboard.js";

let editingRecordId = null;

export function renderDetail(planId) {
  const view = clearView();
  const planItem = state.plan.find((p) => p.id === planId);

  view.appendChild(
    el("a", { class: "back-link", href: "#/dashboard", text: "← Dashboard" })
  );

  if (!planItem) {
    view.appendChild(el("h2", { text: "Maintenance item not found" }));
    view.appendChild(
      el("p", { class: "muted", text: `No plan item with id "${planId}".` })
    );
    return;
  }

  view.appendChild(el("h2", { text: planItem.name }));

  const metaParts = [`category: ${planItem.category}`];
  metaParts.push(
    planItem.intervalKm != null
      ? `every ${planItem.intervalKm.toLocaleString("en-US")} km`
      : "no km interval"
  );
  metaParts.push(
    planItem.intervalMonths != null
      ? `every ${planItem.intervalMonths} months`
      : "no month interval"
  );
  view.appendChild(el("p", { class: "muted", text: metaParts.join(" · ") }));

  if (planItem.notes) {
    view.appendChild(el("p", { class: "card-note", text: planItem.notes }));
  }

  const computed = computePlanRows(state.data, state.plan).find(
    (r) => r.item.id === planId
  );
  if (computed) view.appendChild(renderDetailStatus(computed));

  view.appendChild(el("h3", { class: "section-heading", text: "History" }));
  const records = state.data.maintenanceRecords
    .filter((r) => r.type === planId)
    .sort((a, b) => (b.km ?? 0) - (a.km ?? 0));

  if (!records.length) {
    view.appendChild(
      el("p", {
        class: "muted",
        text: "No history for this maintenance type yet.",
      })
    );
  } else {
    const ul = el("ul", { class: "record-list" });
    for (const r of records) {
      ul.appendChild(
        r.id === editingRecordId ? renderRecordEditRow(r) : renderRecordItem(r)
      );
    }
    view.appendChild(ul);
  }

  view.appendChild(el("h3", { class: "section-heading", text: "Register new record" }));
  view.appendChild(renderAddRecordForm(planItem));
}

function renderDetailStatus(r) {
  const box = el("section", { class: `status-box status-${r.urgency}` });
  box.appendChild(el("h3", { class: "section-heading", text: "Status" }));
  if (r.kind === "no-history") {
    box.appendChild(el("p", { text: "No history — review recommended." }));
    return box;
  }
  if (r.kind === "repair") {
    box.appendChild(el("p", { text: "Repair item — tracked, not scheduled." }));
    return box;
  }
  if (r.kind === "no-schedule") {
    box.appendChild(el("p", { text: "No interval configured." }));
    return box;
  }
  box.appendChild(rowOrPlaceholder("Last service:", r.lastRecord));
  box.appendChild(renderNextRow(r));
  box.appendChild(renderProgress(r));
  return box;
}

export function renderRecordItem(rec) {
  const li = el("li", { class: "record-item" });
  const top = el("div", { class: "record-top" });
  top.appendChild(
    el("span", {
      class: "record-km",
      text: rec.km != null ? formatKm(rec.km) : "km unknown",
    })
  );
  top.appendChild(
    el("span", { class: "record-date", text: formatRecordDate(rec) })
  );
  li.appendChild(top);

  const lineParts = [];
  if (rec.brand) lineParts.push(rec.brand);
  if (rec.reference) lineParts.push(`ref ${rec.reference}`);
  if (rec.quantity && rec.quantity > 1) lineParts.push(`× ${rec.quantity}`);
  if (rec.workshop) lineParts.push(`@ ${rec.workshop}`);
  if (rec.cost != null) lineParts.push(`${rec.cost} ${rec.currency || ""}`.trim());
  if (lineParts.length) {
    li.appendChild(el("div", { class: "record-meta", text: lineParts.join(" · ") }));
  }
  if (rec.notes) {
    li.appendChild(el("div", { class: "record-notes", text: rec.notes }));
  }
  if (rec.interventionId) {
    const intv = state.data.interventions.find(
      (i) => i.id === rec.interventionId
    );
    if (intv) {
      const grouped = `Grouped with: ${intv.workshop || "intervention"} · ${formatRecordDate(intv)}`;
      li.appendChild(el("div", { class: "muted record-intv", text: grouped }));
    }
  }

  const actions = el("div", { class: "record-actions" });
  const editBtn = el("button", {
    type: "button",
    class: "btn-small",
    text: "Edit",
  });
  editBtn.addEventListener("click", () => {
    editingRecordId = rec.id;
    renderDetail(rec.type);
  });
  const delBtn = el("button", {
    type: "button",
    class: "btn-small danger",
    text: "Delete",
  });
  delBtn.addEventListener("click", () => handleDeleteRecord(rec));
  actions.appendChild(editBtn);
  actions.appendChild(delBtn);
  li.appendChild(actions);
  return li;
}

function handleDeleteRecord(rec) {
  if (!confirm("Delete this maintenance record? This cannot be undone.")) return;
  let deleteEmptyIntervention = false;
  if (rec.interventionId) {
    const others = state.data.maintenanceRecords.filter(
      (r) => r.interventionId === rec.interventionId && r.id !== rec.id
    );
    if (others.length === 0) {
      const intv = state.data.interventions.find(
        (i) => i.id === rec.interventionId
      );
      const label = intv ? intv.workshop || "intervention" : "intervention";
      const costText =
        intv && intv.totalCost != null
          ? ` (total ${intv.totalCost} ${intv.currency || ""})`.trimEnd()
          : "";
      deleteEmptyIntervention = confirm(
        `This was the last record in "${label}"${costText}. ` +
          "Also delete that now-empty intervention? " +
          "Cancel keeps it — its total cost stays in the summary."
      );
    }
  }
  deleteRecord(rec.id, { deleteEmptyIntervention });
}

function renderRecordEditRow(rec) {
  const li = el("li", { class: "record-item record-edit" });
  const form = el("form", { class: "stack-form", attrs: { novalidate: "" } });
  const errMount = el("div");
  form.appendChild(errMount);

  form.appendChild(
    labelledInput("Date (YYYY-MM-DD)", "date", {
      type: "date",
      value: rec.date || "",
    })
  );
  form.appendChild(
    checkbox("Date is approximate", "dateApproximate", !!rec.dateApproximate)
  );
  form.appendChild(
    labelledInput("Date text (optional)", "dateText", {
      value: rec.dateText || "",
      placeholder: "e.g. May 2024 approximate",
    })
  );
  form.appendChild(
    labelledInput("km", "km", {
      type: "number",
      min: 0,
      step: 1,
      value: rec.km ?? "",
    })
  );
  form.appendChild(labelledInput("Brand", "brand", { value: rec.brand || "" }));
  form.appendChild(
    labelledInput("Reference", "reference", { value: rec.reference || "" })
  );
  form.appendChild(
    labelledInput("Cost", "cost", {
      type: "number",
      min: 0,
      step: "0.01",
      value: rec.cost ?? "",
    })
  );
  form.appendChild(
    labelledInput("Currency", "currency", { value: rec.currency || "EUR" })
  );
  form.appendChild(
    labelledInput("Workshop", "workshop", { value: rec.workshop || "" })
  );
  form.appendChild(
    labelledInput("Quantity", "quantity", {
      type: "number",
      min: 1,
      step: 1,
      value: rec.quantity ?? 1,
    })
  );
  form.appendChild(
    labelledInput("Notes", "notes", {
      tag: "textarea",
      value: rec.notes || "",
      attrs: { rows: 3 },
    })
  );

  if (rec.interventionId) {
    form.appendChild(
      el("p", {
        class: "muted small",
        text: "This record is part of an intervention. Editing here changes the record only, not the intervention's grouping or total cost.",
      })
    );
  }

  const actions = el("div", { class: "form-actions" });
  actions.appendChild(
    el("button", { type: "submit", class: "btn primary", text: "Save changes" })
  );
  const cancel = el("button", { type: "button", class: "btn-small", text: "Cancel" });
  cancel.addEventListener("click", () => {
    editingRecordId = null;
    renderDetail(rec.type);
  });
  actions.appendChild(cancel);
  form.appendChild(actions);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    errMount.replaceChildren();
    const fd = new FormData(form);
    const date = trimOrNull(fd.get("date"));
    const dateText = trimOrEmpty(fd.get("dateText"));
    const dateApproximate = fd.get("dateApproximate") === "on";
    const km = parseNum(fd.get("km"));
    const cost = parseNum(fd.get("cost"));
    const quantity = parseNum(fd.get("quantity")) ?? 1;

    const errors = [];
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push("Date must be YYYY-MM-DD or empty.");
    }
    if (!date && km == null && !dateText) {
      errors.push("At least one of date, km or date text is required.");
    }
    if (km != null && km < 0) errors.push("km cannot be negative.");
    if (cost != null && cost < 0) errors.push("Cost cannot be negative.");
    if (quantity != null && quantity < 1) errors.push("Quantity must be at least 1.");
    if (errors.length) {
      const box = errorBox(errors);
      if (box) errMount.appendChild(box);
      return;
    }

    editingRecordId = null;
    updateRecord(rec.id, {
      date,
      dateApproximate,
      dateText,
      km,
      brand: trimOrEmpty(fd.get("brand")),
      reference: trimOrEmpty(fd.get("reference")),
      cost,
      currency: trimOrEmpty(fd.get("currency")) || "EUR",
      workshop: trimOrEmpty(fd.get("workshop")),
      quantity,
      notes: trimOrEmpty(fd.get("notes")),
    });
  });

  li.appendChild(form);
  return li;
}

function renderAddRecordForm(planItem) {
  const form = el("form", { class: "stack-form", attrs: { novalidate: "" } });
  const errorsMount = el("div");
  const successMount = el("div");
  form.appendChild(errorsMount);
  form.appendChild(successMount);

  // Record fields
  const recFs = el("fieldset");
  recFs.appendChild(el("legend", { text: "Record" }));
  recFs.appendChild(
    labelledInput("Date (YYYY-MM-DD)", "date", { type: "date" })
  );
  recFs.appendChild(
    checkbox("Date is approximate", "dateApproximate", false)
  );
  recFs.appendChild(
    labelledInput("Date text (optional)", "dateText", {
      placeholder: "e.g. May 2024 approximate",
    })
  );
  recFs.appendChild(
    labelledInput("km", "km", { type: "number", min: 0, step: 1 })
  );
  recFs.appendChild(labelledInput("Brand", "brand"));
  recFs.appendChild(labelledInput("Reference", "reference"));
  recFs.appendChild(
    labelledInput("Cost", "cost", { type: "number", min: 0, step: "0.01" })
  );
  recFs.appendChild(labelledInput("Currency", "currency", { value: "EUR" }));
  recFs.appendChild(labelledInput("Workshop", "workshop"));
  recFs.appendChild(
    labelledInput("Quantity", "quantity", {
      type: "number",
      min: 1,
      step: 1,
      value: 1,
    })
  );
  recFs.appendChild(
    labelledInput("Notes", "notes", { tag: "textarea", attrs: { rows: 3 } })
  );
  form.appendChild(recFs);

  // Intervention link
  const linkFs = el("fieldset");
  linkFs.appendChild(el("legend", { text: "Intervention" }));
  const radio = (val, label, checked) => {
    const id = `link-${val}-${Math.random().toString(36).slice(2, 6)}`;
    const wrap = el("label", { class: "form-check", attrs: { for: id } });
    const inp = el("input", {
      id,
      name: "linkType",
      type: "radio",
      value: val,
      attrs: checked ? { checked: "checked" } : {},
    });
    if (checked) inp.checked = true;
    wrap.appendChild(inp);
    wrap.appendChild(document.createTextNode(" " + label));
    return wrap;
  };
  linkFs.appendChild(radio("standalone", "Standalone (no intervention)", true));
  linkFs.appendChild(radio("new", "Create a new intervention"));

  const intvBlock = el("div", {
    class: "intv-fields",
    attrs: { hidden: "" },
  });
  intvBlock.appendChild(
    labelledInput("Intervention date", "intvDate", { type: "date" })
  );
  intvBlock.appendChild(
    checkbox("Intervention date is approximate", "intvDateApproximate", false)
  );
  intvBlock.appendChild(
    labelledInput("Intervention date text", "intvDateText", {
      placeholder: "e.g. May 2024 approximate",
    })
  );
  intvBlock.appendChild(
    labelledInput("Intervention km", "intvKm", { type: "number", min: 0, step: 1 })
  );
  intvBlock.appendChild(labelledInput("Workshop", "intvWorkshop"));
  intvBlock.appendChild(
    labelledInput("Total cost", "intvTotalCost", {
      type: "number",
      min: 0,
      step: "0.01",
    })
  );
  intvBlock.appendChild(
    labelledInput("Currency", "intvCurrency", { value: "EUR" })
  );
  intvBlock.appendChild(
    labelledInput("Intervention notes", "intvNotes", {
      tag: "textarea",
      attrs: { rows: 2 },
    })
  );
  linkFs.appendChild(intvBlock);
  form.appendChild(linkFs);

  // Toggle visibility of intervention fields
  linkFs.addEventListener("change", (e) => {
    if (e.target && e.target.name === "linkType") {
      intvBlock.hidden = e.target.value !== "new";
    }
  });

  const submitRow = el("div", { class: "form-actions" });
  submitRow.appendChild(
    el("button", { type: "submit", class: "btn primary", text: "Save record" })
  );
  submitRow.appendChild(
    el("a", { class: "btn-small", href: "#/dashboard", text: "Cancel" })
  );
  form.appendChild(submitRow);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    handleSubmit(form, planItem, errorsMount, successMount);
  });

  return form;
}

function handleSubmit(form, planItem, errorsMount, successMount) {
  errorsMount.replaceChildren();
  successMount.replaceChildren();
  const fd = new FormData(form);

  const errors = [];
  const date = trimOrNull(fd.get("date"));
  const dateText = trimOrEmpty(fd.get("dateText"));
  const dateApproximate = fd.get("dateApproximate") === "on";
  const km = parseNum(fd.get("km"));
  const brand = trimOrEmpty(fd.get("brand"));
  const reference = trimOrEmpty(fd.get("reference"));
  const cost = parseNum(fd.get("cost"));
  const currency = trimOrEmpty(fd.get("currency")) || "EUR";
  const workshop = trimOrEmpty(fd.get("workshop"));
  const quantity = parseNum(fd.get("quantity")) ?? 1;
  const notes = trimOrEmpty(fd.get("notes"));
  const linkType = fd.get("linkType") || "standalone";

  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.push("Date must be YYYY-MM-DD or empty.");
  }
  if (!date && !km && !dateText) {
    errors.push("At least one of date, km or date text is required.");
  }
  if (km != null && km < 0) errors.push("km cannot be negative.");
  if (cost != null && cost < 0) errors.push("Cost cannot be negative.");
  if (quantity != null && quantity < 1) errors.push("Quantity must be at least 1.");

  let intervention = null;
  if (linkType === "new") {
    const iDate = trimOrNull(fd.get("intvDate"));
    const iDateText = trimOrEmpty(fd.get("intvDateText"));
    const iDateApprox = fd.get("intvDateApproximate") === "on";
    const iKm = parseNum(fd.get("intvKm"));
    const iWorkshop = trimOrEmpty(fd.get("intvWorkshop"));
    const iTotal = parseNum(fd.get("intvTotalCost"));
    const iCurrency = trimOrEmpty(fd.get("intvCurrency")) || "EUR";
    const iNotes = trimOrEmpty(fd.get("intvNotes"));
    if (iDate && !/^\d{4}-\d{2}-\d{2}$/.test(iDate)) {
      errors.push("Intervention date must be YYYY-MM-DD or empty.");
    }
    if (!iDate && !iKm && !iDateText) {
      errors.push("Intervention needs a date, km or date text.");
    }
    if (iKm != null && iKm < 0) errors.push("Intervention km cannot be negative.");
    if (iTotal != null && iTotal < 0) errors.push("Intervention totalCost cannot be negative.");
    if (errors.length === 0) {
      intervention = {
        id: newId(),
        date: iDate,
        dateApproximate: iDateApprox,
        dateText: iDateText,
        km: iKm,
        workshop: iWorkshop,
        totalCost: iTotal,
        currency: iCurrency,
        notes: iNotes,
      };
    }
  }

  if (errors.length) {
    const box = errorBox(errors);
    if (box) errorsMount.appendChild(box);
    return;
  }

  const record = {
    id: newId(),
    interventionId: null,
    type: planItem.id,
    date: date,
    dateApproximate: dateApproximate,
    dateText: dateText,
    km: km,
    brand: brand,
    reference: reference,
    cost: cost,
    currency: currency,
    workshop: workshop,
    quantity: quantity,
    notes: notes,
  };

  addRecord(record, intervention);
  // addRecord triggers a notify() which re-renders the detail view, so we
  // do not need to manage `successMount` here.
}

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
