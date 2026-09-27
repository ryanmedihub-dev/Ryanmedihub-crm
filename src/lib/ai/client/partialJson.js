

const ESCAPES = { n: "\n", t: "\t", r: "\r", '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f" };

export function extractStringField(buffer, key) {
  if (!buffer) return null;
  const marker = `"${key}"`;
  const at = buffer.indexOf(marker);
  if (at === -1) return null;

  let i = at + marker.length;
  while (i < buffer.length && /[\s:]/.test(buffer[i])) i++;
  if (buffer[i] !== '"') return null; 
  i++;

  let out = "";
  while (i < buffer.length) {
    const ch = buffer[i];
    if (ch === "\\") {
      const next = buffer[i + 1];
      if (next === undefined) break; 
      if (next === "u") {
        const hex = buffer.slice(i + 2, i + 6);
        if (hex.length < 4) break; 
        out += String.fromCharCode(parseInt(hex, 16));
        i += 6;
        continue;
      }
      out += ESCAPES[next] ?? next;
      i += 2;
      continue;
    }
    if (ch === '"') return out; 
    out += ch;
    i++;
  }
  return out; 
}
