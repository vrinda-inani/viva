export type SessionStatus = "lobby" | "processing" | "active" | "complete";

export type SubjectCategory =
  | "COMPUTER_SCIENCE"
  | "MATHEMATICS"
  | "HUMANITIES"
  | "PROFESSIONAL"
  | "OTHER";

export type ClassificationInfo = {
  subject: SubjectCategory;
  confidence: number;
  personaTitle: string;
  interviewerLine: string;
  focus: string;
};

export type UploadItem = {
  id: string;
  kind: "file" | "url";
  label: string;
  /** Original filename or pasted URL */
  source: string;
};

export type ExtractedSource = {
  label: string;
  text: string;
};

export type QuestionObject = {
  text: string;
  fileName: string;
  lineRange: [number, number];
  /** Verbatim excerpt from the submission for this citation (from backend). */
  contextReference: string;
  /** ≤20-word verbatim quote grounding the question (from backend). */
  sourceSnippet?: string;
};

export const SUBJECT_LABELS: Record<SubjectCategory, string> = {
  COMPUTER_SCIENCE: "Computer science",
  MATHEMATICS: "Mathematics",
  HUMANITIES: "Humanities",
  PROFESSIONAL: "Professional",
  OTHER: "General",
};

/** Proctoring analytics (blur/focus, fullscreen) sent with session finalize. */
export type BlurSegment = {
  blurAt: number;
  focusAt?: number;
};

export type ProctorResumeAction = {
  at: number;
  variant: "fullscreen" | "focus";
};

export type SessionMetadata = {
  blurSegments: BlurSegment[];
  /** Timestamps when the document exited fullscreen (e.g. Esc). */
  fullscreenExits: number[];
  /** User clicked "Resume Session" on the violation overlay (audit). */
  proctorResumeActions: ProctorResumeAction[];
};
