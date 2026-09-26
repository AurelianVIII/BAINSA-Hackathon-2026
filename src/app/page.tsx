"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
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
import { buildCaptions, getCaptionAt } from "@/data/captions";
import {
  buildLiveTimelineBands,
  buildTimelineBands,
  getAttentionLevel,
  getSampleAt,
} from "@/lib/attention";
import { buildMissedWindow, getPendingAlert } from "@/lib/catchup";
import type { AttentionSample, MissedWindow, TranscriptItem } from "@/types";
import {
  createLiveTranscriber,
  isLiveTranscriptionSupported,
  type LiveTranscriber,
} from "@/lib/transcription/live";

const LESSON_DURATION = 300;
const LESSON_SUBJECT = "Biology";
const LESSON_TITLE = "Photosynthesis and the Calvin Cycle";

/** Timeline headroom kept ahead of a live transcript, in seconds. */
const LIVE_DURATION_HEADROOM = 15;
const LIVE_MIN_DURATION = 60;

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
  // Whether AttentionTracker's real webcam mode is on. While it is, the
  // timeline shows only genuine recorded readings, not the pre-built demo
  // curve/bands — the two are never mixed together.
  const [hasRealCamera, setHasRealCamera] = useState(false);
  // Real webcam detections recorded by second, keyed on the same integer
  // seconds as the simulated `attentionSamples`.
  const [recordedSamples, setRecordedSamples] = useState<Record<number, AttentionSample>>({});
  // Live speech-to-text. `liveItems === null` means the built-in demo
  // lesson is showing; an array means the transcript is being produced from
  // the microphone right now.
  const [liveItems, setLiveItems] = useState<TranscriptItem[] | null>(null);
  const [interimText, setInterimText] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const transcriberRef = useRef<LiveTranscriber | null>(null);
  // A browser capability, not state we own: read through an external store
  // so the server render (false) and the client agree without a mismatch.
  const transcriptionSupported = useSyncExternalStore(
    () => () => {},
    isLiveTranscriptionSupported,
    () => false
  );

  // Read inside the interval callback so the clock does not have to restart
  // on every tick just to know where it is.
  const currentTimeRef = useRef(currentTime);
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  // While transcribing, the recogniser's own elapsed time is the clock —
  // the transcript's timestamps come from it, so anything else would drift.
  useEffect(() => {
    if (!isTranscribing) return;
    const interval = setInterval(() => {
      setCurrentTime(transcriberRef.current?.elapsed() ?? 0);
    }, 250);
    return () => clearInterval(interval);
  }, [isTranscribing]);

  // Stop the microphone if the page goes away mid-lesson.
  useEffect(() => {
    return () => transcriberRef.current?.stop();
  }, []);

  const startTranscription = () => {
    setTranscriptionError(null);
    const transcriber = createLiveTranscriber({
      onTranscript: setLiveItems,
      onInterim: setInterimText,
      onError: setTranscriptionError,
    });
    transcriberRef.current = transcriber;
    setLiveItems([]);
    setCurrentTime(0);
    setIsTranscribing(true);
    setIsPlaying(true);
    transcriber.start();
  };

  const stopTranscription = () => {
    transcriberRef.current?.stop();
    transcriberRef.current = null;
    setIsTranscribing(false);
    setIsPlaying(false);
    setInterimText("");
  };

  const useDemoLesson = () => {
    stopTranscription();
    setLiveItems(null);
    setCurrentTime(0);
  };

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
    if (!isPlaying || hasRealVideo || isTranscribing) return;
    const interval = setInterval(() => {
      if (currentTimeRef.current >= LESSON_DURATION) {
        setIsPlaying(false);
        return;
      }
      setCurrentTime((time) => Math.min(time + 1, LESSON_DURATION));
    }, 1000 / speed);
    return () => clearInterval(interval);
  }, [isPlaying, speed, hasRealVideo, isTranscribing]);

  // Whichever transcript the lesson is currently running on.
  const isLiveLesson = liveItems !== null;
  const activeTranscript = liveItems ?? transcript;
  const activeDuration = isLiveLesson
    ? Math.max(
        LIVE_MIN_DURATION,
        Math.ceil((activeTranscript.at(-1)?.end ?? 0) + LIVE_DURATION_HEADROOM)
      )
    : LESSON_DURATION;
  const activeCaptions = useMemo(
    () => buildCaptions(activeTranscript),
    [activeTranscript]
  );

  const attentionSample = getSampleAt(attentionSamples, currentTime);
  const attentionLevel = getAttentionLevel(attentionSample);
  // Live captions show the phrase still being spoken, then the last one
  // committed. Waiting for the recogniser to finalise a sentence would put
  // a visible lag on the one thing a deaf learner depends on.
  const caption = isLiveLesson
    ? interimText
      ? {
          id: "interim",
          itemId: "interim",
          start: currentTime,
          end: currentTime + 1,
          text: interimText,
        }
      : (activeCaptions.at(-1) ?? null)
    : getCaptionAt(activeCaptions, currentTime);
  // Write-once per second: the first real reading at a given point on the
  // timeline locks it in for the rest of the session. Without this,
  // rewinding back over an already-recorded stretch (or just pausing on one
  // with the camera still running) would keep overwriting what actually
  // happened there with whatever's happening now.
  const handleLiveAttentionSample = (sample: AttentionSample) => {
    const key = Math.round(sample.t);
    setRecordedSamples((prev) => (key in prev ? prev : { ...prev, [key]: sample }));
  };
  // Demo mode (default) shows the pre-built simulated curve, full stop.
  // Real-camera mode shows only genuine recorded readings — a flat neutral
  // baseline anywhere nothing's been recorded yet — never a blend of the
  // two, so what's on screen is always honestly one or the other.
  const timelineSamples = useMemo(() => {
    if (!hasRealCamera) return attentionSamples;
    return attentionSamples.map(
      (sample) => recordedSamples[sample.t] ?? { t: sample.t, gaze: 0.5, confusion: 0, engagement: 0.5 }
    );
  }, [hasRealCamera, recordedSamples]);
  // Missed-line highlighting comes from PC2's buildMissedWindow, so the
  // transcript marks exactly the lines their alert offers to explain.
  const missedIds = useMemo(
    () =>
      isLiveLesson
        ? []
        : attentionEvents
            .filter((event) =>
              (MISSED_EVENT_TYPES as readonly string[]).includes(event.type)
            )
            .flatMap(
              (event) =>
                buildMissedWindow(attentionEvents, transcript, event)
                  .transcriptIds
            ),
    [isLiveLesson]
  );

  // PC2 owns the "has the student just come back?" rule.
  // The scripted attention narrative describes the demo lesson, so it must
  // not be projected onto a transcript captured live from a real room.
  const activeAlert = isLiveLesson
    ? null
    : getPendingAlert(attentionEvents, transcript, currentTime, dismissedAlertIds);
  // Same demo-vs-real split as timelineSamples above — scripted bands in
  // demo mode, bands derived from genuine recordings in real-camera mode —
  // but neither applies to a live-transcribed lesson, which has no scripted
  // narrative to project bands from in the first place.
  const timelineBands = useMemo(() => {
    if (isLiveLesson) return [];
    if (!hasRealCamera) return buildTimelineBands(attentionEvents, transcript, LESSON_DURATION);
    return buildLiveTimelineBands(recordedSamples, transcript, LESSON_DURATION);
  }, [isLiveLesson, hasRealCamera, recordedSamples]);

  const handleSeek = (time: number) => {
    setCurrentTime(Math.max(0, Math.min(time, activeDuration)));
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      <Header isLive={isPlaying} />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[3fr_2fr] lg:overflow-hidden">
        {/* Left column: the lesson itself. */}
        <div className="flex min-h-0 flex-col gap-3">
          <VideoPanel
            subject={isLiveLesson ? "Live" : LESSON_SUBJECT}
            title={isLiveLesson ? "Transcribing this lesson" : LESSON_TITLE}
            currentTime={currentTime}
            duration={activeDuration}
            isPlaying={isPlaying}
            speed={speed}
            caption={caption}
            captionNotice={
              hasRealVideo && !isLiveLesson
                ? "No transcript for this video — use “Transcribe this lesson” to caption it live."
                : null
            }
            onPlayPause={() => setIsPlaying((playing) => !playing)}
            onSpeedChange={setSpeed}
            onSeek={handleSeek}
            onRealVideoChange={setHasRealVideo}
          />
          <TranscriptPanel
            items={activeTranscript}
            currentTime={currentTime}
            onSeek={handleSeek}
            missedIds={missedIds}
            isTranscribing={isTranscribing}
            isLiveLesson={isLiveLesson}
            transcriptionSupported={transcriptionSupported}
            transcriptionError={transcriptionError}
            interimText={interimText}
            onStartTranscription={startTranscription}
            onStopTranscription={stopTranscription}
            onUseDemoLesson={useDemoLesson}
            keyMomentsSlot={
              <KeyMoments
                items={activeTranscript}
                currentTime={currentTime}
                onSeek={handleSeek}
                missedIds={missedIds}
                onRequestSummary={setSummaryRequest}
              />
            }
            visualSummarySlot={
              <VisualSummaryTab
                items={activeTranscript}
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
            onRealCameraChange={setHasRealCamera}
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
          duration={activeDuration}
          currentTime={currentTime}
          onSeek={handleSeek}
        />
      </div>
    </div>
  );
}
