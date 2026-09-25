// Runnable self-check for src/lib/ai/client/partialJson.js's escape/streaming
// handling. `node scripts/check-partial-json.mjs`.
import assert from "node:assert/strict";
import { extractStringField } from "../src/lib/ai/client/partialJson.js";

// Key not in buffer yet.
assert.equal(extractStringField('{"foo":1', "headline"), null);

// Complete field.
assert.equal(extractStringField('{"headline":"Agents are up","summary":"x"}', "headline"), "Agents are up");

// Still streaming — no closing quote yet.
assert.equal(extractStringField('{"headline":"Agents are u', "headline"), "Agents are u");

// Escaped quote and backslash, still mid-stream.
assert.equal(extractStringField('{"headline":"Say \\"hi\\" to E01', "headline"), 'Say "hi" to E01');

// Escape sequence cut off at the buffer boundary — stop before it, don't crash.
assert.equal(extractStringField('{"headline":"ends with backslash\\', "headline"), "ends with backslash");

// Unicode escape.
assert.equal(extractStringField('{"headline":"caf\\u00e9"}', "headline"), "café");

console.log("partialJson: all checks passed");
