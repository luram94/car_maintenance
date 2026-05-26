// Dev quality gate: `node --check` every JS module under docs/js, and
// JSON.parse every JSON under docs/data. Discovers files dynamically so it
// does not need editing when modules move within the docs/ tree.

import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

function walk(dir, ext, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (p.endsWith(ext)) out.push(p);
  }
  return out;
}

const jsFiles = walk("docs/js", ".js");
for (const f of jsFiles) {
  execFileSync(process.execPath, ["--check", f], { stdio: "inherit" });
}
console.log(`JS OK (${jsFiles.length} files)`);

const jsonFiles = walk("docs/data", ".json");
for (const f of jsonFiles) {
  JSON.parse(readFileSync(f, "utf8"));
}
console.log(`JSON OK (${jsonFiles.length} files)`);
