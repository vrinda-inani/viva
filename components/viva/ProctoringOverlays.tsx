"use client";

type ProctorToastProps = {
  message: string | null;
  onDismiss: () => void;
};

export function ProctorToast({ message, onDismiss }: ProctorToastProps) {
  if (!message) {
    return null;
  }
  return (
    <div
      className="pointer-events-auto fixed bottom-8 left-1/2 z-[800] max-w-md -translate-x-1/2 px-4"
      role="status"
    >
      <div className="flex items-start gap-3 rounded-lg border border-amber-700/50 bg-viva-near-black/95 px-4 py-3 text-sm text-amber-100 shadow-viva-float backdrop-blur-sm">
        <p className="flex-1">{message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-amber-400/80 hover:text-amber-200"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export function FocusLostOverlay() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[500] flex items-center justify-center bg-black/50 backdrop-blur-md"
      aria-hidden
    >
      <p className="pointer-events-none max-w-lg px-6 text-center font-display text-2xl font-medium tracking-tight text-white">
        Interview Paused: Focus Lost
      </p>
    </div>
  );
}

type FullscreenGateProps = {
  onEnter: () => void | Promise<void>;
};

export function FullscreenGate({ onEnter }: FullscreenGateProps) {
  return (
    <div className="fixed inset-0 z-[600] flex flex-col items-center justify-center gap-6 bg-viva-near-black/95 px-6 text-center backdrop-blur-sm">
      <p className="font-display text-2xl font-medium text-viva-white md:text-3xl">
        Enter fullscreen to begin
      </p>
      <p className="max-w-md text-sm text-viva-grey-mid">
        This session runs in fullscreen proctoring mode. Press the button below, then
        keep this window focused until you finish.
      </p>
      <button
        type="button"
        onClick={() => void onEnter()}
        className="rounded-lg border border-viva-grey-200 bg-viva-white px-8 py-3 text-sm font-semibold text-viva-near-black shadow-viva-float transition-colors hover:bg-viva-grey-100"
      >
        Enter fullscreen
      </button>
    </div>
  );
}

const ROSE_GREY = "#B29692";

type ViolationOverlayProps = {
  variant: "fullscreen" | "focus";
  onResume: () => void | Promise<void>;
};

/**
 * Post-start proctoring violation: red wash + resume (rose) vs neutral launch overlay.
 */
export function ViolationOverlay({ variant, onResume }: ViolationOverlayProps) {
  const headline =
    variant === "fullscreen"
      ? "INTERVIEW PAUSED: Fullscreen Exit Detected."
      : "INTERVIEW PAUSED: This tab lost focus.";
  const sub =
    variant === "fullscreen"
      ? "Return to fullscreen to continue. Leaving fullscreen is logged for this session."
      : "Click Resume and keep this window focused until you finish the viva.";

  return (
    <div
      className="fixed inset-0 z-[620] flex flex-col items-center justify-center gap-5 px-6 text-center backdrop-blur-sm"
      style={{ backgroundColor: "rgba(220, 38, 38, 0.1)" }}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="violation-title"
    >
      <div className="max-w-lg rounded-lg border border-red-900/25 bg-viva-near-black/90 px-6 py-8 shadow-viva-float">
        <p
          id="violation-title"
          className="font-display text-xl font-medium tracking-tight text-viva-white md:text-2xl"
        >
          {headline}
        </p>
        <p className="mt-3 text-sm text-viva-grey-mid">{sub}</p>
        <button
          type="button"
          onClick={() => void onResume()}
          className="mt-6 rounded-lg border-2 px-8 py-2.5 text-sm font-semibold uppercase tracking-widest text-viva-white transition-opacity hover:opacity-90"
          style={{ borderColor: ROSE_GREY, color: ROSE_GREY, backgroundColor: "transparent" }}
        >
          Resume Session
        </button>
      </div>
    </div>
  );
}
