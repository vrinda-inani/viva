"use client";

import { useEffect, useRef } from "react";

type SpeechRecCtor = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((ev: { resultIndex: number; results: SpeechResultListLike }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type SpeechResultListLike = {
  length: number;
  [i: number]: {
    isFinal: boolean;
    0: { transcript: string };
  };
};

/**
 * Browser speech recognition → append finalized phrases to the transcript.
 * Replace with Whisper callbacks into the same `appendSegment` when wired.
 */
export function useSpeechTranscript(
  enabled: boolean,
  appendSegment: (text: string) => void,
) {
  const appendRef = useRef(appendSegment);
  appendRef.current = appendSegment;
  const activeRef = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    const w = window as unknown as {
      SpeechRecognition?: SpeechRecCtor;
      webkitSpeechRecognition?: SpeechRecCtor;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;

    if (!Ctor) {
      return;
    }

    activeRef.current = true;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";

    rec.onresult = (event: { resultIndex: number; results: SpeechResultListLike }) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result.isFinal) {
          continue;
        }
        const text = result[0]?.transcript?.trim();
        if (text) {
          appendRef.current(text);
        }
      }
    };

    rec.onerror = () => {
      /* mic denied / network — transcript may stay partial */
    };

    rec.onend = () => {
      if (!activeRef.current) {
        return;
      }
      try {
        rec.start();
      } catch {
        /* ignore */
      }
    };

    try {
      rec.start();
    } catch {
      activeRef.current = false;
      return;
    }

    return () => {
      activeRef.current = false;
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    };
  }, [enabled]);
}
