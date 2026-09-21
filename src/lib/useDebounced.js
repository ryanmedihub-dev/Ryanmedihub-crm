"use client";

import { useEffect, useState } from "react";

/**
 * Trailing-edge value debounce: returns `value` only after it has stopped changing
 * for `ms`. For search boxes that drive a fetch — debounce the query, not the handler.
 */
export function useDebounced(value, ms = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export default useDebounced;
