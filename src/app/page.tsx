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
import type { AttentionSample, MissedWindow } from "@/types";

const LESSON_DURATION = 300;
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
 * Page-level state is limited to the four pieces agreed in ROADMAP §2:
 * `currentTime`, `isPlaying`, `summaryRequest` and `dismissedAlertIds`.
 */
export default function Home() {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [summaryRequest, setSummaryRequest] = useState<MissedWindow | null>(null);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<string[]>([]);
  // A real video reports its own true position (see VideoPanel's polling) —
  // running the artificial clock at the same time would double-advance
  // currentTime, so the clock below defers to it whenever it's active.
  const [hasRealVideo, setHasRealVideo] = useState(false);
  // Real webcam detections recorded by second, keyed on the same integer
  // seconds as the simulated `attentionSamples` — overrides the simulated
  // value at that second once a real reading exists.
  const [recordedSamples, setRecordedSamples] = useState<Record<number, AttentionSample>>({});

  // Read inside the interval callback so the clock does not have to restart
  // on every tick just to know where it is.
  const currentTimeRef = useRef(currentTime);
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

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
          Math.min(LESSON_DURATION, time + SEEK_STEP_SECONDS)
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // The playback clock. Everything on this screen is time-driven, so this
  // interval is what makes the demo move at all — unless a real video is
  // loaded, in which case its own polled position drives currentTime
  // instead (see hasRealVideo above).
  useEffect(() => {
    if (!isPlaying || hasRealVideo) return;
    const interval = setInterval(() => {
      if (currentTimeRef.current >= LESSON_DURATION) {
        setIsPlaying(false);
        return;
      }
      setCurrentTime((time) => Math.min(time + 1, LESSON_DURATION));
    }, 1000 / speed);
    return () => clearInterval(interval);
  }, [isPlaying, speed, hasRealVideo]);

  const attentionSample = getSampleAt(attentionSamples, currentTime);
  const attentionLevel = getAttentionLevel(attentionSample);
  const caption = getCaptionAt(currentTime);
  const handleLiveAttentionSample = (sample: AttentionSample) => {
    setRecordedSamples((prev) => ({ ...prev, [Math.round(sample.t)]: sample }));
  };
  // The wave shows real detected data wherever it's been recorded, falling
  // back to the simulated curve everywhere else — the coloured bands stay
  // tied to the scripted attentionEvents narrative regardless, since the
  // missed-window/catch-up alert logic depends on that staying consistent.
  const timelineSamples = useMemo(
    () => attentionSamples.map((sample) => recordedSamples[sample.t] ?? sample),
    [recordedSamples]
  );
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
            buildMissedWindow(attentionEvents, transcript, event).transcriptIds
        ),
    []
  );

  // PC2 owns the "has the student just come back?" rule.
  const activeAlert = getPendingAlert(
    attentionEvents,
    transcript,
    currentTime,
    dismissedAlertIds
  );
  const timelineBands = useMemo(
    () => buildTimelineBands(attentionEvents, transcript, LESSON_DURATION),
    []
  );

  const handleSeek = (time: number) => {
    setCurrentTime(Math.max(0, Math.min(time, LESSON_DURATION)));
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      <Header isLive={isPlaying} />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[3fr_2fr] lg:overflow-hidden">
        {/* Left column: the lesson itself. */}
        <div className="flex min-h-0 flex-col gap-3">
          <VideoPanel
            subject={LESSON_SUBJECT}
            title={LESSON_TITLE}
            currentTime={currentTime}
            duration={LESSON_DURATION}
            isPlaying={isPlaying}
            speed={speed}
            caption={caption}
            onPlayPause={() => setIsPlaying((playing) => !playing)}
            onSpeedChange={setSpeed}
            onSeek={handleSeek}
            onRealVideoChange={setHasRealVideo}
          />
          <TranscriptPanel
            items={transcript}
            currentTime={currentTime}
            onSeek={handleSeek}
            missedIds={missedIds}
            keyMomentsSlot={
              <KeyMoments
                items={transcript}
                currentTime={currentTime}
                onSeek={handleSeek}
                missedIds={missedIds}
                onRequestSummary={setSummaryRequest}
              />
            }
            visualSummarySlot={
              <VisualSummaryTab
                items={transcript}
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

          <CatchUpButton currentTime={currentTime} />
        </div>
      </div>

      <div className="shrink-0 px-3 pb-3">
        <AttentionTimeline
          bands={timelineBands}
          samples={timelineSamples}
          duration={LESSON_DURATION}
          currentTime={currentTime}
          onSeek={handleSeek}
        />
      </div>
    </div>
  );
}
