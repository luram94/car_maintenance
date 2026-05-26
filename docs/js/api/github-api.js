// GitHub Contents API adapter.
// Zero car-maintenance domain knowledge. Returns structured results (never
// throws) and never logs / returns / propagates the PAT.

const API_BASE = "https://api.github.com";

// --------------- Base64 <-> UTF-8 ---------------

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToUtf8(b64) {
  const clean = String(b64).replace(/\s/g, "");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

// Exported for smoke-testing without spinning up a browser.
export const __codec = { utf8ToBase64, base64ToUtf8 };

// --------------- SHA cache ---------------

const _shaMem = new Map();
const SHA_PREFIX = "car-maint:sha:";

function shaKey(config, path) {
  return `${SHA_PREFIX}${config.owner || ""}:${config.repo || ""}:${
    config.branch || "main"
  }:${path}`;
}

export function getStoredSha(config, path) {
  const k = shaKey(config, path);
  if (_shaMem.has(k)) return _shaMem.get(k);
  try {
    const v = localStorage.getItem(k);
    if (v) _shaMem.set(k, v);
    return v || null;
  } catch {
    return null;
  }
}

export function setStoredSha(config, path, sha) {
  const k = shaKey(config, path);
  if (sha) {
    _shaMem.set(k, sha);
    try {
      localStorage.setItem(k, sha);
    } catch {
      /* ignore quota errors */
    }
  } else {
    _shaMem.delete(k);
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

export function clearShaCache() {
  _shaMem.clear();
  try {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(SHA_PREFIX)) toRemove.push(k);
    }
    for (const k of toRemove) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

// --------------- write serialization ---------------

let _saveChain = Promise.resolve();
function serializeSave(fn) {
  const next = _saveChain.then(fn, fn);
  _saveChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

// --------------- request helpers ---------------

function buildContentsUrl(config, path) {
  const owner = encodeURIComponent(config.owner);
  const repo = encodeURIComponent(config.repo);
  const segs = String(path)
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return `${API_BASE}/repos/${owner}/${repo}/contents/${segs}`;
}

function buildRepoUrl(config) {
  return `${API_BASE}/repos/${encodeURIComponent(
    config.owner
  )}/${encodeURIComponent(config.repo)}`;
}

function buildBranchUrl(config) {
  return `${buildRepoUrl(config)}/branches/${encodeURIComponent(
    config.branch || "main"
  )}`;
}

function authHeaders(config) {
  return {
    Authorization: `Bearer ${config.token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function err(opts) {
  return {
    ok: false,
    status: opts.status || 0,
    code: opts.code || "unknown",
    message: opts.message || "",
    details: opts.details || null,
  };
}

function validateConfig(config, { needToken } = {}) {
  if (!config || typeof config !== "object") {
    return err({ code: "config", message: "GitHub config missing." });
  }
  if (!config.owner) return err({ code: "config", message: "Owner is required." });
  if (!config.repo) return err({ code: "config", message: "Repository is required." });
  if (needToken && !config.token) {
    return err({ code: "config", message: "Token is required." });
  }
  return null;
}

// Map an HTTP response to a structured error. Never includes the token in any
// returned string.
function mapHttpError(res, fallbackMessage) {
  const status = res.status;
  if (status === 401) {
    return err({
      status,
      code: "unauthorized",
      message: "Invalid or expired token.",
    });
  }
  if (status === 403) {
    return err({
      status,
      code: "forbidden",
      message:
        "Insufficient permissions, SSO restriction, or rate limit exceeded.",
    });
  }
  if (status === 404) {
    return err({ status, code: "not_found", message: "Resource not found." });
  }
  if (status === 409) {
    return err({
      status,
      code: "conflict",
      message: "Conflict — remote file changed since last load.",
    });
  }
  if (status === 422) {
    return err({
      status,
      code: "validation",
      message: "GitHub rejected the request (validation error).",
    });
  }
  return err({
    status,
    code: "unknown",
    message: fallbackMessage || `Unexpected status ${status}.`,
  });
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// --------------- public API ---------------

export async function loadJsonFile(config, path) {
  const cfgErr = validateConfig(config, { needToken: true });
  if (cfgErr) return cfgErr;
  if (!path) return err({ code: "config", message: "Path is required." });

  const url =
    buildContentsUrl(config, path) +
    `?ref=${encodeURIComponent(config.branch || "main")}`;
  let res;
  try {
    res = await fetch(url, {
      headers: authHeaders(config),
      cache: "no-store",
    });
  } catch {
    return err({
      code: "network",
      message: "Network error contacting GitHub.",
    });
  }

  if (res.status === 404) {
    return err({
      status: 404,
      code: "not_found",
      message: `File not found at ${path}.`,
    });
  }
  if (!res.ok) return mapHttpError(res);

  const body = await safeJson(res);
  if (!body || typeof body !== "object" || typeof body.content !== "string") {
    return err({
      status: res.status,
      code: "invalid_response",
      message: "GitHub response missing content field.",
    });
  }
  let text;
  try {
    text = base64ToUtf8(body.content);
  } catch {
    return err({
      status: res.status,
      code: "decode",
      message: "Could not decode Base64 content as UTF-8.",
    });
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return err({
      status: res.status,
      code: "invalid_json",
      message: "Remote file content is not valid JSON.",
      details: { parserMessage: e && e.message ? String(e.message) : "" },
    });
  }
  setStoredSha(config, path, body.sha);
  return {
    ok: true,
    data,
    sha: body.sha,
    path,
    source: "github",
  };
}

export async function saveJsonFile(config, path, data, message, opts = {}) {
  return serializeSave(async () => {
    const cfgErr = validateConfig(config, { needToken: true });
    if (cfgErr) return cfgErr;
    if (!path) return err({ code: "config", message: "Path is required." });

    let json;
    try {
      json = JSON.stringify(data, null, 2) + "\n";
    } catch {
      return err({ code: "encode", message: "Could not stringify data to JSON." });
    }
    let content;
    try {
      content = utf8ToBase64(json);
    } catch {
      return err({
        code: "encode",
        message: "Could not encode JSON as UTF-8 Base64.",
      });
    }

    const body = {
      message: message || `Update ${path}`,
      content,
      branch: config.branch || "main",
    };

    if (!opts.create) {
      const sha = opts.sha || getStoredSha(config, path);
      if (sha) body.sha = sha;
    }

    let res;
    try {
      res = await fetch(buildContentsUrl(config, path), {
        method: "PUT",
        headers: {
          ...authHeaders(config),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch {
      return err({
        code: "network",
        message: "Network error contacting GitHub.",
      });
    }

    if (res.status === 409) {
      return err({
        status: 409,
        code: "conflict",
        message:
          "Remote file changed since last load (SHA mismatch). Reload or force-save.",
      });
    }
    if (res.status === 422) {
      const ebody = await safeJson(res);
      // GitHub 422 with a sha-related message is effectively a conflict.
      const msg = ebody && ebody.message ? String(ebody.message) : "";
      if (/sha|does not match|already exists/i.test(msg)) {
        return err({
          status: 422,
          code: "conflict",
          message: "Remote file changed (SHA mismatch). Reload or force-save.",
        });
      }
      return err({
        status: 422,
        code: "validation",
        message: "GitHub rejected the request (validation error).",
        details: { githubMessage: msg },
      });
    }
    if (!res.ok) return mapHttpError(res);

    const respBody = await safeJson(res);
    if (!respBody) {
      return err({
        status: res.status,
        code: "invalid_response",
        message: "GitHub response was not JSON.",
      });
    }
    const newSha = respBody.content && respBody.content.sha;
    if (newSha) setStoredSha(config, path, newSha);
    return {
      ok: true,
      sha: newSha,
      path,
      source: "github",
      commitSha: respBody.commit && respBody.commit.sha,
    };
  });
}

export async function testConnection(config) {
  const cfgErr = validateConfig(config, { needToken: true });
  if (cfgErr) return cfgErr;

  const checks = [];

  // 1. Repo
  let repoRes;
  try {
    repoRes = await fetch(buildRepoUrl(config), { headers: authHeaders(config) });
  } catch {
    return err({ code: "network", message: "Network error contacting GitHub." });
  }
  if (repoRes.status === 401) {
    return err({
      status: 401,
      code: "unauthorized",
      message: "Invalid or expired token.",
    });
  }
  if (repoRes.status === 403) {
    return err({
      status: 403,
      code: "forbidden",
      message:
        "Token does not have access to this repository (or rate limit exceeded).",
    });
  }
  if (repoRes.status === 404) {
    return err({
      status: 404,
      code: "not_found",
      message: "Repository not found (check owner/repo and token scope).",
    });
  }
  if (!repoRes.ok) return mapHttpError(repoRes);
  checks.push({ name: "repo", ok: true, message: `Repository ${config.owner}/${config.repo} reachable.` });

  // 2. Branch
  let bRes;
  try {
    bRes = await fetch(buildBranchUrl(config), { headers: authHeaders(config) });
  } catch {
    return err({ code: "network", message: "Network error contacting GitHub." });
  }
  if (bRes.status === 404) {
    checks.push({
      name: "branch",
      ok: false,
      message: `Branch "${config.branch || "main"}" not found.`,
    });
  } else if (!bRes.ok) {
    checks.push({
      name: "branch",
      ok: false,
      message: `Branch check failed: HTTP ${bRes.status}.`,
    });
  } else {
    checks.push({
      name: "branch",
      ok: true,
      message: `Branch "${config.branch || "main"}" reachable.`,
    });
  }

  // 3. Data & plan files
  for (const [name, p] of [
    ["data", config.dataPath],
    ["plan", config.planPath],
  ]) {
    if (!p) {
      checks.push({ name, ok: false, message: `${name} path not configured.` });
      continue;
    }
    const url =
      buildContentsUrl(config, p) +
      `?ref=${encodeURIComponent(config.branch || "main")}`;
    let fRes;
    try {
      fRes = await fetch(url, { headers: authHeaders(config) });
    } catch {
      checks.push({ name, ok: false, message: "Network error." });
      continue;
    }
    if (fRes.ok) {
      checks.push({ name, ok: true, message: `${name} file present at ${p}.` });
    } else if (fRes.status === 404) {
      checks.push({
        name,
        ok: false,
        message: `${name} file missing at ${p} (can be created from local).`,
        missing: true,
      });
    } else if (fRes.status === 403) {
      checks.push({
        name,
        ok: false,
        message: `${name} file check forbidden (HTTP 403). Check permissions.`,
      });
    } else {
      checks.push({
        name,
        ok: false,
        message: `${name} file check failed: HTTP ${fRes.status}.`,
      });
    }
  }

  return { ok: true, checks };
}
