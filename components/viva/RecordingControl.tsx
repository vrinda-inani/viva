"use client";

import { useEffect, useRef, type MutableRefObject } from "react";

function roseStrokeColor(): string {
  if (typeof window === "undefined") {
    return "#b29692";
  }
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--viva-rose")
    .trim();
  return v || "#b29692";
}

type RecordingControlProps = {
  analyserRef: MutableRefObject<AnalyserNode | null>;
  /** True only while MediaRecorder is actively recording (not paused / inactive). */
  isRecording: boolean;
  className?: string;
};

/**
 * Canvas waveform driven by Web Audio AnalyserNode; animates only while recording.
 */
export function RecordingControl({
  analyserRef,
  isRecording,
  className = "",
}: RecordingControlProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const drawIdle = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = roseStrokeColor();
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    if (!isRecording) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      drawIdle();
      return;
    }

    const animate = () => {
      const a = analyserRef.current;
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, w, h);

      if (!a) {
        drawIdle();
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      const bufferLength = a.fftSize;
      const data = new Uint8Array(bufferLength);
      a.getByteTimeDomainData(data);

      ctx.lineWidth = 2;
      ctx.strokeStyle = roseStrokeColor();
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      const slice = w / Math.max(1, bufferLength - 1);
      const mid = h / 2;
      const amp = mid - 3;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const raw = data[i] ?? 128;
        const norm = (raw - 128) / 128;
        const y = mid - norm * amp;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += slice;
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [isRecording, analyserRef]);

  return (
    <canvas
      ref={canvasRef}
      width={640}
      height={56}
      className={className}
      aria-label="Voice waveform"
    />
  );
}
