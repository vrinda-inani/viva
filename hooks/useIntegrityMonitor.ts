"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSession } from "@/context/SessionContext";

const DEDupe_MS = 450;

/**
 * Increments integrity alerts when the student leaves the tab (visibility) or
 * the window loses focus (blur). Short debounce avoids double-counting when
 * both events fire for the same user action.
 */
export function useIntegrityMonitor(enabled: boolean) {
  const { incrementIntegrityAlerts } = useSession();
  const lastBumpRef = useRef(0);

  const bump = useCallback(() => {
    const now = Date.now();
    if (now - lastBumpRef.current < DEDupe_MS) {
      return;
    }
    lastBumpRef.current = now;
    incrementIntegrityAlerts();
  }, [incrementIntegrityAlerts]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        bump();
      }
    };

    const onBlur = () => {
      bump();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
  }, [enabled, bump]);
}
