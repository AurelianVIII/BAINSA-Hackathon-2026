"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { VideoPanel } from "@/components/video/VideoPanel";
import { TranscriptPanel } from "@/components/transcript/TranscriptPanel";
import { CatchUpButton } from "@/components/catchup/CatchUpButton";
import { AttentionStatus } from "@/components/attention/AttentionStatus";
import { AttentionTimeline } from "@/components/attention/AttentionTimeline";
import { VisualSummary } from "@/components/summary/VisualSummary";
import { TopicThreads } from "@/components/threads/TopicThreads";
import { transcript } from "@/data/transcript";
import { attentionEvents } from "@/data/attention-events";

const LESSON_DURATION = 300;

/**
 * Composition layer for the lesson screen. `currentTime` is the single
 * source of truth for lesson playback, owned here and passed down to every
 * feature area — do not create competing playback state elsewhere.
 */
export default function Home() {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

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
            <AttentionStatus currentTime={currentTime} />
            <CatchUpButton currentTime={currentTime} />
            <VisualSummary />
            <TopicThreads />
          </div>
        </div>
        <AttentionTimeline
          events={attentionEvents}
          duration={LESSON_DURATION}
          currentTime={currentTime}
          onSeek={setCurrentTime}
        />
      </main>
    </div>
  );
}
