"use client";

import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { VideoPanel } from "@/components/video/VideoPanel";
import { TranscriptPanel } from "@/components/transcript/TranscriptPanel";
import { CatchUpButton } from "@/components/catchup/CatchUpButton";
import { AttentionTracker } from "@/components/attention/AttentionTracker";
import { AttentionTimeline } from "@/components/attention/AttentionTimeline";
import { VisualSummary } from "@/components/summary/VisualSummary";
import { TopicThreads } from "@/components/threads/TopicThreads";
import { transcript } from "@/data/transcript";
import { attentionEvents } from "@/data/attention-events";
import { attentionSamples } from "@/data/attention-samples";
import { buildTimelineBands, getAttentionLevel, getSampleAt } from "@/lib/attention";

const LESSON_DURATION = 300;

/**
 * Composition layer for the lesson screen. `currentTime` is the single
 * source of truth for lesson playback, owned here and passed down to every
 * feature area — do not create competing playback state elsewhere.
 */
export default function Home() {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentTime((time) => {
        if (time >= LESSON_DURATION) {
          setIsPlaying(false);
          return LESSON_DURATION;
        }
        return time + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying]);

  const attentionSample = getSampleAt(attentionSamples, currentTime);
  const attentionLevel = getAttentionLevel(attentionSample);
  const timelineBands = useMemo(
    () => buildTimelineBands(attentionEvents, transcript, LESSON_DURATION),
    []
  );

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      <Header />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <VideoPanel
              currentTime={currentTime}
              duration={LESSON_DURATION}
              isPlaying={isPlaying}
              onPlayPause={() => setIsPlaying((p) => !p)}
              onSeek={setCurrentTime}
            />
            <TranscriptPanel
              items={transcript}
              currentTime={currentTime}
              onSeek={setCurrentTime}
            />
          </div>
          <div className="flex flex-col gap-4">
            <AttentionTracker
              currentTime={currentTime}
              sample={attentionSample}
              level={attentionLevel}
            />
            <CatchUpButton currentTime={currentTime} />
            <VisualSummary />
            <TopicThreads />
          </div>
        </div>
        <AttentionTimeline
          bands={timelineBands}
          samples={attentionSamples}
          duration={LESSON_DURATION}
          currentTime={currentTime}
          onSeek={setCurrentTime}
        />
      </main>
    </div>
  );
}
