import { vivaFetch } from "@/lib/api";
import { mapClassificationApi, type ClassificationApiShape } from "@/lib/map-classification";
import type {
  ClassificationInfo,
  ExtractedSource,
  QuestionObject,
  UploadItem,
} from "@/lib/types/session";

type UploadApiQuestion = {
  text: string;
  file_name: string;
  line_range: [number, number] | number[];
  context_reference?: string;
  source_snippet?: string;
};

type UploadApiResponse = {
  session_id: string;
  question_objects: UploadApiQuestion[];
  classification: ClassificationApiShape;
  extracted_text: string;
  extracted_sources: { label: string; text: string }[];
};

function mapQuestion(q: UploadApiQuestion): QuestionObject {
  const [a, b] = q.line_range;
  return {
    text: q.text,
    fileName: q.file_name,
    lineRange: [Number(a), Number(b)],
    contextReference: typeof q.context_reference === "string" ? q.context_reference : "",
    sourceSnippet: typeof q.source_snippet === "string" ? q.source_snippet : "",
  };
}

function mapExtractedSources(
  rows: UploadApiResponse["extracted_sources"],
): ExtractedSource[] {
  return rows.map((r) => ({ label: r.label, text: r.text }));
}

export type UploadPayload = {
  files: File[];
  urls: string[];
  uploadsMeta: UploadItem[];
  /** When set, backend skips a second Groq classification call (same ingest + questions). */
  priorClassification?: ClassificationInfo | null;
};

export async function postUpload(payload: UploadPayload): Promise<{
  sessionId: string;
  questions: QuestionObject[];
  classification: ClassificationInfo;
  extractedText: string;
  extractedSources: ExtractedSource[];
}> {
  const form = new FormData();
  for (const f of payload.files) {
    form.append("files", f);
  }
  form.append("urls", JSON.stringify(payload.urls));

  if (payload.priorClassification) {
    const c = payload.priorClassification;
    form.append(
      "prior_classification",
      JSON.stringify({
        subject: c.subject,
        persona: c.personaTitle,
        focus: c.focus,
        confidence: c.confidence,
      }),
    );
  }

  const res = await vivaFetch("/upload", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: string | unknown };
      if (typeof body.detail === "string") {
        detail = body.detail;
      } else if (Array.isArray(body.detail)) {
        detail = JSON.stringify(body.detail);
      }
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Upload failed (${res.status})`);
  }

  const data = (await res.json()) as UploadApiResponse;
  return {
    sessionId: data.session_id,
    questions: data.question_objects.map(mapQuestion),
    classification: mapClassificationApi(data.classification),
    extractedText: data.extracted_text ?? "",
    extractedSources: mapExtractedSources(data.extracted_sources ?? []),
  };
}
