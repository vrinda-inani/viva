import type { ClassificationInfo, SubjectCategory } from "@/lib/types/session";

const VALID: SubjectCategory[] = [
  "COMPUTER_SCIENCE",
  "MATHEMATICS",
  "HUMANITIES",
  "PROFESSIONAL",
  "OTHER",
];

export type ClassificationApiShape = {
  subject: string;
  confidence: number;
  persona_title: string;
  interviewer_line: string;
  focus: string;
};

export function mapClassificationApi(c: ClassificationApiShape): ClassificationInfo {
  const subject = ((VALID as readonly string[]).includes(c.subject)
    ? c.subject
    : "OTHER") as SubjectCategory;

  return {
    subject,
    confidence: c.confidence,
    personaTitle: c.persona_title,
    interviewerLine: c.interviewer_line,
    focus: c.focus,
  };
}
