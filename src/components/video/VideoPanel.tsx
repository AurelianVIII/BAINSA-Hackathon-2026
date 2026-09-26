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

/**
 * The lesson stage. Defaults to a CSS composition (no real video file needed
 * for the demo), with an option to swap in a real YouTube video. In YouTube
 * mode the player is the clock: it reports its position, duration and
 * play state up through the `onVideo*` callbacks, and the page's own clock
 * stands down. Either way, the burned-in caption bar stays on top: this is
 * an accessibility product for deaf learners, so the captions are the hero
 * element and are sized like it.
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
  videoId,
  onPlayPause,
  onSpeedChange,
  onSeek,
  onVideoChange,
  onVideoTimeUpdate,
  onVideoDurationChange,
  onVideoPlayingChange,
}: {
  subject: string;
  title: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  speed: 1 | 2;
  caption: CaptionChunk | null;
  /** Shown in the caption bar when there is no caption text to show. */
  captionNotice?: string | null;
  videoId: string | null;
  onPlayPause: () => void;
  onSpeedChange: (speed: 1 | 2) => void;
  onSeek: (time: number) => void;
  onVideoChange: (videoId: string | null) => void;
  onVideoTimeUpdate: (time: number) => void;
  onVideoDurationChange: (duration: number) => void;
  onVideoPlayingChange: (playing: boolean) => void;
}) {
  const [urlDraft, setUrlDraft] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

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
        },
        events: {
          onReady: () => {
            if (cancelled) return;
            playerRef.current = player;
            applyInitialState(player);

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
          {caption || !captionNotice ? (
            <p className="line-clamp-2 text-center text-2xl font-semibold leading-snug text-white xl:text-3xl">
              {caption?.text ?? ""}
            </p>
          ) : (
            <p role="status" className="text-center text-base font-medium text-white/75">
              {captionNotice}
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
