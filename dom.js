// Safe DOM helpers + file IO. No domain logic.
// Any value derived from JSON, user input or GitHub responses must reach the
// DOM through `text` / textContent — never via innerHTML.

export function el(tag, opts = {}, children = []) {
  const node = document.createElement(tag);
  if (opts.class) node.className = opts.class;
  if (opts.id) node.id = opts.id;
  if (opts.text != null) node.textContent = opts.text;
  if (opts.href) node.setAttribute("href", opts.href);
  if (opts.type) node.type = opts.type;
  if (opts.name != null) node.name = opts.name;
  if (opts.value != null) node.value = opts.value;
  if (opts.placeholder != null) node.placeholder = opts.placeholder;
  if (opts.checked) node.checked = true;
  if (opts.disabled) node.disabled = true;
  if (opts.hidden) node.hidden = true;
  if (opts.attrs) {
    for (const [k, v] of Object.entries(opts.attrs)) {
      if (v === false || v == null) continue;
      node.setAttribute(k, v === true ? "" : String(v));
    }
  }
  if (opts.on) {
    for (const [evt, fn] of Object.entries(opts.on)) {
      node.addEventListener(evt, fn);
    }
  }
  for (const c of children) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

export function row(label, value) {
  return el("div", { class: "card-row" }, [
    el("span", { class: "card-label", text: label }),
    el("span", { class: "card-value", text: value }),
  ]);
}

export function getView() {
  return document.getElementById("view");
}

export function clearView() {
  const v = getView();
  v.replaceChildren();
  v.scrollTop = 0;
  window.scrollTo({ top: 0 });
  return v;
}

export function labelledInput(label, name, opts = {}) {
  const id = `f-${name}-${Math.random().toString(36).slice(2, 8)}`;
  const wrap = el("label", { class: opts.wrapClass || "form-field", attrs: { for: id } });
  wrap.appendChild(document.createTextNode(label));
  const input = el(opts.tag || "input", {
    id,
    name,
    type: opts.type || "text",
    value: opts.value != null ? String(opts.value) : "",
    placeholder: opts.placeholder || "",
    attrs: opts.attrs || {},
  });
  if (opts.tag === "textarea") {
    input.value = opts.value != null ? String(opts.value) : "";
  }
  if (opts.step != null) input.step = String(opts.step);
  if (opts.min != null) input.min = String(opts.min);
  if (opts.max != null) input.max = String(opts.max);
  if (opts.required) input.required = true;
  wrap.appendChild(input);
  return wrap;
}

export function labelledSelect(label, name, options, opts = {}) {
  const id = `f-${name}-${Math.random().toString(36).slice(2, 8)}`;
  const wrap = el("label", { class: "form-field", attrs: { for: id } });
  wrap.appendChild(document.createTextNode(label));
  const sel = el("select", { id, name });
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    if (opts.value != null && String(opts.value) === String(opt.value)) {
      o.selected = true;
    }
    sel.appendChild(o);
  }
  wrap.appendChild(sel);
  return wrap;
}

export function checkbox(label, name, checked, opts = {}) {
  const id = `f-${name}-${Math.random().toString(36).slice(2, 8)}`;
  const wrap = el("label", { class: "form-check", attrs: { for: id } });
  const input = el("input", { id, name, type: "checkbox", checked: !!checked });
  if (opts.on) {
    for (const [evt, fn] of Object.entries(opts.on)) {
      input.addEventListener(evt, fn);
    }
  }
  wrap.appendChild(input);
  wrap.appendChild(document.createTextNode(" " + label));
  return wrap;
}

export function errorBox(errors) {
  if (!errors || !errors.length) return null;
  const box = el("div", { class: "form-errors", attrs: { role: "alert" } });
  box.appendChild(el("strong", { text: "Please fix the following:" }));
  const ul = el("ul");
  for (const e of errors) ul.appendChild(el("li", { text: e }));
  box.appendChild(ul);
  return box;
}

export function noticeBox(message, kind = "info") {
  return el("div", {
    class: `notice notice-${kind}`,
    text: message,
    attrs: { role: kind === "error" ? "alert" : "status" },
  });
}

// File IO

export function pickFile(accept = ".json,application/json") {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    input.addEventListener("change", () => {
      const f = input.files && input.files[0] ? input.files[0] : null;
      document.body.removeChild(input);
      resolve(f);
    });
    document.body.appendChild(input);
    input.click();
  });
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error || new Error("Failed to read file"));
    r.onload = () => resolve(String(r.result || ""));
    r.readAsText(file);
  });
}

export function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
