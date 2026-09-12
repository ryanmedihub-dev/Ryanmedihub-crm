// Node ESM loader hooks for scripts/bench/owner-endpoints.mjs.
//   • "@/x"  -> <repo>/src/x   (mirrors jsconfig paths; tries .js/.jsx/.mjs/index.js)
//   • "next-auth/next" and "@/app/api/auth/[...nextauth]/route" -> a stub that
//     returns an owner session, so the REAL route handlers run end-to-end
//     (auth gate → Mongo → callby → JSON) without an HTTP server or a login.
// Nothing here touches production code.
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.join(ROOT, "src");
const STUB = pathToFileURL(path.join(ROOT, "scripts", "bench", "session-stub.mjs")).href;

const EXT = ["", ".js", ".jsx", ".mjs", ".ts", "/index.js", "/index.jsx"];
function resolveFile(base) {
  for (const e of EXT) {
    const p = base + e;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier === "next/server") {
    return next("next/server.js", context);
  }
  if (specifier === "next-auth/next" || specifier === "@/app/api/auth/[...nextauth]/route") {
    return { url: STUB, shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    const file = resolveFile(path.join(SRC, specifier.slice(2)));
    if (!file) throw new Error(`bench loader: cannot resolve ${specifier}`);
    return { url: pathToFileURL(file).href, shortCircuit: true };
  }
  // Relative imports inside src/ that omit the extension (Next tolerates this).
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    const base = path.join(path.dirname(fileURLToPath(context.parentURL)), specifier);
    if (!path.extname(base) || !fs.existsSync(base)) {
      const file = resolveFile(base);
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
  }
  return next(specifier, context);
}

// .jsx files under src/ are plain JS for the routes we bench (no JSX in lib code
// paths). Register them as "module" so Node will load them.
export async function load(url, context, next) {
  if (url.endsWith(".jsx")) {
    const source = fs.readFileSync(fileURLToPath(url), "utf8");
    return { format: "module", source, shortCircuit: true };
  }
  return next(url, context);
}
