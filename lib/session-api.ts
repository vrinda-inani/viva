import { vivaFetch } from "@/lib/api";

export type FinalizeSessionPayload = {
  transcript: string;
  integrityAlertCount: number;
  finalScore?: number | null;
  /** JSON string of SessionMetadata (blur segments, fullscreen exits). */
  sessionMetadataJson?: string | null;
};

export async function postFinalizeSession(
  sessionId: string,
  payload: FinalizeSessionPayload,
): Promise<{ sessionId: string; updated: boolean }> {
  const res = await vivaFetch(
    `/sessions/${encodeURIComponent(sessionId)}/finalize`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: payload.transcript,
        integrity_alert_count: payload.integrityAlertCount,
        final_score: payload.finalScore ?? null,
        session_metadata_json: payload.sessionMetadataJson ?? null,
      }),
    },
  );

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: string };
      if (typeof body.detail === "string") {
        detail = body.detail;
      }
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Finalize failed (${res.status})`);
  }

  const data = (await res.json()) as {
    session_id: string;
    updated: boolean;
  };
  return { sessionId: data.session_id, updated: data.updated };
}
