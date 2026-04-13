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

export type QuestionObject = {
  text: string;
  fileName: string;
  lineRange: [number, number];
};

export const SUBJECT_LABELS: Record<SubjectCategory, string> = {
  COMPUTER_SCIENCE: "Computer science",
  MATHEMATICS: "Mathematics",
  HUMANITIES: "Humanities",
  PROFESSIONAL: "Professional",
  OTHER: "General",
};
