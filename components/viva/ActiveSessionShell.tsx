"use client";

import { InterviewSession } from "@/components/viva/InterviewSession";

/**
 * Active viva shell — delegates to {@link InterviewSession} (dynamic follow-ups + recording pulse).
 */
export function ActiveSessionShell() {
  return <InterviewSession />;
}
