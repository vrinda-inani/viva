"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  ClassificationInfo,
  QuestionObject,
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
  setCurrentQuestionIndex: (n: number) => void;
  uploads: UploadItem[];
  setUploads: (items: UploadItem[]) => void;
  questions: QuestionObject[];
  setQuestions: (q: QuestionObject[]) => void;
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [classification, setClassificationState] = useState<ClassificationInfo | null>(
    null,
  );
  const [currentSubject, setCurrentSubject] = useState<SubjectCategory | null>(null);
  const [interviewerPersona, setInterviewerPersona] = useState<string | null>(null);
  const [personaFocus, setPersonaFocus] = useState<string | null>(null);
  const [fullTranscript, setFullTranscript] = useState("");
  const [integrityAlertCount, setIntegrityAlertCount] = useState(0);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  const transcriptRef = useRef("");
  const integrityRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const finalizeOnceRef = useRef(false);

  transcriptRef.current = fullTranscript;
  integrityRef.current = integrityAlertCount;
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

  const resetToLobby = useCallback(() => {
    finalizeOnceRef.current = false;
    setSessionStatus("lobby");
    setProcessingStep(null);
    setActiveFileId(null);
    setCurrentQuestionIndex(0);
    setUploads([]);
    setQuestions([]);
    setSessionId(null);
    setClassificationState(null);
    setCurrentSubject(null);
    setInterviewerPersona(null);
    setPersonaFocus(null);
    setFullTranscript("");
    setIntegrityAlertCount(0);
    setIsFinalizing(false);
    setFinalizeError(null);
    transcriptRef.current = "";
    integrityRef.current = 0;
    sessionIdRef.current = null;
  }, []);

  const startSession = useCallback(() => {
    finalizeOnceRef.current = false;
    setFullTranscript("");
    setIntegrityAlertCount(0);
    setIsFinalizing(false);
    setFinalizeError(null);
    transcriptRef.current = "";
    integrityRef.current = 0;
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
    const alerts = integrityRef.current;

    try {
      if (sid) {
        await postFinalizeSession(sid, {
          transcript,
          integrityAlertCount: alerts,
          finalScore: null,
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
