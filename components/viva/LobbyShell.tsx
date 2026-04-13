"use client";

import { Link2, Loader2, Sparkles, Upload, Video, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/context/SessionContext";
import { postClassify } from "@/lib/classify-api";
import { postUpload } from "@/lib/upload-api";
import { SUBJECT_LABELS, type UploadItem } from "@/lib/types/session";
import { LobbyWebcamPreview } from "@/components/viva/LobbyWebcamPreview";

function parseUrls(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildUploadItems(files: File[], urls: string[]): UploadItem[] {
  return [
    ...files.map((f) => ({
      id: crypto.randomUUID(),
      kind: "file" as const,
      label: f.name,
      source: f.name,
    })),
    ...urls.map((u) => ({
      id: crypto.randomUUID(),
      kind: "url" as const,
      label: u,
      source: u,
    })),
  ];
}

/**
 * Lobby: upload + URL (left), persona + actions (center), Zoom-style camera (right).
 */
export function LobbyShell() {
  const {
    startSession,
    setSessionId,
    setQuestions,
    setExtractedText,
    setExtractedSources,
    setUploads,
    classification,
    setClassification,
    setSessionStatus,
    setProcessingStep,
  } = useSession();

  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [urlField, setUrlField] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const [startBusy, setStartBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const urls = parseUrls(urlField);
  const canStart = files.length > 0 || urls.length > 0;

  useEffect(() => {
    setClassification(null);
  }, [files, urlField, setClassification]);

  const addFiles = useCallback((list: FileList | File[]) => {
    setFiles((prev) => [...prev, ...Array.from(list)]);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.files?.length) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles],
  );

  const removeFile = (index: number) => {
    setFiles((f) => f.filter((_, i) => i !== index));
  };

  const handlePreviewPersona = async () => {
    setError(null);
    if (!canStart) {
      setError("Add at least one file or URL to preview.");
      return;
    }
    setPreviewBusy(true);
    try {
      const c = await postClassify({ files, urls });
      setClassification(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Classification failed");
    } finally {
      setPreviewBusy(false);
    }
  };

  const handleStart = async () => {
    setError(null);
    if (!canStart) {
      setError("Add at least one file or URL.");
      return;
    }
    setStartBusy(true);
    setSessionStatus("processing");
    setProcessingStep("ingesting");
    try {
      const cls = await postClassify({ files, urls });
      setClassification(cls);
      setProcessingStep("persona");
      await new Promise((r) => setTimeout(r, 520));
      setProcessingStep("generating");
      const meta = buildUploadItems(files, urls);
      const {
        sessionId,
        questions,
        classification: clsFinal,
        extractedText,
        extractedSources,
      } = await postUpload({
        files,
        urls,
        uploadsMeta: meta,
        priorClassification: cls,
      });
      setSessionId(sessionId);
      setQuestions(questions);
      setExtractedText(extractedText);
      setExtractedSources(extractedSources);
      setClassification(clsFinal);
      setUploads(meta);
      startSession();
    } catch (e) {
      setSessionStatus("lobby");
      setProcessingStep(null);
      setError(e instanceof Error ? e.message : "Session preparation failed");
    } finally {
      setStartBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-0 flex-1 w-full max-w-[1400px] flex-col gap-8 px-6 py-10 md:px-10">
      <header className="shrink-0">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-viva-grey-mid">
          Viva
        </p>
        <h1 className="mt-1 font-display text-3xl font-medium tracking-tight text-viva-near-black md:text-4xl">
          Pre-session
        </h1>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[1fr_minmax(200px,320px)_1fr] lg:items-stretch lg:gap-8">
        <section
          className="flex flex-col rounded-viva-card border border-viva-grey-200 bg-viva-white shadow-viva-float"
          aria-label="Upload submissions"
        >
          <div className="border-b border-viva-grey-200 px-6 py-4">
            <h2 className="text-sm font-medium text-viva-near-black">
              Submissions
            </h2>
            <p className="mt-1 text-xs text-viva-grey-mid">
              PDF, LaTeX, code, GitHub repo URLs, portfolios, LinkedIn — comma or
              newline separated
            </p>
          </div>
          <div className="flex flex-1 flex-col gap-4 p-6">
            <input
              ref={inputRef}
              type="file"
              multiple
              className="sr-only"
              accept=".py,.pdf,.md,.txt,.tex,.ts,.tsx,.js,.jsx,.json,.html,.css,.csv"
              onChange={(e) => {
                if (e.target.files?.length) {
                  addFiles(e.target.files);
                  e.target.value = "";
                }
              }}
            />
            <button
              type="button"
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => inputRef.current?.click()}
              className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-viva-grey-200 bg-viva-grey-100/40 text-viva-grey-mid transition-colors hover:border-viva-grey-mid hover:bg-viva-grey-100/80 hover:text-viva-grey-700"
            >
              <Upload className="h-6 w-6" strokeWidth={1.25} aria-hidden />
              <span className="text-sm">Drop files or browse</span>
            </button>

            {files.length > 0 ? (
              <ul className="space-y-1 text-sm text-viva-grey-700">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-viva-grey-200 bg-viva-paper px-2 py-1.5"
                  >
                    <span className="truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="shrink-0 text-viva-grey-mid hover:text-viva-near-black"
                      aria-label={`Remove ${f.name}`}
                    >
                      <X className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="flex flex-col gap-1">
              <div className="flex items-start gap-2 rounded-lg border border-viva-grey-200 bg-viva-paper px-3 py-2 shadow-viva-border">
                <Link2
                  className="mt-0.5 h-4 w-4 shrink-0 text-viva-grey-mid"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <textarea
                  value={urlField}
                  onChange={(e) => setUrlField(e.target.value)}
                  placeholder="https://github.com/… , LinkedIn, portfolio…"
                  rows={3}
                  className="min-h-[4rem] w-full resize-none bg-transparent text-sm text-viva-near-black outline-none placeholder:text-viva-grey-mid"
                />
              </div>
            </div>
          </div>
        </section>

        <div className="flex w-full max-w-[340px] flex-col items-center justify-center gap-4 lg:mx-auto lg:py-4">
          <div className="w-full space-y-3">
            <p className="text-center text-[10px] font-medium uppercase tracking-[0.18em] text-viva-grey-mid">
              Interviewer persona
            </p>
            {classification ? (
              <div className="rounded-viva-card border border-viva-grey-200 bg-viva-white px-5 py-4 text-center shadow-viva-float">
                <p className="font-display text-lg font-medium leading-snug text-viva-near-black">
                  {classification.interviewerLine}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-viva-grey-700">
                  {classification.focus}
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[10px] uppercase tracking-wider text-viva-grey-mid">
                  <span className="rounded-full border border-viva-grey-200 bg-viva-paper px-2 py-0.5">
                    {SUBJECT_LABELS[classification.subject]}
                  </span>
                  <span>
                    Confidence {Math.round(classification.confidence * 100)}%
                  </span>
                </div>
              </div>
            ) : (
              <p className="px-2 text-center text-xs leading-relaxed text-viva-grey-mid">
                Preview your interviewer, or start directly — you will see the
                assigned persona during processing.
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={previewBusy || !canStart || startBusy}
            onClick={() => void handlePreviewPersona()}
            className="flex w-full max-w-[240px] items-center justify-center gap-2 rounded-full border border-viva-grey-200 bg-viva-white px-6 py-3 text-sm font-medium text-viva-near-black shadow-viva-border transition-[box-shadow,transform] enabled:hover:border-viva-grey-mid enabled:hover:shadow-viva-float enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {previewBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-4 w-4 text-viva-grey-mid" strokeWidth={1.25} />
            )}
            {previewBusy ? "Analyzing…" : "Preview interviewer"}
          </button>

          <button
            type="button"
            disabled={startBusy || !canStart}
            onClick={() => void handleStart()}
            className="flex w-full max-w-[240px] items-center justify-center gap-2 rounded-full border border-viva-near-black bg-viva-near-black px-8 py-3.5 text-sm font-medium text-viva-white shadow-viva-float transition-[box-shadow,transform] enabled:hover:shadow-viva-glow enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {startBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            {startBusy ? "Starting…" : "Start Viva Session"}
          </button>
          {error ? (
            <p className="max-w-[260px] text-center text-xs text-viva-rose">
              {error}
            </p>
          ) : (
            <p className="max-w-[220px] text-center text-xs leading-relaxed text-viva-grey-mid">
              Start ingests everything, reveals your examiner, then opens the
              recorded interview.
            </p>
          )}
        </div>

        <section
          className="flex min-h-[280px] flex-col overflow-hidden rounded-viva-stage border border-viva-grey-200 bg-viva-near-black shadow-viva-glow lg:min-h-0"
          aria-label="Camera preview"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="text-xs font-medium uppercase tracking-wider text-viva-grey-mid">
              Preview
            </span>
            <Video className="h-4 w-4 text-viva-grey-mid" strokeWidth={1.25} />
          </div>
          <LobbyWebcamPreview />
        </section>
      </div>
    </div>
  );
}
