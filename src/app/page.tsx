"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Header } from "@/components/layout/Header";
import { VideoPanel } from "@/components/video/VideoPanel";
import { TranscriptPanel } from "@/components/transcript/TranscriptPanel";
import { CatchUpButton } from "@/components/catchup/CatchUpButton";
import { AttentionTracker } from "@/components/attention/AttentionTracker";
import { AttentionTimeline } from "@/components/attention/AttentionTimeline";
import { MissedAlert } from "@/components/catchup/MissedAlert";
import { VisualSummary } from "@/components/summary/VisualSummary";
import { TopicThreads } from "@/components/threads/TopicThreads";
import { Card } from "@/components/ui/Card";
import { transcript } from "@/data/transcript";
import { attentionEvents } from "@/data/attention-events";
import { attentionSamples } from "@/data/attention-samples";
import { getCaptionAt } from "@/data/captions";
import { buildTimelineBands, getAttentionLevel, getSampleAt } from "@/lib/attention";
import { buildMissedWindow, getPendingAlert } from "@/lib/catchup";
import type { AttentionEventType, MissedWindow } from "@/types";

const LESSON_DURATION = 300;

/** Event types that mean the student actually lost the thread. */
const MISSED_EVENT_TYPES: AttentionEventType[] = ["looking-away", "low-attention"];

const missedEvents = attentionEvents.filter((event) =>
  MISSED_EVENT_TYPES.includes(event.type)
);

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

  // Read inside the interval callback so the clock does not have to restart
  // on every tick just to know where it is.
  const currentTimeRef = useRef(currentTime);
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  // The playback clock. Everything on this screen is time-driven, so this
  // interval is what makes the demo move at all.
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      if (currentTimeRef.current >= LESSON_DURATION) {
        setIsPlaying(false);
        return;
      }
      setCurrentTime((time) => Math.min(time + 1, LESSON_DURATION));
    }, 1000 / speed);
    return () => clearInterval(interval);
  }, [isPlaying, speed]);

  const attentionSample = getSampleAt(attentionSamples, currentTime);
  const attentionLevel = getAttentionLevel(attentionSample);
  const caption = getCaptionAt(currentTime);
  const missedWindows = useMemo(
    () => missedEvents.map((event) => buildMissedWindow(missedEvents, transcript, event)),
    []
  );
  const missedIds = useMemo(
    () => missedWindows.flatMap((window) => window.transcriptIds),
    [missedWindows]
  );

  const activeAlert = getPendingAlert(
    missedEvents,
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
            currentTime={currentTime}
            duration={LESSON_DURATION}
            isPlaying={isPlaying}
            speed={speed}
            caption={caption}
            onPlayPause={() => setIsPlaying((playing) => !playing)}
            onSpeedChange={setSpeed}
            onSeek={handleSeek}
          />
          <TranscriptPanel
            items={transcript}
            currentTime={currentTime}
            onSeek={handleSeek}
            missedIds={missedIds}
            keyMomentsSlot={<TopicThreads />}
            visualSummarySlot={<VisualSummary />}
          />
        </div>

        {/* Right column: what the app noticed, and what it offers. */}
        <div className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto">
          <AttentionTracker
            currentTime={currentTime}
            sample={attentionSample}
            level={attentionLevel}
          />

          <MissedAlert
            window={activeAlert}
            onShowSummary={setSummaryRequest}
            onReplay={handleSeek}
            onDismiss={() =>
              activeAlert &&
              setDismissedAlertIds((ids) => [...ids, activeAlert.id])
            }
          />

          <CatchUpButton currentTime={currentTime} />

          {/* Slot for PC4's <AiSummaryPanel request={summaryRequest} />. */}
          <Card title="AI summary">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {summaryRequest
                ? `Preparing a summary of ${summaryRequest.start}s–${summaryRequest.end}s…`
                : "Ask for a catch-up and the summary of what you missed appears here."}
            </p>
          </Card>
        </div>
      </div>

      <div className="shrink-0 px-3 pb-3">
        <AttentionTimeline
          bands={timelineBands}
          samples={attentionSamples}
          duration={LESSON_DURATION}
          currentTime={currentTime}
          onSeek={handleSeek}
        />
      </div>
    </div>
  );
}
