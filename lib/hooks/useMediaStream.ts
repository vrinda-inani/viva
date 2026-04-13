"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

const CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: "user",
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
  },
};

export type UseMediaStreamResult = {
  stream: MediaStream | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  error: string | null;
};

/**
 * Acquires camera/mic when enabled. On fullscreen, resize, and visibility resume,
 * re-assigns srcObject and calls play() so the preview survives layout changes.
 */
export function useMediaStream(
  enabled: boolean,
  onStreamChange?: (stream: MediaStream | null) => void,
): UseMediaStreamResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const notify = useCallback(
    (s: MediaStream | null) => {
      streamRef.current = s;
      setStream(s);
      onStreamChange?.(s);
    },
    [onStreamChange],
  );

  const attachToVideo = useCallback(async () => {
    const s = streamRef.current;
    const v = videoRef.current;
    if (!s || !v) {
      return;
    }
    if (v.srcObject !== s) {
      v.srcObject = s;
    }
    try {
      await v.play();
    } catch {
      /* autoplay / visibility */
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      notify(null);
      const v = videoRef.current;
      if (v) {
        v.srcObject = null;
      }
      setError(null);
      return;
    }

    let cancelled = false;
    setError(null);

    void (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia(CONSTRAINTS);
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = s;
        notify(s);
        await attachToVideo();
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "Could not access camera or microphone",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      notify(null);
      const v = videoRef.current;
      if (v) {
        v.srcObject = null;
      }
    };
  }, [enabled, notify, attachToVideo]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const onFullscreenOrResize = () => {
      void attachToVideo();
    };

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const onResizeDebounced = () => {
      if (resizeTimer) {
        clearTimeout(resizeTimer);
      }
      resizeTimer = setTimeout(() => void attachToVideo(), 150);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void attachToVideo();
      }
    };

    document.addEventListener("fullscreenchange", onFullscreenOrResize);
    window.addEventListener("resize", onResizeDebounced);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenOrResize);
      window.removeEventListener("resize", onResizeDebounced);
      document.removeEventListener("visibilitychange", onVisibility);
      if (resizeTimer) {
        clearTimeout(resizeTimer);
      }
    };
  }, [enabled, attachToVideo]);

  return { stream, videoRef, error };
}
