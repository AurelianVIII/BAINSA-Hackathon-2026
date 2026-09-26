"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Header } from "@/components/layout/Header";
import { VideoPanel } from "@/components/video/VideoPanel";
import { TranscriptPanel } from "@/components/transcript/TranscriptPanel";
import { CatchUpButton } from "@/components/catchup/CatchUpButton";
import { MissedAlert } from "@/components/catchup/MissedAlert";
import { AttentionTracker } from "@/components/attention/AttentionTracker";
import { AttentionTimeline } from "@/components/attention/AttentionTimeline";
import { AiSummaryPanel } from "@/components/summary/AiSummaryPanel";
import { VisualSummaryTab } from "@/components/summary/VisualSummaryTab";
import { KeyMoments } from "@/components/threads/KeyMoments";
import { transcript } from "@/data/transcript";
import { attentionEvents } from "@/data/attention-events";
import { attentionSamples } from "@/data/attention-samples";
import { getCaptionAt } from "@/data/captions";
import { buildTimelineBands, getAttentionLevel, getSampleAt } from "@/lib/attention";
import { buildMissedWindow, getPendingAlert } from "@/lib/catchup";
import { useYouTubeCaptions } from "@/lib/video/useYouTubeCaptions";
import { findCaptionAt } from "@/lib/video/youtube-captions";
import type { AttentionSample, MissedWindow, TranscriptItem } from "@/types";

const LESSON_DURATION = 300;
const NO_ITEMS: TranscriptItem[] = [];
const LESSON_SUBJECT = "Biology";
const LESSON_TITLE = "Photosynthesis and the Calvin Cycle";

/** Seconds moved by the left/right arrow shortcuts. */
const SEEK_STEP_SECONDS = 5;

/** Event types that mean the student actually lost the thread. */
const MISSED_EVENT_TYPES = ["looking-away", "low-attention"] as const;

/**
 * Composition layer for the lesson screen. `currentTime` is the single
 * source of truth for lesson playback, owned here and passed down to every
 * feature area — do not create competing playback state elsewhere.
 *
 * Page-level state is the four pieces agreed in ROADMAP §2 (`currentTime`,
 * `isPlaying`, `summaryRequest`, `dismissedAlertIds`) plus the optional
 * YouTube source. With a YouTube video loaded, the player drives
 * `currentTime` and its real captions replace the mock transcript.
 */
export default function Home() {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [summaryRequest, setSummaryRequest] = useState<MissedWindow | null>(null);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<string[]>([]);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  // Real webcam detections recorded by second, keyed on the same integer
  // seconds as the simulated `attentionSamples` — overrides the simulated
  // value at that second once a real reading exists.
  const [recordedSamples, setRecordedSamples] = useState<Record<number, AttentionSample>>({});

  const youtubeCaptions = useYouTubeCaptions(videoId);
  const isYouTube = videoId !== null;
  const youtubeReady = youtubeCaptions.status === "ready" ? youtubeCaptions : null;
  const youtubeMeta =
    youtubeCaptions.status === "ready" || youtubeCaptions.status === "unavailable"
      ? youtubeCaptions
      : null;

  const lessonItems = isYouTube ? (youtubeReady?.items ?? NO_ITEMS) : transcript;
  const lessonDuration = isYouTube
    ? Math.ceil(videoDuration ?? youtubeMeta?.duration ?? 0) || LESSON_DURATION
    : LESSON_DURATION;

  // Read inside the interval/keyboard callbacks so they do not have to be
  // re-registered on every tick just to know where playback is.
  const currentTimeRef = useRef(currentTime);
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);
  const lessonDurationRef = useRef(lessonDuration);
  useEffect(() => {
    lessonDurationRef.current = lessonDuration;
  }, [lessonDuration]);

  // Keyboard shortcuts for driving playback hands-free. Interactive
  // elements are skipped so this never steals space from a focused button
  // or arrow keys from the tablist, the slider or a textarea.
  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "button, a, input, textarea, select, [role='tab'], [contenteditable='true']"
        )
      ) {
        return;
      }

      if (event.key === " " || event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsPlaying((playing) => !playing);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setCurrentTime((time) => Math.max(0, time - SEEK_STEP_SECONDS));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setCurrentTime((time) =>
          Math.min(lessonDurationRef.current, time + SEEK_STEP_SECONDS)
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // The playback clock for the mock lesson. Everything on this screen is
  // time-driven, so this interval is what makes the demo move at all. A
  // YouTube video is its own clock (VideoPanel reports its position), so
  // this stands down while one is loaded.
  useEffect(() => {
    if (!isPlaying || isYouTube) return;
    const interval = setInterval(() => {
      if (currentTimeRef.current >= LESSON_DURATION) {
        setIsPlaying(false);
        return;
      }
      setCurrentTime((time) => Math.min(time + 1, LESSON_DURATION));
    }, 1000 / speed);
    return () => clearInterval(interval);
  }, [isPlaying, speed, isYouTube]);

  const attentionSample = getSampleAt(attentionSamples, currentTime);
  const attentionLevel = getAttentionLevel(attentionSample);
  const caption = isYouTube
    ? findCaptionAt(youtubeReady?.captions ?? [], currentTime)
    : getCaptionAt(currentTime);
  const captionNotice = !isYouTube
    ? null
    : youtubeCaptions.status === "loading"
      ? "Loading captions…"
      : youtubeCaptions.status === "unavailable"
        ? youtubeCaptions.message
        : null;

  const handleLiveAttentionSample = (sample: AttentionSample) => {
    setRecordedSamples((prev) => ({ ...prev, [Math.round(sample.t)]: sample }));
  };
  // The wave shows real detected data wherever it's been recorded, falling
  // back to the simulated curve everywhere else — the coloured bands stay
  // tied to the scripted attentionEvents narrative regardless, since the
  // missed-window/catch-up alert logic depends on that staying consistent.
  // Recordings past the simulated curve's end (a long YouTube video) are
  // kept rather than dropped.
  const timelineSamples = useMemo(() => {
    const bySecond = new Map(attentionSamples.map((sample) => [sample.t, sample]));
    for (const [second, sample] of Object.entries(recordedSamples)) {
      bySecond.set(Number(second), sample);
    }
    return [...bySecond.values()].sort((a, b) => a.t - b.t);
  }, [recordedSamples]);

  // Missed-line highlighting comes from PC2's buildMissedWindow, so the
  // transcript marks exactly the lines their alert offers to explain.
  const missedIds = useMemo(
    () =>
      attentionEvents
        .filter((event) =>
          (MISSED_EVENT_TYPES as readonly string[]).includes(event.type)
        )
        .flatMap(
          (event) =>
            buildMissedWindow(attentionEvents, lessonItems, event).transcriptIds
        ),
    [lessonItems]
  );

  // PC2 owns the "has the student just come back?" rule.
  const activeAlert = getPendingAlert(
    attentionEvents,
    lessonItems,
    currentTime,
    dismissedAlertIds
  );
  const timelineBands = useMemo(
    () => buildTimelineBands(attentionEvents, lessonItems, lessonDuration),
    [lessonItems, lessonDuration]
  );

  const handleSeek = (time: number) => {
    setCurrentTime(Math.max(0, Math.min(time, lessonDuration)));
  };

  const handleVideoChange = (id: string | null) => {
    setVideoId(id);
    setVideoDuration(null);
    setCurrentTime(0);
    setIsPlaying(false);
    setSummaryRequest(null);
    setDismissedAlertIds([]);
    // Webcam readings belong to the lesson they were recorded against.
    setRecordedSamples({});
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      <Header isLive={isPlaying} />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[3fr_2fr] lg:overflow-hidden">
        {/* Left column: the lesson itself. */}
        <div className="flex min-h-0 flex-col gap-3">
          <VideoPanel
            subject={
              !isYouTube
                ? LESSON_SUBJECT
                : youtubeReady?.autoGenerated
                  ? "YouTube · auto-captions"
                  : "YouTube"
            }
            title={isYouTube ? (youtubeMeta?.title ?? "YouTube video") : LESSON_TITLE}
            currentTime={currentTime}
            duration={lessonDuration}
            isPlaying={isPlaying}
            speed={speed}
            caption={caption}
            captionNotice={captionNotice}
            videoId={videoId}
            onPlayPause={() => setIsPlaying((playing) => !playing)}
            onSpeedChange={setSpeed}
            onSeek={handleSeek}
            onVideoChange={handleVideoChange}
            onVideoTimeUpdate={setCurrentTime}
            onVideoDurationChange={setVideoDuration}
            onVideoPlayingChange={setIsPlaying}
          />
          <TranscriptPanel
            items={lessonItems}
            currentTime={currentTime}
            onSeek={handleSeek}
            missedIds={missedIds}
            keyMomentsSlot={
              <KeyMoments
                items={lessonItems}
                currentTime={currentTime}
                onSeek={handleSeek}
                missedIds={missedIds}
                onRequestSummary={setSummaryRequest}
              />
            }
            visualSummarySlot={
              <VisualSummaryTab
                items={lessonItems}
                currentTime={currentTime}
                onSeek={handleSeek}
              />
            }
          />
        </div>

        {/* Right column: what the app noticed, and what it offers. */}
        <div className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto">
          <AttentionTracker
            currentTime={currentTime}
            sample={attentionSample}
            level={attentionLevel}
            onLiveSample={handleLiveAttentionSample}
          />

          <MissedAlert
            window={activeAlert}
            onShowSummary={(window: MissedWindow) => setSummaryRequest(window)}
            onReplay={handleSeek}
            onDismiss={() =>
              activeAlert &&
              setDismissedAlertIds((ids) => [...ids, activeAlert.id])
            }
          />

          {/* The summary sits directly under the alert: it is the answer to
              the question the alert just asked, and keeping them adjacent
              means the payoff is on screen when the student acts on it.
              The manual catch-up goes last. */}
          <AiSummaryPanel request={summaryRequest} />

          <CatchUpButton
            currentTime={currentTime}
            items={isYouTube ? lessonItems : undefined}
          />
        </div>
      </div>

      <div className="shrink-0 px-3 pb-3">
        <AttentionTimeline
          bands={timelineBands}
          samples={timelineSamples}
          duration={lessonDuration}
          currentTime={currentTime}
          onSeek={handleSeek}
        />
      </div>
    </div>
  );
}
