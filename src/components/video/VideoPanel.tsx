"use client";

import { useEffect, useRef, useState } from "react";
import { loadYouTubeIframeApi, parseYouTubeVideoId } from "@/lib/video/youtube";
import type { CaptionChunk } from "@/types";

/** How far `currentTime` has to jump for it to count as a seek rather than
 * a normal one-second playback tick (accounting for 2x speed). */
const SEEK_JUMP_THRESHOLD_SECONDS = 1.5;

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

const WHITEBOARD_POINTS = [
  "Light-dependent reactions → ATP + NADPH",
  "Light-independent reactions (Calvin cycle)",
  "CO₂ + ATP/NADPH → G3P → glucose",
];

/** How often to read the real player's actual position back, in ms —
 * frequent enough that the timeline/captions/attention data track real
 * playback closely, not so frequent it spams state updates. */
const TIME_SYNC_INTERVAL_MS = 250;

/**
 * The lesson stage. Defaults to a CSS composition (no real video file needed
 * for the demo), with an option to swap in a real, controllable YouTube
 * video instead — see the `videoId` state below. Either way, the burned-in
 * caption bar stays on top: this is an accessibility product for deaf
 * learners, so the captions are the hero element and are sized like it.
 */
export function VideoPanel({
  subject,
  title,
  currentTime,
  duration,
  isPlaying,
  speed,
  caption,
  captionNotice,
  onPlayPause,
  onSpeedChange,
  onSeek,
  onRealVideoChange,
}: {
  subject: string;
  title: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  speed: 1 | 2;
  caption: CaptionChunk | null;
  /** Shown instead of a caption when we have no transcript for this video. */
  captionNotice?: string | null;
  onPlayPause: () => void;
  onSpeedChange: (speed: 1 | 2) => void;
  onSeek: (time: number) => void;
  /** Lets the page disable its own artificial playback clock while a real
   * video is providing (via onSeek polling below) its own true position —
   * running both at once would double-advance currentTime. */
  onRealVideoChange?: (active: boolean) => void;
}) {
  const [urlDraft, setUrlDraft] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const isPlayerReadyRef = useRef(false);
  const lastKnownTimeRef = useRef(currentTime);
  const isPlayingRef = useRef(isPlaying);
  const pollIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Create/replace the real player whenever a new video is loaded. There is
  // no real video file otherwise — see the CSS composition below — so this
  // only runs once someone opts in to a YouTube URL.
  useEffect(() => {
    if (!videoId) {
      onRealVideoChange?.(false);
      return;
    }
    onRealVideoChange?.(true);

    let cancelled = false;

    isPlayerReadyRef.current = false;
    loadYouTubeIframeApi().then((YT) => {
      if (cancelled || !playerContainerRef.current) return;
      playerRef.current?.destroy();
      playerRef.current = new YT.Player(playerContainerRef.current, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
        },
        events: {
          onReady: (event) => {
            isPlayerReadyRef.current = true;
            event.target.setPlaybackRate(speed);
            event.target.seekTo(currentTime, true);
            if (isPlaying) event.target.playVideo();

            // The real player's own clock is the source of truth from here
            // on — decoding/buffering means it will never track a plain
            // setInterval exactly, which is what made the timeline/captions
            // visibly drift out of sync with the actual video.
            pollIntervalRef.current = window.setInterval(() => {
              if (!isPlayingRef.current || !playerRef.current) return;
              onSeek(playerRef.current.getCurrentTime());
            }, TIME_SYNC_INTERVAL_MS);
          },
        },
      });
    });

    return () => {
      cancelled = true;
      if (pollIntervalRef.current !== null) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      playerRef.current?.destroy();
      playerRef.current = null;
      isPlayerReadyRef.current = false;
    };
    // Only (re)create the player when the video itself changes — the
    // effects below keep it in sync with playback state after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  useEffect(() => {
    if (!videoId || !isPlayerReadyRef.current || !playerRef.current) return;
    if (isPlaying) {
      playerRef.current.seekTo(currentTime, true);
      playerRef.current.playVideo();
    } else {
      playerRef.current.pauseVideo();
    }
    // Only react to play/pause toggling itself, not every currentTime tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, videoId]);

  useEffect(() => {
    if (!videoId || !isPlayerReadyRef.current || !playerRef.current) return;
    playerRef.current.setPlaybackRate(speed);
  }, [speed, videoId]);

  useEffect(() => {
    const jumped =
      Math.abs(currentTime - lastKnownTimeRef.current) > SEEK_JUMP_THRESHOLD_SECONDS;
    lastKnownTimeRef.current = currentTime;
    if (!videoId || !isPlayerReadyRef.current || !playerRef.current || !jumped) return;
    playerRef.current.seekTo(currentTime, true);
  }, [currentTime, videoId]);

  const handleLoadVideo = () => {
    const id = parseYouTubeVideoId(urlDraft);
    if (!id) {
      setUrlError("That doesn't look like a YouTube video URL.");
      return;
    }
    setUrlError(null);
    setIsFormOpen(false);
    setVideoId(id);
  };

  const handleRemoveVideo = () => {
    setVideoId(null);
    setUrlDraft("");
  };

  return (
    <div className="flex shrink-0 flex-col gap-2.5 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* Say what the lesson is — a stranger should not have to infer it
          from the whiteboard bullets. */}
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
          {subject}
        </span>
        <h2 className="flex-1 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </h2>
        {videoId ? (
          <button
            type="button"
            onClick={handleRemoveVideo}
            className="shrink-0 rounded-full border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Use mock lesson
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIsFormOpen((open) => !open)}
            className="shrink-0 rounded-full border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Use a YouTube video
          </button>
        )}
      </div>

      {isFormOpen && !videoId && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLoadVideo()}
            placeholder="Paste a YouTube video URL"
            aria-label="YouTube video URL"
            className="flex-1 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <button
            type="button"
            onClick={handleLoadVideo}
            className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
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

      <div className="relative aspect-video max-h-[42vh] w-full overflow-hidden rounded-lg bg-gradient-to-br from-slate-800 to-slate-900">
        {videoId ? (
          // Real, controllable YouTube playback. `controls: 0`/`disablekb: 1`
          // keep this transport bar as the only control surface, so a real
          // video gets exactly the same play/pause/speed/seek options as
          // the mock lesson rather than a second, conflicting set.
          //
          // The IFrame API *replaces* whatever element it's given with its
          // own <iframe>, bypassing React's tracking of that node. Mounting
          // it on a plain nested div (rather than the div React itself
          // manages here) keeps that swap invisible to React's reconciler —
          // otherwise React later tries to remove a node YouTube already
          // replaced and throws a NotFoundError.
          <div className="absolute inset-0 [&>iframe]:absolute [&>iframe]:inset-0 [&>iframe]:h-full [&>iframe]:w-full">
            <div ref={playerContainerRef} />
          </div>
        ) : (
          <>
            {/* Whiteboard */}
            <div className="absolute left-[6%] top-[10%] h-[62%] w-[52%] rounded-md bg-slate-50 p-4 shadow-lg">
              <p className="mb-2 border-b border-slate-300 pb-1.5 text-sm font-bold text-slate-800">
                Today&apos;s key points
              </p>
              <ul className="flex flex-col gap-1.5">
                {WHITEBOARD_POINTS.map((point) => (
                  <li key={point} className="text-xs leading-snug text-slate-700">
                    • {point}
                  </li>
                ))}
              </ul>
            </div>

            {/* Presenter */}
            <div className="absolute bottom-[32%] right-[8%] flex flex-col items-center gap-2">
              <div className="h-16 w-16 rounded-full bg-gradient-to-b from-amber-200 to-amber-300 shadow-md" />
              <div className="h-12 w-20 rounded-t-3xl bg-teal-600 shadow-md" />
            </div>
            <span className="absolute left-[6%] top-[76%] rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
              Prof. Emma Rossi
            </span>
          </>
        )}

        {/* Burned-in captions. Fixed height so the stage does not jump as
            chunks change length. Stays on top of a real video too — this is
            an accessibility product, the captions are the hero element
            regardless of what is playing underneath. */}
        <div className="absolute inset-x-0 bottom-0 flex min-h-[26%] items-center justify-center bg-black/75 px-6 py-4 backdrop-blur-sm">
          {captionNotice ? (
            <p className="line-clamp-2 text-center text-base font-medium leading-snug text-white/70">
              {captionNotice}
            </p>
          ) : (
            <p className="line-clamp-2 text-center text-2xl font-semibold leading-snug text-white xl:text-3xl">
              {caption?.text ?? ""}
            </p>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onPlayPause}
          className="rounded-full bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={() => onSpeedChange(speed === 1 ? 2 : 1)}
          aria-label={`Playback speed ${speed}x, click to change`}
          className="rounded-full border border-zinc-300 px-2.5 py-1.5 text-xs font-medium tabular-nums text-zinc-700 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {speed}×
        </button>
        <span className="w-20 shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <span className="hidden shrink-0 text-xs text-zinc-400 xl:inline dark:text-zinc-500">
          Space play · ← → seek
        </span>
        <input
          type="range"
          min={0}
          max={duration}
          step={1}
          value={currentTime}
          aria-label="Seek lesson"
          onChange={(e) => onSeek(Number(e.target.value))}
          className="flex-1 accent-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        />
      </div>
    </div>
  );
}
