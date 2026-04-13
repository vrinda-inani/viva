"use client";

import { Loader2 } from "lucide-react";
import { useSession, type ProcessingStep } from "@/context/SessionContext";

function stepLabel(step: ProcessingStep): string {
  switch (step) {
    case "ingesting":
      return "Ingesting your materials…";
    case "persona":
      return "Assigning your interviewer";
    case "generating":
      return "Composing your viva questions…";
    default:
      return "Preparing…";
  }
}

/**
 * Brief processing overlay between lobby and active session.
 * Surfaces the assigned persona as a moment of anticipation.
 */
export function ProcessingShell() {
  const { processingStep, interviewerPersona, personaFocus, classification } =
    useSession();

  const persona = interviewerPersona ?? classification?.personaTitle;
  const focus = personaFocus ?? classification?.focus;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-viva-paper/96 px-8 backdrop-blur-md">
      <div className="max-w-md text-center">
        <div className="mb-8 flex justify-center">
          <Loader2
            className="h-10 w-10 animate-spin text-viva-grey-mid"
            strokeWidth={1.25}
            aria-hidden
          />
        </div>
        <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-viva-grey-mid">
          {stepLabel(processingStep)}
        </p>

        {processingStep === "persona" && persona ? (
          <div className="mt-8 space-y-4 animate-viva-timer-enter">
            <p className="font-display text-2xl font-medium leading-snug text-viva-near-black md:text-3xl">
              Viva is now interviewing you as a{" "}
              <span className="text-viva-grey-700">{persona}</span>
            </p>
            {focus ? (
              <p className="text-sm leading-relaxed text-viva-grey-700">
                {focus}
              </p>
            ) : null}
          </div>
        ) : processingStep !== "persona" ? (
          <p className="mt-6 text-sm text-viva-grey-mid">
            Deep-reading submissions and locking in the right examiner.
          </p>
        ) : null}
      </div>
    </div>
  );
}
