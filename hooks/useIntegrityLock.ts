"use client";

import { useEffect, useState } from "react";

/**
 * Integrity lock: tab blur dims the UI (full implementation in Session view).
 */
export function useIntegrityLock(enabled: boolean) {
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setLocked(false);
      return;
    }
    const onBlur = () => setLocked(true);
    const onFocus = () => setLocked(false);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled]);

  return locked;
}
