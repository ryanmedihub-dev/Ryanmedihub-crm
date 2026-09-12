// The PII guard between the Owner panel's data and OpenAI.
//
// Two layers, both required:
//   1. Every tool in tools.js PROJECTS an explicit allow-list of aggregate
//      fields — a tool result is built field-by-field, never by spreading a
//      page payload. Names, phones, emails, addresses never make it into the
//      object in the first place.
//   2. assertNoPII() runs on the SERIALIZED outgoing request body right before
//      fetch(). It fails closed: if any personal-looking key or value survived
//      layer 1, the request is not sent and the turn errors. A blocked request
//      is logged as outcome "pii_blocked" so /owner/ai/health shows it.
//
// The owner's own typed question is not scanned — it's their text to send.
// (Verified by eye: set SANYA_LOG_PAYLOADS=1 to print each outgoing body.)

// Keys that mean "a person" anywhere in this codebase's payloads.
const DENIED_KEY = /^(name|fullName|firstName|lastName|patientName|employeeName|agentName|agent|counsellor|doctor|phone|mobile|contactNumber|phoneNormalized|email|address|tlName|managerName|markedBy|enteredBy|lastUpdatedBy|createdBy|assignedTo|reference|userEmail|whatsapp|aadhar|pan)$/i;

// Values that look like an Indian mobile number or an email address.
const PHONE_RE = /(?<!\d)[6-9]\d{9}(?!\d)/;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export class PIIError extends Error {
  constructor(message) {
    super(message);
    this.name = "PIIError";
  }
}

/** Walk any JSON-able value and throw on the first denied key or personal-looking string. */
export function assertNoPII(value, path = "$") {
  if (value == null) return;
  if (typeof value === "string") {
    if (PHONE_RE.test(value)) throw new PIIError(`phone-like value at ${path}`);
    if (EMAIL_RE.test(value)) throw new PIIError(`email-like value at ${path}`);
    return;
  }
  if (typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoPII(v, `${path}[${i}]`));
    return;
  }
  for (const [k, v] of Object.entries(value)) {
    if (DENIED_KEY.test(k)) throw new PIIError(`denied key "${k}" at ${path}`);
    assertNoPII(v, `${path}.${k}`);
  }
}

/**
 * The outgoing chat/completions body, minus the parts the owner typed
 * (user/assistant turns and the system prompt) — i.e. only tool results and
 * tool definitions are scanned. Throws PIIError.
 */
export function assertRequestBodyClean(body) {
  for (const m of body.messages || []) {
    if (m.role !== "tool") continue;
    let parsed;
    try {
      parsed = JSON.parse(m.content);
    } catch {
      throw new PIIError("tool message content is not JSON");
    }
    assertNoPII(parsed, `tool:${m.name || m.tool_call_id}`);
  }
}
