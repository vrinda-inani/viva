"use client";

import { Eye, EyeOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const INITIAL_SECONDS = 3 * 60;
const FORCE_SHOW_THRESHOLD = 10;

function formatMmSs(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type ZenTimerProps = {
  /** Countdown runs only while the interview is active. */
  isActive: boolean;
  /** Fires once when the countdown first reaches 0:00 for this active stint. */
  onReachZero?: () => void;
};

/**
 * Fixed top-right zen countdown. User can hide digits until the last 10 seconds,
 * when the timer fades in with a soft rose-grey pulse.
 */
export function ZenTimer({ isActive, onReachZero }: ZenTimerProps) {
  const [remaining, setRemaining] = useState(INITIAL_SECONDS);
  const [digitsHidden, setDigitsHidden] = useState(false);
  const [enterReveal, setEnterReveal] = useState(false);
  const prevRemaining = useRef(remaining);
  const zeroFiredRef = useRef(false);

  useEffect(() => {
    if (!isActive) {
      zeroFiredRef.current = false;
      setRemaining(INITIAL_SECONDS);
      setDigitsHidden(false);
      setEnterReveal(false);
      prevRemaining.current = INITIAL_SECONDS;
      return;
    }

    zeroFiredRef.current = false;
    const id = window.setInterval(() => {
      setRemaining((r) => (r <= 1 ? 0 : r - 1));
    }, 1000);

    return () => window.clearInterval(id);
  }, [isActive]);

  useEffect(() => {
    if (!isActive || remaining !== 0 || zeroFiredRef.current) {
      return;
    }
    zeroFiredRef.current = true;
    onReachZero?.();
  }, [isActive, remaining, onReachZero]);

  const inFinalPhase = remaining <= FORCE_SHOW_THRESHOLD;
  const showDigits = !digitsHidden || inFinalPhase;
  const showPeekControl = digitsHidden && remaining > FORCE_SHOW_THRESHOLD;

  useEffect(() => {
    const prev = prevRemaining.current;
    if (
      digitsHidden &&
      prev > FORCE_SHOW_THRESHOLD &&
      remaining <= FORCE_SHOW_THRESHOLD &&
      remaining > 0
    ) {
      setEnterReveal(true);
      const t = window.setTimeout(() => setEnterReveal(false), 700);
      prevRemaining.current = remaining;
      return () => window.clearTimeout(t);
    }
    prevRemaining.current = remaining;
    return undefined;
  }, [remaining, digitsHidden]);

  const toggleHidden = useCallback(() => {
    setDigitsHidden((h) => !h);
  }, []);

  if (!isActive) {
    return null;
  }

  return (
    <div
      className="pointer-events-auto fixed top-6 right-6 z-[100] flex flex-col items-end gap-2"
      role="timer"
      aria-live={inFinalPhase ? "assertive" : "polite"}
      aria-label={`Time remaining ${formatMmSs(remaining)}`}
    >
      {showPeekControl ? (
        <button
          type="button"
          onClick={toggleHidden}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-viva-grey-200 bg-viva-white/95 text-viva-grey-mid shadow-viva-float backdrop-blur-sm transition-colors hover:border-viva-grey-mid hover:text-viva-near-black"
          aria-label="Show timer"
        >
          <Eye className="h-4 w-4" strokeWidth={1.5} />
        </button>
      ) : null}

      {showDigits ? (
        <div
          className={`flex items-center gap-3 rounded-full border border-viva-grey-200 bg-viva-white/95 px-4 py-2 shadow-viva-float backdrop-blur-sm ${
            enterReveal ? "animate-viva-timer-enter" : ""
          } ${inFinalPhase && remaining > 0 ? "animate-viva-rose-pulse" : ""}`}
        >
          <span
            className="min-w-[3.25rem] tabular-nums text-sm font-medium tracking-tight text-viva-grey-700"
            suppressHydrationWarning
          >
            {formatMmSs(remaining)}
          </span>
          {remaining > FORCE_SHOW_THRESHOLD ? (
            <button
              type="button"
              onClick={toggleHidden}
              className="text-viva-grey-mid transition-colors hover:text-viva-near-black"
              aria-label={digitsHidden ? "Show timer" : "Hide timer"}
            >
              {digitsHidden ? (
                <Eye className="h-4 w-4" strokeWidth={1.5} />
              ) : (
                <EyeOff className="h-4 w-4" strokeWidth={1.5} />
              )}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
