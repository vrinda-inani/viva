"use client";

import dynamic from "next/dynamic";
import { useCallback } from "react";
import { ChevronLeft, ChevronRight, FileText, Loader2, Sparkles } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { ZenTimer } from "@/components/viva/ZenTimer";
import { useIntegrityMonitor } from "@/hooks/useIntegrityMonitor";
import { useSpeechTranscript } from "@/hooks/useSpeechTranscript";

const VivaWebcam = dynamic(() => import("@/components/viva/VivaWebcam"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[200px] w-full items-center justify-center text-xs text-viva-grey-mid">
      Initializing camera…
    </div>
  ),
});

/**
 * State 2 — Interview: reference library (left), main stage (center), camera (right).
 */
export function ActiveSessionShell() {
  const {
    sessionStatus,
    currentQuestionIndex,
    setCurrentQuestionIndex,
    uploads,
    questions,
    interviewerPersona,
    personaFocus,
    currentSubject,
    appendTranscriptSegment,
    finalizeVivaSession,
    isFinalizing,
  } = useSession();

  const vivaActive = sessionStatus === "active";
  useIntegrityMonitor(vivaActive);
  useSpeechTranscript(vivaActive, appendTranscriptSegment);

  const onTimerEnd = useCallback(() => {
    void finalizeVivaSession();
  }, [finalizeVivaSession]);

  const q = questions[currentQuestionIndex];
  const total = questions.length || 3;

  return (
    <div className="relative mx-auto flex min-h-0 flex-1 w-full max-w-[1600px] flex-col gap-6 px-6 py-8 md:px-8">
      <ZenTimer isActive={vivaActive} onReachZero={onTimerEnd} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        {interviewerPersona ? (
          <div className="max-w-3xl space-y-1">
            <p className="text-sm text-viva-grey-700">
              <span className="font-medium text-viva-near-black">
                Interviewer:
              </span>{" "}
              {interviewerPersona}
              {personaFocus ? ` — ${personaFocus}` : null}
            </p>
            {currentSubject ? (
              <p className="text-[10px] font-medium uppercase tracking-wider text-viva-grey-mid">
                Subject track · {currentSubject.replace(/_/g, " ")}
              </p>
            ) : null}
          </div>
        ) : (
          <div />
        )}
        <button
          type="button"
          onClick={() => void finalizeVivaSession()}
          disabled={isFinalizing || !vivaActive}
          className="shrink-0 rounded-lg border border-viva-grey-300 bg-viva-white px-4 py-2 text-sm font-medium text-viva-near-black shadow-viva-float transition-colors hover:border-viva-grey-mid hover:bg-viva-grey-50 disabled:pointer-events-none disabled:opacity-40"
        >
          {isFinalizing ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Ending…
            </span>
          ) : (
            "End viva"
          )}
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[minmax(240px,22%)_minmax(0,1fr)_minmax(260px,26%)] lg:gap-6">
        <aside
          className="flex min-h-[280px] flex-col overflow-hidden rounded-viva-card border border-viva-grey-200 bg-viva-white shadow-viva-float"
          aria-label="Reference library"
        >
          <div className="border-b border-viva-grey-200 px-4 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-viva-grey-700">
              Reference
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {uploads.length === 0 ? (
              <p className="px-1 py-6 text-center text-xs text-viva-grey-mid">
                Your uploads and links appear here during the session.
              </p>
            ) : (
              <ul className="space-y-1">
                {uploads.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-viva-grey-700 hover:bg-viva-grey-100"
                    >
                      <FileText
                        className="h-4 w-4 shrink-0 text-viva-grey-mid"
                        strokeWidth={1.25}
                      />
                      <span className="truncate">{u.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <main className="flex min-h-[320px] flex-col gap-4">
          <div className="rounded-viva-card border-2 border-viva-grey-200 bg-viva-white px-6 py-5 shadow-viva-float">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wider text-viva-grey-mid">
                Question {Math.min(currentQuestionIndex + 1, total)} of {total}
              </p>
              {questions.length > 1 ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Previous question"
                    disabled={currentQuestionIndex <= 0}
                    onClick={() =>
                      setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))
                    }
                    className="rounded-md p-1 text-viva-grey-mid transition-colors hover:bg-viva-grey-100 hover:text-viva-near-black disabled:opacity-30"
                  >
                    <ChevronLeft className="h-5 w-5" strokeWidth={1.25} />
                  </button>
                  <button
                    type="button"
                    aria-label="Next question"
                    disabled={currentQuestionIndex >= questions.length - 1}
                    onClick={() =>
                      setCurrentQuestionIndex(
                        Math.min(questions.length - 1, currentQuestionIndex + 1),
                      )
                    }
                    className="rounded-md p-1 text-viva-grey-mid transition-colors hover:bg-viva-grey-100 hover:text-viva-near-black disabled:opacity-30"
                  >
                    <ChevronRight className="h-5 w-5" strokeWidth={1.25} />
                  </button>
                </div>
              ) : null}
            </div>
            <p className="mt-3 font-display text-xl font-medium leading-snug text-viva-near-black md:text-2xl">
              {q?.text ??
                "No question loaded. Check that the API returned questions and your Groq key is set."}
            </p>
          </div>
          <div className="min-h-[200px] flex-1 rounded-viva-card border border-viva-grey-200 bg-viva-cream shadow-viva-border">
            <div className="flex h-10 items-center justify-between border-b border-viva-sand/60 px-4">
              <span className="text-xs text-viva-grey-mid">Context</span>
              {q ? (
                <span className="font-mono text-xs text-viva-grey-700">
                  {q.fileName} · L{q.lineRange[0]}–L{q.lineRange[1]}
                </span>
              ) : null}
            </div>
            <div className="p-4 font-mono text-sm leading-relaxed text-viva-grey-700">
              <p className="text-viva-grey-mid">
                Line range points to the cited region in your submission (full
                shiki viewer next).
              </p>
            </div>
          </div>
          <div className="h-14 rounded-lg border border-viva-grey-200 bg-viva-grey-100/50 shadow-viva-inner">
            <div className="flex h-full items-center justify-center gap-2 text-xs text-viva-grey-mid">
              <Sparkles className="h-4 w-4" strokeWidth={1.25} />
              Waveform (Framer Motion) — next step
            </div>
          </div>
        </main>

        <section
          className="flex min-h-[300px] flex-col overflow-hidden rounded-viva-stage border border-viva-grey-200 bg-viva-near-black shadow-viva-glow lg:min-h-0"
          aria-label="Live recording"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <span
                className="relative flex h-2 w-2 rounded-full bg-viva-rose shadow-[0_0_12px_rgb(178_150_146_/_0.75)] animate-pulse"
                aria-hidden
              />
              <span className="text-xs font-medium uppercase tracking-wider text-viva-grey-mid">
                Rec
              </span>
            </div>
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
            <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
            <VivaWebcam className="h-full w-full min-h-[220px] object-cover" />
          </div>
        </section>
      </div>
    </div>
  );
}
