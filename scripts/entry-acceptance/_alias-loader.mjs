// Node ESM loader hook that resolves the app's "@/*" -> "src/*" alias (defined for Next's
// bundler in jsconfig.json) so plain Node scripts can import app modules unmodified. No new
// dependency — just the Node `node:module` loader API the runtime already ships.
//
// It also does the extension / index resolution the bundler does implicitly — for both "@/…"
// and relative ("./x", "../x") specifiers — so an app file that imports "./Transactions"
// (no ".js") still resolves when pulled in from a script.
//
// Usage:  node --experimental-loader ./scripts/entry-acceptance/_alias-loader.mjs <script>.mjs
// (Node may print an ExperimentalWarning for --experimental-loader; that's expected.)

import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../");
const SUFFIXES = ["", ".js", ".mjs", ".cjs", ".json", "/index.js", "/index.mjs"];

function resolveOnDisk(basePath) {
  for (const suffix of SUFFIXES) {
    const p = basePath + suffix;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = path.join(ROOT, "src", specifier.slice(2));
    return nextResolve(pathToFileURL(resolveOnDisk(base) || base).href, context);
  }

  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const base = path.resolve(parentDir, specifier);
    const hit = resolveOnDisk(base);
    if (hit) return nextResolve(pathToFileURL(hit).href, context);
  }

  return nextResolve(specifier, context);
}
