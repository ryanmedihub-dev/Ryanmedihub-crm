// Node ESM loader hook that resolves the app's "@/*" -> "src/*" alias (defined for Next's
// bundler in jsconfig.json) so these plain Node scripts can import entryEngine/entryCore
// modules directly, unmodified. No new dependency — this is ~15 lines of the Node
// `node:module` loader API the runtime already ships.
//
// Usage:  node --env-file=.env --experimental-loader ./scripts/entry-acceptance/_alias-loader.mjs <script>.mjs
// (Node may print an ExperimentalWarning for --experimental-loader; that's expected and harmless.)

import { pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const target = path.join(ROOT, "src", specifier.slice(2));
    return nextResolve(pathToFileURL(target).href, context);
  }
  return nextResolve(specifier, context);
}
