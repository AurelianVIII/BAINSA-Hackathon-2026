declare global {
  interface Window {
    YT: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }

  // Ambient declaration merging for the third-party `YT` global; there is
  // no ES2015-module equivalent for augmenting a global namespace like this.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace YT {
    class Player {
      constructor(element: HTMLElement, options: PlayerOptions);
      playVideo(): void;
      pauseVideo(): void;
      seekTo(seconds: number, allowSeekAhead: boolean): void;
      setPlaybackRate(rate: number): void;
      mute(): void;
      unMute(): void;
      destroy(): void;
    }

    interface PlayerOptions {
      videoId?: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, number | string>;
      events?: {
        onReady?: (event: { target: Player }) => void;
        onError?: (event: { target: Player; data: number }) => void;
      };
    }
  }
}

const VIDEO_ID_PATTERN =
  /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/;

/**
 * Extracts an 11-character YouTube video id from the common URL shapes
 * (watch/embed/shorts/youtu.be, with or without extra query params), or a
 * bare id typed directly. Returns null if nothing recognisable is found.
 */
export function parseYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  return trimmed.match(VIDEO_ID_PATTERN)?.[1] ?? null;
}

let apiPromise: Promise<typeof window.YT> | null = null;

/** Loads the YouTube IFrame Player API once and resolves with the global `YT` namespace. */
export function loadYouTubeIframeApi(): Promise<typeof window.YT> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("loadYouTubeIframeApi requires a browser"));
  }
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });

  return apiPromise;
}

export {};
