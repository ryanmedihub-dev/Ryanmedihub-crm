// The grandfathering validator that replaces the static Mongoose `enum`s on the
// master-data-backed fields (feature note §0.1). A schema `enum` is fixed at import time, but
// the list now changes at runtime — so validation moved here.
//
// A value passes if any of:
//   - it is empty (let the field's own `required` decide),
//   - it is unchanged on an existing document — a retired value stays valid on the documents
//     that already hold it, so loading and re-saving an old record never fails,
//   - it is an active value in the matching MasterData list,
//   - nothing is seeded for that kind yet (fresh env / emptied collection — degrade to "accept"
//     so the app keeps working, matching the literal-array fallback in the constants files).
//
// On update-by-query (findOneAndUpdate / updateOne with runValidators) the prior document is
// not visible, so we accept any *known* value (active or retired) and reject only strings that
// were never a master value — enough to stop a typo without blocking a legitimate re-save.

import { getActiveValueSet, getKnownValueSet } from "@/lib/masterData";

/**
 * @param {string} kind   one of the MasterData kinds, e.g. "ACCOUNT", "PAYMENT_METHOD".
 * @param {string} path   the schema path this validator sits on, e.g. "account", "fromAccount",
 *                         "method". Needed because a Mongoose validator can't read its own path,
 *                         and we use it for the "unchanged on an existing doc" grandfather check.
 * @returns {{ validate: { validator: Function, message: Function } }} spread into the field.
 */
export function masterDataEnum(kind, path) {
  return {
    validate: {
      validator: async function (value) {
        if (value === undefined || value === null || value === "") return true;

        const isDoc = typeof this?.isModified === "function";
        if (isDoc && !this.isNew && !this.isModified(path)) return true;

        try {
          const active = await getActiveValueSet(kind);
          if (active.size === 0) return true; // nothing seeded — don't block writes
          if (active.has(value)) return true;

          if (!isDoc) {
            const known = await getKnownValueSet(kind);
            return known.has(value);
          }
          return false;
        } catch {
          // Cache/DB unavailable — fail open. The field it replaced (a static enum) never had
          // a DB dependency, so a transient outage must not block financial writes.
          return true;
        }
      },
      message: (props) =>
        `"${props.value}" is not a currently-valid ${kind
          .toLowerCase()
          .replace(/_/g, " ")}. Pick an active value, or add it in ` +
        `Admin → Settings → Master Data. (A retired value is still allowed on records that ` +
        `already use it, but can't be chosen for a new one.)`,
    },
  };
}
