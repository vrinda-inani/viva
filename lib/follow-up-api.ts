import { vivaFetch } from "@/lib/api";
import type { ClassificationInfo, ExtractedSource, QuestionObject } from "@/lib/types/session";

type FollowUpApiQuestion = {
  text: string;
  file_name: string;
  line_range: [number, number] | number[];
  context_reference?: string;
  source_snippet?: string;
};

function mapQuestion(q: FollowUpApiQuestion): QuestionObject {
  const [a, b] = q.line_range;
  return {
    text: q.text,
    fileName: q.file_name,
    lineRange: [Number(a), Number(b)],
    contextReference: typeof q.context_reference === "string" ? q.context_reference : "",
    sourceSnippet: typeof q.source_snippet === "string" ? q.source_snippet : "",
  };
}

export async function postFollowUp(payload: {
  answerTranscript: string;
  currentQuestion: QuestionObject;
  classification: ClassificationInfo;
  sourceLabels: string[];
  extractedSources: ExtractedSource[];
}): Promise<QuestionObject> {
  const c = payload.classification;
  const q = payload.currentQuestion;
  const res = await vivaFetch("/follow_up", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      answer_transcript: payload.answerTranscript,
      current_question_text: q.text,
      subject: c.subject,
      persona_title: c.personaTitle,
      persona_focus: c.focus,
      source_labels: payload.sourceLabels,
      anchor_file_name: q.fileName,
      anchor_line_start: q.lineRange[0],
      anchor_line_end: q.lineRange[1],
      source_blocks: payload.extractedSources.map((s) => ({
        label: s.label,
        text: s.text,
      })),
    }),
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: string | unknown };
      if (typeof body.detail === "string") {
        detail = body.detail;
      }
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Follow-up failed (${res.status})`);
  }

  const data = (await res.json()) as { question_object: FollowUpApiQuestion };
  return mapQuestion(data.question_object);
}
