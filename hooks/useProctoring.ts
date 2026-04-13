"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useSession } from "@/context/SessionContext";

/** End session when tab hides exceed this (4th hide => count 4). */
export const MAX_TAB_SWITCHES_BEFORE_END = 3;

export type UseProctoringOptions = {
  enabled: boolean;
  requireFullscreen?: boolean;
  onRecordingPause?: (paused: boolean) => void;
  /** When set, `requestFullscreen` targets this node (e.g. interview shell with camera preview). */
  fullscreenRootRef?: RefObject<HTMLElement | null>;
};

export type UseProctoringResult = {
  toastMessage: string | null;
  dismissToast: () => void;
  focusLost: boolean;
  needsFullscreen: boolean;
  requestFullscreen: () => Promise<void>;
  isFullscreen: boolean;
};

function isDocFullscreen(): boolean {
  return Boolean(document.fullscreenElement);
}

/**
 * visibility:hidden → toast + tab switch count; &gt;3 → end session.
 * blur/focus → overlay + blur segment timestamps in session metadata.
 * fullscreen exit → pause recording + timestamp in metadata.
 */
export function useProctoring(options: UseProctoringOptions): UseProctoringResult {
  const {
    enabled,
    requireFullscreen = true,
    onRecordingPause,
    fullscreenRootRef,
  } = options;
  const {
    finalizeVivaSession,
    tabSwitchCount,
    setTabSwitchCount,
    recordBlurAt,
    closeBlurWithFocus,
    recordFullscreenExit,
  } = useSession();

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [focusLost, setFocusLost] = useState(false);
  const [needsFullscreen, setNeedsFullscreen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalizeQueuedRef = useRef(false);
  const wasFullscreenRef = useRef(false);
  const prevTabSwitchRef = useRef(0);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToastMessage(null);
  }, []);

  const showToast = useCallback(
    (msg: string) => {
      dismissToast();
      setToastMessage(msg);
      toastTimerRef.current = setTimeout(() => {
        setToastMessage(null);
        toastTimerRef.current = null;
      }, 5000);
    },
    [dismissToast],
  );

  useEffect(() => {
    if (!enabled) {
      setFocusLost(false);
      setNeedsFullscreen(false);
      setIsFullscreen(false);
      wasFullscreenRef.current = false;
      finalizeQueuedRef.current = false;
      dismissToast();
      return;
    }

    const syncFullscreen = () => {
      const fs = isDocFullscreen();
      setTimeout(() => {
        setIsFullscreen(fs);
        if (requireFullscreen) {
          setNeedsFullscreen(!fs);
        }
        if (wasFullscreenRef.current && !fs) {
          onRecordingPause?.(true);
          recordFullscreenExit(Date.now());
        } else if (fs) {
          onRecordingPause?.(false);
        }
        wasFullscreenRef.current = fs;
      }, 0);
    };

    syncFullscreen();
    document.addEventListener("fullscreenchange", syncFullscreen);

    const onVisibility = () => {
      if (document.visibilityState !== "hidden") {
        return;
      }
      setTabSwitchCount((c) => c + 1);
    };

    const onBlur = () => {
      setFocusLost(true);
      recordBlurAt(Date.now());
    };

    const onFocus = () => {
      setFocusLost(false);
      closeBlurWithFocus(Date.now());
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);

    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, [
    enabled,
    requireFullscreen,
    setTabSwitchCount,
    recordBlurAt,
    closeBlurWithFocus,
    recordFullscreenExit,
    onRecordingPause,
    dismissToast,
  ]);

  useEffect(() => {
    if (!enabled) {
      prevTabSwitchRef.current = tabSwitchCount;
      return;
    }
    if (tabSwitchCount <= prevTabSwitchRef.current) {
      prevTabSwitchRef.current = tabSwitchCount;
      return;
    }
    const n = tabSwitchCount;
    setTimeout(() => {
      showToast(`Stay on this tab during the viva. Tab switch recorded (${n}).`);
      if (n > MAX_TAB_SWITCHES_BEFORE_END && !finalizeQueuedRef.current) {
        finalizeQueuedRef.current = true;
        showToast("Maximum tab switches exceeded. Ending session.");
        queueMicrotask(() => {
          void finalizeVivaSession();
        });
      }
    }, 0);
    prevTabSwitchRef.current = tabSwitchCount;
  }, [tabSwitchCount, enabled, showToast, finalizeVivaSession]);

  const requestFullscreen = useCallback(async () => {
    try {
      const el = fullscreenRootRef?.current ?? document.documentElement;
      if (!el) {
        showToast("Interview panel is not ready yet.");
        return;
      }
      await el.requestFullscreen();
      setNeedsFullscreen(false);
      onRecordingPause?.(false);
    } catch {
      showToast(
        "Fullscreen could not be enabled. Try again or check browser permissions.",
      );
    }
  }, [fullscreenRootRef, onRecordingPause, showToast]);

  return {
    toastMessage,
    dismissToast,
    focusLost,
    needsFullscreen: enabled && needsFullscreen,
    requestFullscreen,
    isFullscreen,
  };
}
