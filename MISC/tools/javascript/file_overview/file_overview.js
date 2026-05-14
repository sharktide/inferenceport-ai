#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = i + 1 < argv.length ? argv[i + 1] : "";
    i += 1;
    if (next === "true") out[key] = true;
    else if (next === "false") out[key] = false;
    else if (next !== "" && !Number.isNaN(Number(next)) && /^-?\d+(\.\d+)?$/.test(next)) out[key] = Number(next);
    else {
      try { out[key] = JSON.parse(next); } catch { out[key] = next; }
    }
  }
  return out;
}

function clampInt(v, d, min, max) {
  const n = Number.isInteger(v) ? v : Number(v);
  if (!Number.isFinite(n)) return d;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function walk(root, rel, depth, maxDepth, includeHidden, maxEntries, out) {
  if (out.length >= maxEntries || depth > maxDepth) return;
  const abs = path.join(root, rel);
  let entries;
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (out.length >= maxEntries) break;
    const name = entry.name;
    if (!includeHidden && name.startsWith(".")) continue;
    const childRel = rel ? path.join(rel, name) : name;
    const childAbs = path.join(root, childRel);
    let size = null;
    let modifiedAt = null;
    try {
      const st = fs.statSync(childAbs);
      size = st.isFile() ? st.size : null;
      modifiedAt = st.mtime.toISOString();
    } catch {}
    out.push({
      path: childRel.replace(/\\/g, "/"),
      type: entry.isDirectory() ? "directory" : (entry.isFile() ? "file" : "other"),
      sizeBytes: size,
      modifiedAt
    });
    if (entry.isDirectory()) {
      walk(root, childRel, depth + 1, maxDepth, includeHidden, maxEntries, out);
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const directory = String(args.directory || ".");
  const workspaceRoot = args.workspace_root ? String(args.workspace_root) : "";
  const maxDepth = clampInt(args.max_depth, 2, 0, 8);
  const maxEntries = clampInt(args.max_entries, 200, 1, 2000);
  const includeHidden = Boolean(args.include_hidden);

  const resolvedDir = path.resolve(directory);
  if (workspaceRoot) {
    const resolvedRoot = path.resolve(String(workspaceRoot));
    if (!resolvedDir.startsWith(resolvedRoot)) {
      throw new Error(`directory must stay within workspace_root (${resolvedRoot})`);
    }
  }

  const out = [];
  walk(resolvedDir, "", 0, maxDepth, includeHidden, maxEntries, out);

  process.stdout.write(JSON.stringify({
    ok: true,
    directory: resolvedDir,
    maxDepth,
    maxEntries,
    returnedEntries: out.length,
    entries: out
  }, null, 2));
}

try { main(); }
catch (err) {
  process.stderr.write(String(err && err.message ? err.message : err));
  process.exit(1);
}
