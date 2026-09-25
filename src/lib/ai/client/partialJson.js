// Tolerant extraction of a JSON string field from a buffer that may still be
// mid-stream — i.e. the value's closing quote (or even the whole key) hasn't
// arrived yet. Used to show `headline`/`summary` typing live as an OpenAI
// structured-output stream accumulates; this is real partial data, not a
// typewriter animation. Returns the string decoded so far, or null if the
// key hasn't appeared in the buffer at all yet.
const ESCAPES = { n: "\n", t: "\t", r: "\r", '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f" };

export function extractStringField(buffer, key) {
  if (!buffer) return null;
  const marker = `"${key}"`;
  const at = buffer.indexOf(marker);
  if (at === -1) return null;

  let i = at + marker.length;
  while (i < buffer.length && /[\s:]/.test(buffer[i])) i++;
  if (buffer[i] !== '"') return null; // value hasn't started streaming yet
  i++;

  let out = "";
  while (i < buffer.length) {
    const ch = buffer[i];
    if (ch === "\\") {
      const next = buffer[i + 1];
      if (next === undefined) break; // escape sequence cut off mid-stream
      if (next === "u") {
        const hex = buffer.slice(i + 2, i + 6);
        if (hex.length < 4) break; // \uXXXX not fully arrived yet
        out += String.fromCharCode(parseInt(hex, 16));
        i += 6;
        continue;
      }
      out += ESCAPES[next] ?? next;
      i += 2;
      continue;
    }
    if (ch === '"') return out; // properly closed
    out += ch;
    i++;
  }
  return out; // unterminated — whatever streamed in so far
}
