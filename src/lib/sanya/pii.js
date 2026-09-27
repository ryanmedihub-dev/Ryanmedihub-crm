

const DENIED_KEY = /^(name|fullName|firstName|lastName|patientName|employeeName|agentName|agent|counsellor|doctor|phone|mobile|contactNumber|phoneNormalized|email|address|tlName|managerName|markedBy|enteredBy|lastUpdatedBy|createdBy|assignedTo|reference|userEmail|whatsapp|aadhar|pan)$/i;

const PHONE_RE = /(?<!\d)[6-9]\d{9}(?!\d)/;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export class PIIError extends Error {
  constructor(message) {
    super(message);
    this.name = "PIIError";
  }
}

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
