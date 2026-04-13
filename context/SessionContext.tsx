"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type {
  ClassificationInfo,
  ExtractedSource,
  QuestionObject,
  SessionMetadata,
  SessionStatus,
  SubjectCategory,
  UploadItem,
} from "@/lib/types/session";
import { postFinalizeSession } from "@/lib/session-api";

export type ProcessingStep = "ingesting" | "persona" | "generating" | null;

type SessionContextValue = {
  sessionStatus: SessionStatus;
  setSessionStatus: (s: SessionStatus) => void;
  processingStep: ProcessingStep;
  setProcessingStep: (s: ProcessingStep) => void;
  activeFileId: string | null;
  setActiveFileId: (id: string | null) => void;
  currentQuestionIndex: number;
  setCurrentQuestionIndex: Dispatch<SetStateAction<number>>;
  uploads: UploadItem[];
  setUploads: (items: UploadItem[]) => void;
  questions: QuestionObject[];
  setQuestions: Dispatch<SetStateAction<QuestionObject[]>>;
  extractedText: string;
  setExtractedText: (t: string) => void;
  extractedSources: ExtractedSource[];
  setExtractedSources: Dispatch<SetStateAction<ExtractedSource[]>>;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  classification: ClassificationInfo | null;
  setClassification: (c: ClassificationInfo | null) => void;
  currentSubject: SubjectCategory | null;
  interviewerPersona: string | null;
  personaFocus: string | null;
  startSession: () => void;
  fullTranscript: string;
  appendTranscriptSegment: (text: string) => void;
  integrityAlertCount: number;
  incrementIntegrityAlerts: () => void;
  tabSwitchCount: number;
  setTabSwitchCount: Dispatch<SetStateAction<number>>;
  sessionMetadata: SessionMetadata;
  recordBlurAt: (ts: number) => void;
  closeBlurWithFocus: (ts: number) => void;
  recordFullscreenExit: (ts: number) => void;
  recordProctorResume: (at: number, variant: "fullscreen" | "focus") => void;
  isFinalizing: boolean;
  finalizeError: string | null;
  finalizeVivaSession: () => Promise<void>;
  resetToLobby: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("lobby");
  const [processingStep, setProcessingStep] = useState<ProcessingStep>(null);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [questions, setQuestions] = useState<QuestionObject[]>([]);
  const [extractedText, setExtractedText] = useState("");
  const [extractedSources, setExtractedSources] = useState<ExtractedSource[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [classification, setClassificationState] = useState<ClassificationInfo | null>(
    null,
  );
  const [currentSubject, setCurrentSubject] = useState<SubjectCategory | null>(null);
  const [interviewerPersona, setInterviewerPersona] = useState<string | null>(null);
  const [personaFocus, setPersonaFocus] = useState<string | null>(null);
  const [fullTranscript, setFullTranscript] = useState("");
  const [integrityAlertCount, setIntegrityAlertCount] = useState(0);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [sessionMetadata, setSessionMetadata] = useState<SessionMetadata>({
    blurSegments: [],
    fullscreenExits: [],
    proctorResumeActions: [],
  });
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  const transcriptRef = useRef("");
  const integrityRef = useRef(0);
  const tabSwitchRef = useRef(0);
  const sessionMetadataRef = useRef<SessionMetadata>({
    blurSegments: [],
    fullscreenExits: [],
    proctorResumeActions: [],
  });
  const sessionIdRef = useRef<string | null>(null);
  const finalizeOnceRef = useRef(false);

  transcriptRef.current = fullTranscript;
  integrityRef.current = integrityAlertCount;
  tabSwitchRef.current = tabSwitchCount;
  sessionMetadataRef.current = sessionMetadata;
  sessionIdRef.current = sessionId;

  const setClassification = useCallback((c: ClassificationInfo | null) => {
    setClassificationState(c);
    if (c) {
      setCurrentSubject(c.subject);
      setInterviewerPersona(c.personaTitle);
      setPersonaFocus(c.focus);
    } else {
      setCurrentSubject(null);
      setInterviewerPersona(null);
      setPersonaFocus(null);
    }
  }, []);

  const appendTranscriptSegment = useCallback((text: string) => {
    const t = text.trim();
    if (!t) {
      return;
    }
    setFullTranscript((prev) => {
      const next = prev ? `${prev}\n${t}` : t;
      transcriptRef.current = next;
      return next;
    });
  }, []);

  const incrementIntegrityAlerts = useCallback(() => {
    setIntegrityAlertCount((n) => {
      const next = n + 1;
      integrityRef.current = next;
      return next;
    });
  }, []);

  const recordBlurAt = useCallback((ts: number) => {
    setSessionMetadata((prev) => {
      const next: SessionMetadata = {
        ...prev,
        blurSegments: [...prev.blurSegments, { blurAt: ts }],
      };
      sessionMetadataRef.current = next;
      return next;
    });
  }, []);

  const closeBlurWithFocus = useCallback((ts: number) => {
    setSessionMetadata((prev) => {
      const segments = [...prev.blurSegments];
      for (let i = segments.length - 1; i >= 0; i -= 1) {
        if (segments[i].focusAt === undefined) {
          segments[i] = { ...segments[i], focusAt: ts };
          break;
        }
      }
      const next = { ...prev, blurSegments: segments };
      sessionMetadataRef.current = next;
      return next;
    });
  }, []);

  const recordFullscreenExit = useCallback((ts: number) => {
    setSessionMetadata((prev) => {
      const next: SessionMetadata = {
        ...prev,
        fullscreenExits: [...prev.fullscreenExits, ts],
      };
      sessionMetadataRef.current = next;
      return next;
    });
  }, []);

  const recordProctorResume = useCallback((at: number, variant: "fullscreen" | "focus") => {
    setSessionMetadata((prev) => {
      const next: SessionMetadata = {
        ...prev,
        proctorResumeActions: [
          ...(prev.proctorResumeActions ?? []),
          { at, variant },
        ],
      };
      sessionMetadataRef.current = next;
      return next;
    });
  }, []);

  const resetToLobby = useCallback(() => {
    finalizeOnceRef.current = false;
    setSessionStatus("lobby");
    setProcessingStep(null);
    setActiveFileId(null);
    setCurrentQuestionIndex(0);
    setUploads([]);
    setQuestions([]);
    setExtractedText("");
    setExtractedSources([]);
    setSessionId(null);
    setClassificationState(null);
    setCurrentSubject(null);
    setInterviewerPersona(null);
    setPersonaFocus(null);
    setFullTranscript("");
    setIntegrityAlertCount(0);
    setTabSwitchCount(0);
    setSessionMetadata({
      blurSegments: [],
      fullscreenExits: [],
      proctorResumeActions: [],
    });
    setIsFinalizing(false);
    setFinalizeError(null);
    transcriptRef.current = "";
    integrityRef.current = 0;
    tabSwitchRef.current = 0;
    sessionMetadataRef.current = {
      blurSegments: [],
      fullscreenExits: [],
      proctorResumeActions: [],
    };
    sessionIdRef.current = null;
  }, []);

  const startSession = useCallback(() => {
    finalizeOnceRef.current = false;
    setFullTranscript("");
    setIntegrityAlertCount(0);
    setTabSwitchCount(0);
    setSessionMetadata({
      blurSegments: [],
      fullscreenExits: [],
      proctorResumeActions: [],
    });
    setIsFinalizing(false);
    setFinalizeError(null);
    transcriptRef.current = "";
    integrityRef.current = 0;
    tabSwitchRef.current = 0;
    sessionMetadataRef.current = {
      blurSegments: [],
      fullscreenExits: [],
      proctorResumeActions: [],
    };
    setSessionStatus("active");
    setCurrentQuestionIndex(0);
    setProcessingStep(null);
  }, []);

  const finalizeVivaSession = useCallback(async () => {
    if (finalizeOnceRef.current) {
      return;
    }
    finalizeOnceRef.current = true;
    setIsFinalizing(true);
    setFinalizeError(null);

    const sid = sessionIdRef.current;
    const transcript = transcriptRef.current;
    const alerts = tabSwitchRef.current;

    try {
      if (sid) {
        await postFinalizeSession(sid, {
          transcript,
          integrityAlertCount: alerts,
          finalScore: null,
          sessionMetadataJson: JSON.stringify(sessionMetadataRef.current),
        });
      }
      setSessionStatus("complete");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save session";
      setFinalizeError(msg);
      setSessionStatus("complete");
    } finally {
      setIsFinalizing(false);
    }
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      sessionStatus,
      setSessionStatus,
      processingStep,
      setProcessingStep,
      activeFileId,
      setActiveFileId,
      currentQuestionIndex,
      setCurrentQuestionIndex,
      uploads,
      setUploads,
      questions,
      setQuestions,
      extractedText,
      setExtractedText,
      extractedSources,
      setExtractedSources,
      sessionId,
      setSessionId,
      classification,
      setClassification,
      currentSubject,
      interviewerPersona,
      personaFocus,
      startSession,
      fullTranscript,
      appendTranscriptSegment,
      integrityAlertCount,
      incrementIntegrityAlerts,
      tabSwitchCount,
      setTabSwitchCount,
      sessionMetadata,
      recordBlurAt,
      closeBlurWithFocus,
      recordFullscreenExit,
      recordProctorResume,
      isFinalizing,
      finalizeError,
      finalizeVivaSession,
      resetToLobby,
    }),
    [
      sessionStatus,
      processingStep,
      activeFileId,
      currentQuestionIndex,
      uploads,
      questions,
      extractedText,
      extractedSources,
      sessionId,
      classification,
      currentSubject,
      interviewerPersona,
      personaFocus,
      startSession,
      fullTranscript,
      appendTranscriptSegment,
      integrityAlertCount,
      incrementIntegrityAlerts,
      tabSwitchCount,
      sessionMetadata,
      recordBlurAt,
      closeBlurWithFocus,
      recordFullscreenExit,
      recordProctorResume,
      isFinalizing,
      finalizeError,
      finalizeVivaSession,
      resetToLobby,
    ],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return ctx;
}
