"use client";

const MUTED_GOLD = "#C5A059";

type InterviewerStatusProps = {
  personaTitle: string;
  personaFocus: string | null;
  subjectLabel: string;
  /** 0–1 classification confidence */
  confidence: number;
};

/**
 * Observer corner: hairline card, muted gold match %, mono metadata, Playfair persona.
 */
export function InterviewerStatus({
  personaTitle,
  personaFocus,
  subjectLabel,
  confidence,
}: InterviewerStatusProps) {
  const pct = Math.round(Math.max(0, Math.min(1, confidence)) * 100);

  return (
    <div
      className="pointer-events-none absolute left-4 top-4 z-[125] max-w-[min(100vw-2rem,20rem)] rounded-md border border-viva-grey-200 bg-viva-white/80 px-3 py-2.5 shadow-viva-border backdrop-blur-md"
      aria-label="Interviewer and classification"
    >
      <p className="font-display text-base font-medium leading-snug text-viva-near-black md:text-lg">
        {personaTitle}
      </p>
      {personaFocus ? (
        <p className="mt-0.5 text-[11px] leading-snug text-viva-grey-700">{personaFocus}</p>
      ) : null}
      <div className="mt-2 space-y-1 border-t border-viva-grey-200/90 pt-2 font-mono text-[10px] uppercase tracking-wider text-viva-grey-mid">
        <p>
          <span className="text-viva-grey-700">Subject track</span>{" "}
          <span className="font-medium normal-case tracking-normal text-viva-near-black">
            {subjectLabel}
          </span>
        </p>
        <p>
          <span className="text-viva-grey-700">Confidence</span>{" "}
          <span
            className="font-semibold normal-case tracking-tight"
            style={{ color: MUTED_GOLD }}
          >
            {pct}% Match
          </span>
        </p>
      </div>
    </div>
  );
}
