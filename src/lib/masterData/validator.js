

import { getActiveValueSet, getKnownValueSet } from "@/lib/masterData";

export function masterDataEnum(kind, path) {
  return {
    validate: {
      validator: async function (value) {
        if (value === undefined || value === null || value === "") return true;

        const isDoc = typeof this?.isModified === "function";
        if (isDoc && !this.isNew && !this.isModified(path)) return true;

        try {
          const active = await getActiveValueSet(kind);
          if (active.size === 0) return true; 
          if (active.has(value)) return true;

          if (!isDoc) {
            const known = await getKnownValueSet(kind);
            return known.has(value);
          }
          return false;
        } catch {
          
          
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
