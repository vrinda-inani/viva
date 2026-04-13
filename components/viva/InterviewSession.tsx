"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Loader2, Sparkles } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { ZenTimer } from "@/components/viva/ZenTimer";
import { useProctoring } from "@/hooks/useProctoring";
import { useSpeechTranscript } from "@/hooks/useSpeechTranscript";
import { InterviewerStatus } from "@/components/viva/InterviewerStatus";
import { ProctorToast, ViolationOverlay } from "@/components/viva/ProctoringOverlays";
import { postSessionAnswer } from "@/lib/session-answer-api";
import { SUBJECT_LABELS, type QuestionObject } from "@/lib/types/session";
import { LIVE_GOLD, RecordingLiveBadge } from "@/components/viva/RecordingPanel";

const DIM_GREY = "#a3a3a3";

function SystemCheckPanel({ stream }: { stream: MediaStream | null }) {
  const [, reRender] = useState(0);
  useEffect(() => {
    if (!stream) {
      return;
    }
    const bump = () => reRender((x) => x + 1);
    stream.getTracks().forEach((t) => {
      t.addEventListener("mute", bump);
      t.addEventListener("unmute", bump);
      t.addEventListener("ended", bump);
    });
    return () =>
      stream.getTracks().forEach((t) => {
        t.removeEventListener("mute", bump);
        t.removeEventListener("unmute", bump);
        t.removeEventListener("ended", bump);
      });
  }, [stream]);

  const a = stream?.getAudioTracks()[0];
  const v = stream?.getVideoTracks()[0];
  const micOk = Boolean(a?.enabled);
  const camOk = Boolean(v?.enabled);

  return (
    <div
      className="pointer-events-none absolute bottom-4 right-4 z-[130] rounded-md border border-viva-grey-200/90 bg-viva-white/95 px-2.5 py-2 shadow-viva-float backdrop-blur-sm"
      aria-label="System check"
    >
      <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-viva-grey-700">
        System check
      </p>
      <ul className="space-y-0.5 font-mono text-[10px] leading-tight">
        <li>
          <span className="text-viva-grey-700">Mic:</span>{" "}
          <span
            style={{ color: micOk ? LIVE_GOLD : DIM_GREY }}
          >
            {micOk ? "[OK]" : "[Error]"}
          </span>
        </li>
        <li>
          <span className="text-viva-grey-700">Cam:</span>{" "}
          <span
            style={{ color: camOk ? LIVE_GOLD : DIM_GREY }}
          >
            {camOk ? "[OK]" : "[Error]"}
          </span>
        </li>
      </ul>
    </div>
  );
}

const RecordingPanelLazy = dynamic(
  () =>
    import("@/components/viva/RecordingPanel").then((m) => ({
      default: m.RecordingPanel,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[200px] w-full items-center justify-center text-xs text-viva-grey-mid">
        Initializing camera…
      </div>
    ),
  },
);

/**
 * Live viva: dynamic follow-up questions from Groq after each submitted answer.
 * Recording pulse waits until the next question is loaded.
 */
export function InterviewSession() {
  const {
    sessionStatus,
    sessionId,
    uploads,
    questions,
    setQuestions,
    interviewerPersona,
    personaFocus,
    currentSubject,
    appendTranscriptSegment,
    finalizeVivaSession,
    isFinalizing,
    fullTranscript,
    classification,
    extractedText,
    extractedSources,
    recordProctorResume,
  } = useSession();

  const [currentQuestion, setCurrentQuestion] = useState<QuestionObject | null>(
    null,
  );
  const [questionRound, setQuestionRound] = useState(1);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [mediaRecorderLive, setMediaRecorderLive] = useState(false);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [debugStream, setDebugStream] = useState<MediaStream | null>(null);
  const transcriptCheckpointRef = useRef(0);
  const vivaWasActiveRef = useRef(false);
  const interviewRootRef = useRef<HTMLDivElement>(null);

  const vivaActive = sessionStatus === "active";
  const proctor = useProctoring({
    enabled: vivaActive,
    requireFullscreen: true,
    onRecordingPause: setRecordingPaused,
    fullscreenRootRef: interviewRootRef,
  });
  const recordingEnabled =
    vivaActive &&
    !isFinalizing &&
    !proctor.needsFullscreen &&
    !followUpLoading;
  useSpeechTranscript(
    recordingEnabled,
    appendTranscriptSegment,
  );

  useEffect(() => {
    if (!vivaActive) {
      setCurrentQuestion(null);
      setQuestionRound(1);
      setIsTimerRunning(false);
      setLaunchError(null);
      vivaWasActiveRef.current = false;
      return;
    }
    if (questions.length > 0 && currentQuestion === null) {
      setCurrentQuestion(questions[0]);
    }
  }, [vivaActive, questions, currentQuestion]);

  useEffect(() => {
    if (!vivaActive) {
      return;
    }
    if (!vivaWasActiveRef.current) {
      transcriptCheckpointRef.current = fullTranscript.length;
      vivaWasActiveRef.current = true;
    }
  }, [vivaActive, fullTranscript.length]);

  const sourceLabels = useMemo(() => {
    const fromSources = extractedSources.map((s) => s.label).filter(Boolean);
    const set = new Set(fromSources);
    if (currentQuestion?.fileName) {
      set.add(currentQuestion.fileName);
    }
    return Array.from(set);
  }, [extractedSources, currentQuestion?.fileName]);

  const onTimerEnd = useCallback(() => {
    void finalizeVivaSession();
  }, [finalizeVivaSession]);

  const handleResumeViolation = useCallback(async () => {
    const variant = proctor.needsFullscreen ? "fullscreen" : "focus";
    recordProctorResume(Date.now(), variant);
    await proctor.requestFullscreen();
  }, [proctor.needsFullscreen, proctor.requestFullscreen, recordProctorResume]);

  const handleEnterViva = useCallback(async () => {
    setLaunchError(null);
    const el = interviewRootRef.current;
    if (!el) {
      setLaunchError("Interview layout is not ready yet.");
      return;
    }
    try {
      await el.requestFullscreen();
      setIsTimerRunning(true);
    } catch (e) {
      setLaunchError(
        e instanceof Error ? e.message : "Fullscreen was blocked or failed.",
      );
    }
  }, []);

  const q = currentQuestion;

  const handleSubmitAnswer = useCallback(async () => {
    if (!sessionId || !classification || !q || followUpLoading) {
      if (!sessionId && q) {
        setFollowUpError("No session id — complete upload so the server creates a session.");
      }
      return;
    }
    const start = transcriptCheckpointRef.current;
    const answerTranscript = fullTranscript.slice(start).trim();
    if (!answerTranscript) {
      setFollowUpError("Say something before submitting your answer.");
      return;
    }
    setFollowUpError(null);
    setFollowUpLoading(true);
    try {
      const labels =
        sourceLabels.length > 0 ? sourceLabels : [q.fileName];
      const nextQ = await postSessionAnswer(sessionId, {
        answerTranscript,
        currentQuestion: q,
        sourceLabels: labels,
        extractedSources,
        classification,
      });
      transcriptCheckpointRef.current = fullTranscript.length;
      setCurrentQuestion(nextQ);
      setQuestionRound((r) => r + 1);
      setQuestions((prev) => [...prev, nextQ]);
    } catch (e) {
      setFollowUpError(e instanceof Error ? e.message : "Follow-up request failed");
    } finally {
      setFollowUpLoading(false);
    }
  }, [
    sessionId,
    classification,
    q,
    followUpLoading,
    fullTranscript,
    sourceLabels,
    extractedSources,
    setQuestions,
  ]);

  const recPulse =
    vivaActive &&
    isTimerRunning &&
    !followUpLoading &&
    !isFinalizing &&
    !proctor.needsFullscreen
      ? "animate-pulse"
      : "";

  return (
    <>
      <ProctorToast
        message={proctor.toastMessage}
        onDismiss={proctor.dismissToast}
      />
      {vivaActive &&
      isTimerRunning &&
      (proctor.needsFullscreen || proctor.focusLost) ? (
        <ViolationOverlay
          variant={proctor.needsFullscreen ? "fullscreen" : "focus"}
          onResume={handleResumeViolation}
        />
      ) : null}

      {vivaActive && !isTimerRunning ? (
        <div
          className="fixed inset-0 z-[550] flex flex-col items-center justify-center gap-4 bg-viva-near-black/88 px-6 text-center backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="launch-viva-title"
        >
          <h2
            id="launch-viva-title"
            className="font-display text-2xl font-medium text-viva-white md:text-3xl"
          >
            Click to begin
          </h2>
          <p className="max-w-md text-sm text-viva-grey-mid">
            When you are ready, use the button below to enter fullscreen on this view (including
            your camera preview). The timer and recording start together after fullscreen is active.
          </p>
          <button
            type="button"
            onClick={() => void handleEnterViva()}
            className="rounded-lg px-10 py-3 text-sm font-semibold shadow-viva-float transition-colors hover:opacity-90"
            style={{
              color: LIVE_GOLD,
              borderWidth: 2,
              borderStyle: "solid",
              borderColor: LIVE_GOLD,
              backgroundColor: "transparent",
            }}
          >
            Launch Interview
          </button>
          {launchError ? (
            <p className="max-w-md text-xs text-red-300" role="alert">
              {launchError}
            </p>
          ) : null}
        </div>
      ) : null}

      <div
        ref={interviewRootRef}
        className="relative isolate mx-auto flex min-h-screen min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-6 bg-[var(--background)] px-6 py-8 md:px-8"
      >
      <ZenTimer isActive={vivaActive && isTimerRunning} onReachZero={onTimerEnd} />
      <SystemCheckPanel stream={debugStream} />
      {classification && interviewerPersona && currentSubject ? (
        <InterviewerStatus
          personaTitle={interviewerPersona}
          personaFocus={personaFocus}
          subjectLabel={SUBJECT_LABELS[currentSubject]}
          confidence={classification.confidence}
        />
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-h-[1px] min-w-[1px] shrink max-w-[min(100%,14rem)] sm:max-w-md" aria-hidden />
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
          {q?.sourceSnippet && !followUpLoading ? (
            <div className="border-b border-viva-grey-200 px-3 py-3">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-viva-grey-mid">
                Content referred to
              </p>
              <p className="mt-1.5 font-mono text-xs leading-snug text-viva-near-black">
                {q.sourceSnippet}
              </p>
            </div>
          ) : null}
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
                Question round {questionRound}
              </p>
            </div>
            <p className="mt-3 font-display text-xl font-medium leading-snug text-viva-near-black md:text-2xl">
              {followUpLoading ? (
                <span className="inline-flex items-center gap-2 text-sm font-sans font-normal text-viva-rose md:text-base">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin opacity-80" aria-hidden />
                  Generating follow-up…
                </span>
              ) : (
                (q?.text ??
                  "No question loaded. Check that the API returned questions and your Groq key is set.")
              )}
            </p>
          </div>
          <div className="flex min-h-[220px] flex-1 flex-col overflow-hidden rounded-viva-card border border-viva-grey-200 bg-viva-cream shadow-viva-border">
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-viva-sand/60 px-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-viva-grey-700">
                Work preview
              </span>
              {q && !followUpLoading ? (
                <span className="font-mono text-[10px] text-viva-grey-700">
                  {q.fileName} · L{q.lineRange[0]}–L{q.lineRange[1]}
                </span>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {q?.contextReference && !followUpLoading ? (
                <div className="border-b border-viva-sand/60 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-viva-grey-mid">
                    Cited for this question
                  </p>
                  <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-viva-near-black">
                    {q.contextReference}
                  </pre>
                </div>
              ) : null}
              <div className="px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-viva-grey-mid">
                  Full extracted submission
                </p>
                {extractedText.trim() ? (
                  <pre className="mt-2 max-h-[min(40vh,320px)] overflow-y-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-viva-grey-700">
                    {extractedText}
                  </pre>
                ) : (
                  <p className="mt-2 text-xs text-viva-grey-mid">
                    No extracted text returned yet. Re-run upload after ingest, or
                    check backend logs (Docling/Crawl4AI).
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="h-14 flex-1 rounded-lg border border-viva-grey-200 bg-viva-grey-100/50 shadow-viva-inner">
              <div className="flex h-full items-center justify-center gap-2 px-3 text-xs text-viva-grey-mid">
                <Sparkles className="h-4 w-4 shrink-0" strokeWidth={1.25} />
                {followUpLoading ? (
                  <span className="text-viva-rose">AI is thinking…</span>
                ) : (
                  "Speak your answer, then submit for a tailored follow-up."
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleSubmitAnswer()}
              disabled={
                followUpLoading ||
                !vivaActive ||
                !classification ||
                !q ||
                isFinalizing ||
                !sessionId
              }
              className="shrink-0 rounded-lg border border-viva-near-black bg-viva-near-black px-5 py-3 text-sm font-medium text-viva-white transition-colors hover:bg-viva-grey-800 disabled:opacity-40"
            >
              {followUpLoading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Submitting…
                </span>
              ) : (
                "Submit answer"
              )}
            </button>
          </div>
          {followUpError ? (
            <p className="text-xs text-red-700" role="alert">
              {followUpError}
            </p>
          ) : null}
        </main>

        <section
          className="relative z-10 flex min-h-[300px] flex-col overflow-hidden rounded-viva-stage border border-viva-grey-200 bg-viva-near-black shadow-viva-glow lg:min-h-0"
          aria-label="Live recording"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-3">
              <span
                className={`relative flex h-2 w-2 rounded-full bg-viva-rose shadow-[0_0_12px_rgb(178_150_146_/_0.75)] ${recPulse}`}
                aria-hidden
              />
              <span className="text-xs font-medium uppercase tracking-wider text-viva-grey-mid">
                Rec
              </span>
              <RecordingLiveBadge visible={mediaRecorderLive} />
            </div>
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
            <RecordingPanelLazy
              enabled={recordingEnabled}
              paused={recordingPaused}
              onLiveChange={setMediaRecorderLive}
              onMediaStreamChange={setDebugStream}
              className="h-full min-h-[220px]"
            />
          </div>
        </section>
      </div>
    </div>
    </>
  );
}
