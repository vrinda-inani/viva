"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RecordingControl } from "@/components/viva/RecordingControl";
import { useMediaStream } from "@/lib/hooks/useMediaStream";

const LIVE_GOLD = "#C5A059";
const BLOB_LOG_MS = 3000;

type RecordingPanelProps = {
  /** When false, releases camera/mic and stops MediaRecorder. */
  enabled: boolean;
  /** Pause/resume MediaRecorder (e.g. user exited fullscreen). */
  paused?: boolean;
  className?: string;
  videoClassName?: string;
  /** Fires when MediaRecorder enters/leaves the "recording" state. */
  onLiveChange?: (isLive: boolean) => void;
  /** Latest getUserMedia stream (for diagnostics). */
  onMediaStreamChange?: (stream: MediaStream | null) => void;
};

function pickRecorderMime(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "audio/webm;codecs=opus",
  ];
  for (const m of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) {
      return m;
    }
  }
  return "";
}

/**
 * Camera + mic preview, waveform, MediaRecorder sanity (blob size logs), LIVE badge.
 */
export function RecordingPanel({
  enabled,
  paused = false,
  className = "",
  videoClassName = "h-full w-full min-h-[220px] object-cover",
  onLiveChange,
  onMediaStreamChange,
}: RecordingPanelProps) {
  const onMediaStreamChangeRef = useRef(onMediaStreamChange);
  onMediaStreamChangeRef.current = onMediaStreamChange;

  const emitStream = useCallback((s: MediaStream | null) => {
    onMediaStreamChangeRef.current?.(s);
  }, []);

  const { stream, videoRef, error: streamError } = useMediaStream(
    enabled,
    emitStream,
  );

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const logIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isLive, setIsLive] = useState(false);
  const [recorderError, setRecorderError] = useState<string | null>(null);

  const error = streamError ?? recorderError;

  useEffect(() => {
    onLiveChange?.(isLive);
  }, [isLive, onLiveChange]);

  const teardownRecorder = useCallback(() => {
    if (logIntervalRef.current) {
      clearInterval(logIntervalRef.current);
      logIntervalRef.current = null;
    }
    try {
      recorderRef.current?.stop();
    } catch {
      /* ignore */
    }
    recorderRef.current = null;
    chunksRef.current = [];
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    setIsLive(false);
  }, []);

  useEffect(() => {
    if (!enabled || !stream) {
      teardownRecorder();
      setRecorderError(null);
      return;
    }

    setRecorderError(null);
    let cancelled = false;

    void (async () => {
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      await audioCtx.resume();
      if (cancelled) {
        void audioCtx.close().catch(() => {});
        return;
      }

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mime = pickRecorderMime();
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };
      recorder.onstart = () => setIsLive(true);
      recorder.onstop = () => setIsLive(false);
      recorder.onpause = () => setIsLive(false);
      recorder.onresume = () => setIsLive(true);

      try {
        recorder.start(1000);
        recorderRef.current = recorder;
      } catch (e) {
        if (!cancelled) {
          setRecorderError(
            e instanceof Error ? e.message : "Could not start recorder",
          );
        }
        void audioCtx.close().catch(() => {});
        return;
      }

      logIntervalRef.current = setInterval(() => {
        const parts = chunksRef.current;
        const type = recorder.mimeType || "application/octet-stream";
        const blob = new Blob(parts, { type });
        console.log("[Recording sanity] Blob size (bytes):", blob.size);
      }, BLOB_LOG_MS);
    })();

    return () => {
      cancelled = true;
      teardownRecorder();
    };
  }, [enabled, stream, teardownRecorder]);

  useEffect(() => {
    const r = recorderRef.current;
    if (!r || r.state === "inactive") {
      return;
    }
    try {
      if (paused) {
        if (r.state === "recording" && typeof r.pause === "function") {
          r.pause();
        }
      } else if (r.state === "paused" && typeof r.resume === "function") {
        r.resume();
      }
    } catch {
      /* ignore */
    }
  }, [paused, enabled]);

  return (
    <div className={`relative z-[20] flex flex-col overflow-hidden bg-black ${className}`}>
      <div className="relative isolate z-[1] min-h-0 flex-1 overflow-hidden bg-black">
        <video
          ref={videoRef}
          className={`relative z-[1] scale-x-[-1] ${videoClassName}`}
          playsInline
          muted
          autoPlay
        />
        <div className="pointer-events-none absolute inset-0 z-[3] bg-gradient-to-t from-black/50 to-transparent" />
      </div>
      <div className="relative z-[4] shrink-0 border-t border-white/10 bg-viva-near-black px-2 py-2">
        <RecordingControl
          analyserRef={analyserRef}
          isRecording={isLive && !paused && enabled}
          className="h-14 w-full max-w-full"
        />
        {error ? (
          <p className="px-1 pt-1 text-center text-[10px] text-red-400">{error}</p>
        ) : null}
      </div>
    </div>
  );
}

export function RecordingLiveBadge({ visible }: { visible: boolean }) {
  if (!visible) {
    return null;
  }
  return (
    <span
      className="rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest"
      style={{
        color: LIVE_GOLD,
        borderColor: LIVE_GOLD,
        backgroundColor: "rgba(197, 160, 89, 0.12)",
      }}
    >
      Live
    </span>
  );
}

export { LIVE_GOLD };
