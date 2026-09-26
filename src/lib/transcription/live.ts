import type { TranscriptItem } from "@/types";

/**
 * Live speech-to-text for the lesson happening in the room.
 *
 * Uses the browser's own SpeechRecognition engine rather than a model we
 * ship: it needs no API key, no multi-hundred-megabyte download, and it
 * starts producing text in well under a second, which matters when the
 * point of the product is not making a deaf student wait to read what was
 * just said.
 *
 * The trade-off is support — this is Chromium/Safari only, so callers must
 * check `isLiveTranscriptionSupported()` and offer something else when it
 * is false.
 */

/* The SpeechRecognition API is not in TypeScript's DOM lib, so the parts
 * used here are declared locally rather than pulling in a whole types
 * package for four members. */
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isLiveTranscriptionSupported(): boolean {
  return getRecognitionCtor() !== null;
}

export interface LiveTranscriberEvents {
  /** Fires whenever the committed transcript changes. */
  onTranscript: (items: TranscriptItem[]) => void;
  /** The phrase currently being spoken, before the engine commits it. */
  onInterim: (text: string) => void;
  /** Human-readable reason transcription stopped or could not start. */
  onError: (message: string) => void;
}

export interface LiveTranscriber {
  start: () => void;
  stop: () => void;
  /** Seconds elapsed since start, used to keep playback time aligned. */
  elapsed: () => number;
}

function describeError(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone permission denied — allow access to transcribe the lesson.";
    case "no-speech":
      return "No speech detected yet — check the microphone is picking up the room.";
    case "audio-capture":
      return "No microphone found.";
    case "network":
      return "Speech recognition needs a network connection.";
    default:
      return `Live transcription stopped (${code}).`;
  }
}

/** Rough sentence split so the transcript reads as lines, not one blob. */
const MIN_ITEM_SECONDS = 2;

export function createLiveTranscriber(
  events: LiveTranscriberEvents
): LiveTranscriber {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    return {
      start: () =>
        events.onError("This browser has no built-in speech recognition."),
      stop: () => {},
      elapsed: () => 0,
    };
  }

  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  const items: TranscriptItem[] = [];
  let startedAt = 0;
  let running = false;
  // Where the phrase currently being spoken began, so a committed line gets
  // the time speech actually started rather than the time it finished.
  let pendingStart: number | null = null;

  const now = () => (Date.now() - startedAt) / 1000;

  recognition.onresult = (event) => {
    let interim = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0]?.transcript?.trim() ?? "";
      if (!text) continue;

      if (result.isFinal) {
        const start = pendingStart ?? now();
        const end = Math.max(now(), start + MIN_ITEM_SECONDS);
        pendingStart = null;

        items.push({
          id: `live-${items.length + 1}`,
          start: Math.round(start * 10) / 10,
          end: Math.round(end * 10) / 10,
          text,
          topic: "Live",
        });
        events.onTranscript([...items]);
      } else {
        pendingStart ??= now();
        interim = text;
      }
    }

    events.onInterim(interim);
  };

  recognition.onerror = (event) => {
    // `no-speech` is routine during pauses; the engine restarts itself.
    if (event.error !== "no-speech") events.onError(describeError(event.error));
  };

  recognition.onend = () => {
    // Chrome stops the engine after a silence. Restart so a lesson with
    // natural pauses keeps being transcribed.
    if (running) {
      try {
        recognition.start();
      } catch {
        running = false;
      }
    }
  };

  return {
    start: () => {
      if (running) return;
      running = true;
      startedAt = Date.now();
      items.length = 0;
      pendingStart = null;
      try {
        recognition.start();
      } catch (error) {
        running = false;
        events.onError(
          error instanceof Error ? error.message : "Could not start the microphone."
        );
      }
    },
    stop: () => {
      running = false;
      recognition.stop();
      events.onInterim("");
    },
    elapsed: () => (startedAt ? now() : 0),
  };
}
