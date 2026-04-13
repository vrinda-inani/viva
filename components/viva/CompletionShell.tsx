"use client";

import { CheckCircle2 } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { SUBJECT_LABELS } from "@/lib/types/session";

/**
 * Post-viva: monochrome confirmation with subject and persona recap.
 */
export function CompletionShell() {
  const {
    currentSubject,
    interviewerPersona,
    personaFocus,
    finalizeError,
    resetToLobby,
    isFinalizing,
  } = useSession();

  const subjectLabel = currentSubject
    ? SUBJECT_LABELS[currentSubject]
    : "Your session";

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col justify-center px-6 py-16">
      <div className="rounded-2xl border border-neutral-300 bg-neutral-50 px-8 py-10 text-neutral-900 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <CheckCircle2
            className="mb-5 h-12 w-12 text-neutral-700"
            strokeWidth={1.25}
            aria-hidden
          />
          <h1 className="font-display text-2xl font-semibold tracking-tight text-neutral-950">
            Session complete
          </h1>
          <p className="mt-2 text-sm text-neutral-600">
            {finalizeError
              ? "Your session has ended. Some data may not have synced to the server."
              : "Submission successful. Your responses have been saved."}
          </p>
        </div>

        <div className="mt-8 space-y-4 border-t border-neutral-200 pt-8 text-left">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
              Subject
            </p>
            <p className="mt-1 text-sm font-medium text-neutral-900">
              {subjectLabel}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
              Persona
            </p>
            <p className="mt-1 text-sm text-neutral-800">
              {interviewerPersona ?? "—"}
              {personaFocus ? (
                <span className="text-neutral-600"> — {personaFocus}</span>
              ) : null}
            </p>
          </div>
        </div>

        {finalizeError ? (
          <p
            className="mt-6 rounded-md border border-neutral-400 bg-neutral-100 px-3 py-2 text-xs text-neutral-800"
            role="alert"
          >
            {finalizeError}
          </p>
        ) : null}

        <button
          type="button"
          onClick={resetToLobby}
          disabled={isFinalizing}
          className="mt-8 w-full rounded-lg border border-neutral-800 bg-neutral-900 py-3 text-sm font-medium text-neutral-50 transition-colors hover:bg-neutral-800 disabled:opacity-50"
        >
          Return to lobby
        </button>
      </div>
    </div>
  );
}
