import { vivaFetch } from "@/lib/api";
import type {
  ClassificationInfo,
  ExtractedSource,
  QuestionObject,
} from "@/lib/types/session";

type ApiQuestion = {
  text: string;
  file_name: string;
  line_range: [number, number] | number[];
  context_reference?: string;
  source_snippet?: string;
};

function mapQuestion(q: ApiQuestion): QuestionObject {
  const [a, b] = q.line_range;
  return {
    text: q.text,
    fileName: q.file_name,
    lineRange: [Number(a), Number(b)],
    contextReference: typeof q.context_reference === "string" ? q.context_reference : "",
    sourceSnippet: typeof q.source_snippet === "string" ? q.source_snippet : "",
  };
}

export async function postSessionAnswer(
  sessionId: string,
  payload: {
    answerTranscript: string;
    currentQuestion: QuestionObject;
    sourceLabels: string[];
    extractedSources: ExtractedSource[];
    /** Sent when there is no DB row (e.g. local-test-session) so the server can use upload-time persona. */
    classification?: ClassificationInfo | null;
  },
): Promise<QuestionObject> {
  const q = payload.currentQuestion;
  const c = payload.classification;
  const res = await vivaFetch(
    `/sessions/${encodeURIComponent(sessionId)}/answer`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answer_transcript: payload.answerTranscript,
        current_question_text: q.text,
        source_labels: payload.sourceLabels,
        anchor_file_name: q.fileName,
        anchor_line_start: q.lineRange[0],
        anchor_line_end: q.lineRange[1],
        source_blocks: payload.extractedSources.map((s) => ({
          label: s.label,
          text: s.text,
        })),
        ...(c
          ? {
              subject: c.subject,
              persona_title: c.personaTitle,
              persona_focus: c.focus,
            }
          : {}),
      }),
    },
  );

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
    throw new Error(detail || `Session answer failed (${res.status})`);
  }

  const data = (await res.json()) as { question_object: ApiQuestion };
  return mapQuestion(data.question_object);
}
