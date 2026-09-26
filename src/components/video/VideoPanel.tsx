"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { loadYouTubeIframeApi, parseYouTubeVideoId } from "@/lib/video/youtube";
import type { CaptionChunk } from "@/types";

/** How often the real player's position is reported up to the page. */
const POLL_INTERVAL_MS = 250;
/** A page-side time further than this from the player's own is a seek. */
const SEEK_TOLERANCE_SECONDS = 0.75;
/** Right after a seek the player can still report its old position. */
const SEEK_SETTLE_MS = 1000;

const YT_ENDED = 0;
const YT_PLAYING = 1;
const YT_PAUSED = 2;

/** YouTube IFrame API `onError` codes — see the API's onError docs. */
function describeYouTubeError(code: number): string {
  switch (code) {
    case 2:
      return "That doesn't look like a valid YouTube video.";
    case 5:
      return "This video can't be played in an embedded player.";
    case 100:
      return "This video was not found — it may have been removed or made private.";
    case 101:
    case 150:
      return "This video's owner has disabled playback on other sites.";
    default:
      return "YouTube couldn't play this video.";
  }
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * The lesson stage. Holds one of exactly two real sources: a YouTube video
 * or live speech-to-text from the room. In YouTube mode the player is the
 * clock — it reports its position, duration and play state up through the
 * `onVideo*` callbacks. With no lesson loaded it shows an empty state that
 * asks for one, rather than inventing a lesson to display.
 *
 * Either way the caption bar stays on top: this is an accessibility product
 * for deaf learners, so the captions are the hero element.
 */
export function VideoPanel({
  subject,
  title,
  hasLesson,
  currentTime,
  duration,
  isPlaying,
  speed,
  caption,
  captionNotice,
  videoId,
  isLiveLesson,
  isTranscribing,
  transcriptionSupported,
  transcriptionError,
  onPlayPause,
  onSpeedChange,
  onSeek,
  onVideoChange,
  onVideoTimeUpdate,
  onVideoDurationChange,
  onVideoPlayingChange,
  onStartTranscription,
  onStopTranscription,
}: {
  subject: string;
  title: string;
  /** False before a YouTube video or live transcription has been started. */
  hasLesson: boolean;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  speed: 1 | 2;
  caption: CaptionChunk | null;
  /** Shown in the caption bar when there is no caption text to show. */
  captionNotice?: string | null;
  videoId: string | null;
  isLiveLesson: boolean;
  isTranscribing: boolean;
  transcriptionSupported: boolean;
  transcriptionError: string | null;
  onPlayPause: () => void;
  onSpeedChange: (speed: 1 | 2) => void;
  onSeek: (time: number) => void;
  onVideoChange: (videoId: string | null) => void;
  onVideoTimeUpdate: (time: number) => void;
  onVideoDurationChange: (duration: number) => void;
  onVideoPlayingChange: (playing: boolean) => void;
  onStartTranscription: () => void;
  onStopTranscription: () => void;
}) {
  const [urlDraft, setUrlDraft] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  /** Set by the player's own `onError` — a bad/unembeddable video, not a bad
   *  URL. Keyed by videoId (rather than reset in the load effect) so a stale
   *  error from a previous video can't flash on the next one. */
  const [playbackError, setPlaybackError] = useState<{
    videoId: string;
    message: string;
  } | null>(null);
  const [showCaptions, setShowCaptions] = useState(true);

  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  /** Set only once the player is ready to take commands. */
  const playerRef = useRef<YT.Player | null>(null);
  /** Last position reported up to the page, so a `currentTime` that
   * disagrees with it can be recognised as a seek from elsewhere. */
  const lastReportedTimeRef = useRef(0);
  const pendingSeekRef = useRef<{ target: number; until: number } | null>(null);

  const reportTime = useEffectEvent((time: number) => onVideoTimeUpdate(time));
  const reportDuration = useEffectEvent((seconds: number) => onVideoDurationChange(seconds));
  const applyInitialState = useEffectEvent((player: YT.Player) => {
    player.setPlaybackRate(speed);
    if (isPlaying) player.playVideo();
  });
  const handleStateChange = useEffectEvent((state: number, player: YT.Player) => {
    // Keep YouTube's native captions suppressed so they do not clash with ours
    try {
      (player as unknown as { unloadModule?: (m: string) => void }).unloadModule?.("captions");
      (player as unknown as { unloadModule?: (m: string) => void }).unloadModule?.("cc");
      (player as unknown as { setOption?: (m: string, k: string, v: unknown) => void }).setOption?.("captions", "track", {});
    } catch {}

    if (state === YT_PLAYING) {
      // Seeking a video that has never played starts it; if the student
      // was only scrubbing while paused, keep it paused.
      if (!isPlaying && pendingSeekRef.current) {
        player.pauseVideo();
        return;
      }
      onVideoPlayingChange(true);
    } else if (state === YT_PAUSED || state === YT_ENDED) {
      onVideoPlayingChange(false);
    }
  });
  const seekPlayer = useEffectEvent((time: number) => {
    const player = playerRef.current;
    if (!player) return;
    if (Math.abs(time - lastReportedTimeRef.current) <= SEEK_TOLERANCE_SECONDS) return;
    lastReportedTimeRef.current = time;
    pendingSeekRef.current = { target: time, until: performance.now() + SEEK_SETTLE_MS };
    player.seekTo(time, true);
    if (!isPlaying) player.pauseVideo();
  });

  // Create the real player whenever a new video is chosen, and poll it for
  // its position while it exists.
  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    let created: YT.Player | null = null;
    let poll: ReturnType<typeof setInterval> | undefined;
    lastReportedTimeRef.current = 0;
    pendingSeekRef.current = null;

    loadYouTubeIframeApi().then((YT) => {
      if (cancelled || !playerContainerRef.current) return;
      const player = new YT.Player(playerContainerRef.current, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          cc_load_policy: 0,
          cc_lang_pref: "none",
          iv_load_policy: 3,
          fs: 0,
        },
        events: {
          onReady: () => {
            if (cancelled) return;
            playerRef.current = player;
            applyInitialState(player);

            // Suppress YouTube's internal captions so they don't clash with ours
            try {
              (player as unknown as { unloadModule?: (m: string) => void }).unloadModule?.("captions");
              (player as unknown as { unloadModule?: (m: string) => void }).unloadModule?.("cc");
              (player as unknown as { setOption?: (m: string, k: string, v: unknown) => void }).setOption?.("captions", "track", {});
            } catch {}

            let lastDuration = 0;
            poll = setInterval(() => {
              const seconds = player.getDuration();
              if (seconds > 0 && seconds !== lastDuration) {
                lastDuration = seconds;
                reportDuration(seconds);
              }

              const time = player.getCurrentTime();
              const pending = pendingSeekRef.current;
              if (pending) {
                const stale = Math.abs(time - pending.target) > 1.5;
                if (stale && performance.now() < pending.until) return;
                pendingSeekRef.current = null;
              }
              if (Math.abs(time - lastReportedTimeRef.current) < 0.05) return;
              lastReportedTimeRef.current = time;
              reportTime(time);
            }, POLL_INTERVAL_MS);
          },
          onStateChange: (event) => handleStateChange(event.data, player),
          onError: (event) =>
            setPlaybackError({ videoId, message: describeYouTubeError(event.data) }),
        },
      });
      created = player;
    });

    return () => {
      cancelled = true;
      clearInterval(poll);
      created?.destroy();
      playerRef.current = null;
    };
  }, [videoId]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    if (isPlaying) player.playVideo();
    else player.pauseVideo();
  }, [isPlaying]);

  useEffect(() => {
    playerRef.current?.setPlaybackRate(speed);
  }, [speed]);

  // Any change to `currentTime` that didn't come from the player itself —
  // the slider, arrow keys, a transcript line, the timeline, "Replay" — is
  // a seek.
  useEffect(() => {
    seekPlayer(currentTime);
  }, [currentTime]);

  const handleLoadVideo = () => {
    const id = parseYouTubeVideoId(urlDraft);
    if (!id) {
      setUrlError("That doesn't look like a YouTube video URL.");
      return;
    }
    setUrlError(null);
    setIsFormOpen(false);
    onVideoChange(id);
  };

  const handleRemoveVideo = () => {
    onVideoChange(null);
    setUrlDraft("");
  };

  const currentPlaybackError =
    videoId && playbackError?.videoId === videoId ? playbackError.message : null;

  return (
    <div className="flex shrink-0 flex-col gap-2.5 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* Say what the lesson is — a stranger should not have to infer it
          from the whiteboard bullets. */}
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {subject}
        </span>
        <h2 className="flex-1 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </h2>
        {/* Lesson source: exactly one of the two real ones is ever active. */}
        {videoId ? (
          <button
            type="button"
            onClick={handleRemoveVideo}
            className="shrink-0 rounded-full border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Remove video
          </button>
        ) : isLiveLesson ? (
          <div className="flex shrink-0 items-center gap-1.5">
            {isTranscribing ? (
              <button
                type="button"
                onClick={onStopTranscription}
                className="flex items-center gap-1.5 rounded-full bg-rose-600 px-2.5 py-0.5 text-xs font-medium text-white hover:bg-rose-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
              >
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-white motion-reduce:animate-none"
                />
                Stop transcribing
              </button>
            ) : null}
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onStartTranscription}
              disabled={!transcriptionSupported}
              title={
                transcriptionSupported
                  ? undefined
                  : "This browser has no speech recognition — try Chrome or Edge."
              }
              className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Live transcription
            </button>
            <button
              type="button"
              onClick={() => setIsFormOpen((open) => !open)}
              className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              YouTube video
            </button>
          </div>
        )}
      </div>

      {transcriptionError && (
        <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {transcriptionError}
        </p>
      )}

      {isFormOpen && !videoId && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLoadVideo()}
            placeholder="Paste a YouTube video URL"
            aria-label="YouTube video URL"
            className="flex-1 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <button
            type="button"
            onClick={handleLoadVideo}
            className="shrink-0 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Load
          </button>
        </div>
      )}
      {urlError && (
        <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {urlError}
        </p>
      )}

      <div className="relative aspect-video max-h-[48vh] w-full overflow-hidden rounded-lg bg-gradient-to-br from-slate-800 to-slate-900 shadow-inner">
        {videoId ? (
          // Real, controllable YouTube playback with native GUI and captions disabled.
          // Pointer-events on the iframe are disabled so YouTube's native controls,
          // cards, and captions cannot intercept clicks or clash with FocusAid.
          <div
            className="absolute inset-0 cursor-pointer [&>iframe]:pointer-events-none [&>iframe]:absolute [&>iframe]:inset-0 [&>iframe]:h-full [&>iframe]:w-full"
            onClick={() => {
              if (!currentPlaybackError) onPlayPause();
            }}
            title={currentPlaybackError ? undefined : isPlaying ? "Click to pause" : "Click to play"}
          >
            <div ref={playerContainerRef} />
            {currentPlaybackError && (
              <div className="pointer-events-auto absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-900/95 p-6 text-center">
                <p role="alert" className="text-sm font-medium text-white">
                  {currentPlaybackError}
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveVideo();
                  }}
                  className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Try another video
                </button>
              </div>
            )}
          </div>
        ) : isLiveLesson ? (
          // Live transcription has no picture — the room is the lesson. Show
          // that it is running rather than a black rectangle.
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white">
              <span
                aria-hidden
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400 motion-reduce:animate-none"
              />
              Listening to this room
            </span>
            <p className="max-w-sm text-sm text-slate-300">
              Captions appear below as the lesson is spoken.
            </p>
          </div>
        ) : (
          // No lesson yet. Say what to do next instead of showing a stand-in.
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <svg
              viewBox="0 0 24 24"
              className="h-9 w-9 text-slate-500"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
              <path d="M10 9.5l5 2.5-5 2.5z" fill="currentColor" stroke="none" />
            </svg>
            <p className="text-sm font-medium text-slate-200">No lesson loaded</p>
            <p className="max-w-sm text-xs leading-relaxed text-slate-400">
              Paste a YouTube link, or start live transcription to caption a
              lesson happening in the room.
            </p>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={onStartTranscription}
                disabled={!transcriptionSupported}
                title={
                  transcriptionSupported
                    ? undefined
                    : "This browser has no speech recognition — try Chrome or Edge."
                }
                className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Start live transcription
              </button>
              <button
                type="button"
                onClick={() => setIsFormOpen(true)}
                className="rounded-full border border-white/30 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Use a YouTube video
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Dedicated Captions Bar (Positioned below the video, NOT an overlay) */}
      {showCaptions && (caption || captionNotice) && (
        <div className="flex min-h-[3.25rem] items-center justify-center rounded-lg border border-zinc-200/80 bg-zinc-900 px-4 py-2 text-center shadow-sm dark:border-zinc-800 dark:bg-black">
          {caption ? (
            <p className="text-sm font-semibold leading-relaxed text-white drop-shadow-sm sm:text-base md:text-lg">
              {caption.text}
            </p>
          ) : captionNotice ? (
            <p role="status" className="text-xs font-medium text-zinc-300">
              {captionNotice}
            </p>
          ) : null}
        </div>
      )}

      {/* Controls. Hidden with no lesson loaded — there is nothing to play,
          and a dead transport bar reads as a broken app. */}
      <div
        className="flex items-center gap-3"
        hidden={!hasLesson}
      >
        <button
          type="button"
          onClick={onPlayPause}
          className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={() => onSpeedChange(speed === 1 ? 2 : 1)}
          aria-label={`Playback speed ${speed}x, click to change`}
          className="rounded-full border border-zinc-300 px-2.5 py-1.5 text-xs font-medium tabular-nums text-zinc-700 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {speed}×
        </button>
        <button
          type="button"
          onClick={() => setShowCaptions((prev) => !prev)}
          aria-pressed={showCaptions}
          title={showCaptions ? "Hide captions" : "Show captions"}
          className={`rounded-full border px-2.5 py-1.5 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 ${
            showCaptions
              ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
              : "border-zinc-300 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          }`}
        >
          CC
        </button>
        <span className="w-20 shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <span className="hidden shrink-0 text-xs text-zinc-400 xl:inline dark:text-zinc-500">
          Space play · ← → seek
        </span>
        {!videoId && (
          <input
            type="range"
            min={0}
            max={duration}
            step={1}
            value={currentTime}
            aria-label="Seek lesson"
            onChange={(e) => onSeek(Number(e.target.value))}
            className="flex-1 accent-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
          />
        )}
      </div>
    </div>
  );
}
