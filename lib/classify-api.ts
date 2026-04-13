import { vivaFetch } from "@/lib/api";
import {
  mapClassificationApi,
  type ClassificationApiShape,
} from "@/lib/map-classification";
import type { ClassificationInfo } from "@/lib/types/session";

type ClassifyApiResponse = {
  classification: ClassificationApiShape;
};

export type ClassifyPayload = {
  files: File[];
  urls: string[];
};

function buildFormData(payload: ClassifyPayload): FormData {
  const form = new FormData();
  for (const f of payload.files) {
    form.append("files", f);
  }
  form.append("urls", JSON.stringify(payload.urls));
  return form;
}

export async function postClassify(payload: ClassifyPayload): Promise<ClassificationInfo> {
  const res = await vivaFetch("/classify", {
    method: "POST",
    body: buildFormData(payload),
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
    throw new Error(detail || `Classification failed (${res.status})`);
  }

  const data = (await res.json()) as ClassifyApiResponse;
  return mapClassificationApi(data.classification);
}
