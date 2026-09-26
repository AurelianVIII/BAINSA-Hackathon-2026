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
import { AwayCatchUp } from "@/components/catchup/AwayCatchUp";
import { MissedAlert } from "@/components/catchup/MissedAlert";
import { AttentionTracker } from "@/components/attention/AttentionTracker";
import { AttentionTimeline } from "@/components/attention/AttentionTimeline";
import { AiSummaryPanel } from "@/components/summary/AiSummaryPanel";
import { VisualSummaryTab } from "@/components/summary/VisualSummaryTab";
import { KeyMoments } from "@/components/threads/KeyMoments";
import { buildCaptions, getCaptionAt } from "@/data/captions";
import {
  buildLiveTimelineBands,
  deriveAttentionEvents,
  getAttentionLevel,
} from "@/lib/attention";
import { buildMissedWindow, getPendingAlert } from "@/lib/catchup";
import { useYouTubeCaptions } from "@/lib/video/useYouTubeCaptions";
import type {
  AttentionEvent,
  AttentionSample,
  MissedWindow,
  TranscriptItem,
} from "@/types";
import {
  createLiveTranscriber,
  isLiveTranscriptionSupported,
  type LiveTranscriber,
} from "@/lib/transcription/live";

/** Timeline length before a lesson is loaded, so the axis has a scale. */
const EMPTY_DURATION = 300;
/** Stable empty array, so memoised consumers do not see a new reference. */
const NO_EVENTS: AttentionEvent[] = [];
/** Stable neutral reading for a second nothing was recorded against. */
const NEUTRAL_SAMPLE: AttentionSample = { t: 0, gaze: 0.5, confusion: 0, engagement: 0.5 };

/** Timeline headroom kept ahead of a live transcript, in seconds. */
const LIVE_DURATION_HEADROOM = 15;
const LIVE_MIN_DURATION = 60;

/** Seconds moved by the left/right arrow shortcuts. */
const SEEK_STEP_SECONDS = 5;

/**
 * Composition layer for the lesson screen. `currentTime` is the single
 * source of truth for lesson playback, owned here and passed down to every
 * feature area — do not create competing playback state elsewhere.
 *
 * Page-level state is the four pieces agreed in ROADMAP §2 (`currentTime`,
 * `isPlaying`, `summaryRequest`, `dismissedAlertIds`) plus the lesson
 * source. There are exactly two, both real: a YouTube video (its own
 * captions) or live speech-to-text from the room. Whichever is running
 * also owns the clock — the player reports its position, the recogniser
 * its elapsed time — so this page never invents playback time.
 */
export default function Home() {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [summaryRequest, setSummaryRequest] = useState<MissedWindow | null>(null);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<string[]>([]);
  // A loaded YouTube video. Its player reports its own true position and
  // duration (see VideoPanel), so the artificial clock below stands down.
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const youtubeCaptions = useYouTubeCaptions(videoId);
  const isYouTube = videoId !== null;
  const youtubeReady = youtubeCaptions.status === "ready" ? youtubeCaptions : null;
  const youtubeMeta =
    youtubeCaptions.status === "ready" || youtubeCaptions.status === "unavailable"
      ? youtubeCaptions
      : null;
  // Whether AttentionTracker's real webcam mode is on. The timeline shows
  // only genuine recorded readings; with the camera off there is no
  // attention data at all, rather than a stand-in curve.
  const [hasRealCamera, setHasRealCamera] = useState(false);
  // Real webcam detections recorded by second, keyed on integer seconds.
  const [recordedSamples, setRecordedSamples] = useState<Record<number, AttentionSample>>({});
  // Live speech-to-text. `liveItems === null` means no live lesson; an
  // array means the transcript is being produced from the microphone now.
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
    if (!isTranscribing || isYouTube) return;
    const interval = setInterval(() => {
      setCurrentTime(transcriberRef.current?.elapsed() ?? 0);
    }, 250);
    return () => clearInterval(interval);
  }, [isTranscribing, isYouTube]);

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
    if (!isYouTube) {
      setCurrentTime(0);
    }
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

  // Loading (or clearing) a YouTube video switches the lesson over to it,
  // so any live transcription of the room stops.
  const handleVideoChange = (id: string | null) => {
    stopTranscription();
    setLiveItems(null);
    setVideoId(id);
    setVideoDuration(null);
    setCurrentTime(0);
    setIsPlaying(false);
    setSummaryRequest(null);
    setDismissedAlertIds([]);
    // Webcam readings belong to the lesson they were recorded against.
    setRecordedSamples({});
  };

  // Read inside the keyboard handler, which is registered once.
  const activeDurationRef = useRef(EMPTY_DURATION);

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
          Math.min(activeDurationRef.current, time + SEEK_STEP_SECONDS)
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Whichever transcript the lesson is currently running on: live speech
  // when actively transcribing, otherwise YouTube video captions (if loaded).
  const isLiveLesson = liveItems !== null;
  const isYouTubeLesson = isYouTube && youtubeReady !== null;
  const activeTranscript = useMemo(
    () => liveItems ?? youtubeReady?.items ?? [],
    [liveItems, youtubeReady]
  );
  const activeDuration = isLiveLesson
    ? Math.max(
        LIVE_MIN_DURATION,
        Math.ceil((activeTranscript.at(-1)?.end ?? 0) + LIVE_DURATION_HEADROOM)
      )
    : isYouTube
      ? Math.ceil(videoDuration ?? youtubeMeta?.duration ?? 0) ||
        (youtubeReady?.duration ?? EMPTY_DURATION)
      : EMPTY_DURATION;
  useEffect(() => {
    activeDurationRef.current = activeDuration;
  }, [activeDuration]);
  // YouTube's own caption lines already carry real speech timing, so they
  // are used as-is rather than re-chunked from the grouped transcript.
  const youtubeCaptionLines = youtubeReady?.captions;
  const activeCaptions = useMemo(
    () =>
      isYouTubeLesson
        ? (youtubeCaptionLines ?? [])
        : buildCaptions(activeTranscript),
    [isYouTubeLesson, youtubeCaptionLines, activeTranscript]
  );
  const captionNotice = !isYouTubeLesson
    ? null
    : youtubeCaptions.status === "loading"
      ? "Loading captions…"
      : youtubeCaptions.status === "unavailable"
        ? `${youtubeCaptions.message} You can use “Transcribe this lesson” to caption it live.`
        : null;

  const [latestLiveSample, setLatestLiveSample] = useState<AttentionSample | null>(null);
  const currentRecordedSample = hasRealCamera
    ? (latestLiveSample ?? recordedSamples[Math.round(currentTime)])
    : undefined;
  // No camera means no attention reading — the panel shows a neutral
  // baseline rather than a number nothing measured.
  const attentionSample = currentRecordedSample ?? NEUTRAL_SAMPLE;
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
    setLatestLiveSample(sample);
    const key = Math.round(sample.t);
    setRecordedSamples((prev) => (key in prev ? prev : { ...prev, [key]: sample }));
  };
  // Only genuine recorded readings, with a flat neutral baseline wherever
  // nothing has been recorded yet. Covers the whole active lesson so
  // readings late in a long video are shown rather than dropped.
  const timelineSamples = useMemo(
    () =>
      Array.from({ length: Math.floor(activeDuration) + 1 }, (_, t) =>
        hasRealCamera
          ? (recordedSamples[t] ?? { t, gaze: 0.5, confusion: 0, engagement: 0.5 })
          : { t, gaze: 0.5, confusion: 0, engagement: 0.5 }
      ),
    [hasRealCamera, recordedSamples, activeDuration]
  );
  // Real detections, expressed as AttentionEvents so everything downstream
  // works unchanged.
  const liveAttentionEvents = useMemo(
    () =>
      hasRealCamera
        ? deriveAttentionEvents(recordedSamples, Math.floor(activeDuration))
        : [],
    [hasRealCamera, recordedSamples, activeDuration]
  );

  // Alerts come only from what the camera actually detected, against
  // whatever transcript is running. This is the product's core loop.
  // Camera off means no attention data at all.
  const alertEvents = useMemo(
    () => (hasRealCamera ? liveAttentionEvents : NO_EVENTS),
    [hasRealCamera, liveAttentionEvents]
  );
  const alertTranscript = activeTranscript;

  // Missed-line highlighting comes from PC2's buildMissedWindow, so the
  // transcript marks exactly the lines their alert offers to explain.
  const missedIds = useMemo(
    () =>
      alertEvents.flatMap(
        (event) =>
          buildMissedWindow(alertEvents, alertTranscript, event).transcriptIds
      ),
    [alertEvents, alertTranscript]
  );

  // PC2 owns the "has the student just come back?" rule.
  const activeAlert =
    alertEvents.length === 0
      ? null
      : getPendingAlert(
          alertEvents,
          alertTranscript,
          currentTime,
          dismissedAlertIds
        );
  // Bands are derived from genuine recordings only, and a live-transcribed
  // lesson has no settled timeline to project them onto.
  const timelineBands = useMemo(
    () =>
      hasRealCamera && !isLiveLesson
        ? buildLiveTimelineBands(
            recordedSamples,
            activeTranscript,
            Math.floor(activeDuration)
          )
        : [],
    [isLiveLesson, hasRealCamera, recordedSamples, activeTranscript, activeDuration]
  );

  const hasLesson = isLiveLesson || isYouTube;
  const lessonTitle = isLiveLesson
    ? "Transcribing this lesson"
    : isYouTube
      ? (youtubeMeta?.title ?? "YouTube video")
      : "No lesson loaded";

  const handleSeek = (time: number) => {
    setCurrentTime(Math.max(0, Math.min(time, activeDuration)));
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      <Header
        isLive={isPlaying}
        useRealCamera={hasRealCamera}
        onToggleRealCamera={setHasRealCamera}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[3fr_2fr] lg:overflow-hidden">
        {/* Left column: the lesson itself. */}
        <div className="flex min-h-0 flex-col gap-3">
          <VideoPanel
            subject={
              isLiveLesson
                ? "Live"
                : isYouTube
                  ? youtubeReady?.autoGenerated
                    ? "YouTube · auto-captions"
                    : "YouTube"
                  : "No lesson"
            }
            title={lessonTitle}
            hasLesson={hasLesson}
            currentTime={currentTime}
            duration={activeDuration}
            isPlaying={isPlaying}
            speed={speed}
            caption={caption}
            captionNotice={captionNotice}
            videoId={videoId}
            isLiveLesson={isLiveLesson}
            isTranscribing={isTranscribing}
            transcriptionSupported={transcriptionSupported}
            transcriptionError={transcriptionError}
            onPlayPause={() => setIsPlaying((playing) => !playing)}
            onSpeedChange={setSpeed}
            onSeek={handleSeek}
            onVideoChange={handleVideoChange}
            // While transcribing, the recogniser owns the clock.
            onVideoTimeUpdate={(time) => {
              if (!isTranscribing) setCurrentTime(time);
            }}
            onVideoDurationChange={setVideoDuration}
            onVideoPlayingChange={setIsPlaying}
            onStartTranscription={startTranscription}
            onStopTranscription={stopTranscription}
          />
          <TranscriptPanel
            items={activeTranscript}
            currentTime={currentTime}
            onSeek={handleSeek}
            missedIds={missedIds}
            isLiveLesson={isLiveLesson}
            interimText={interimText}
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
            useRealCamera={hasRealCamera}
            onToggleRealCamera={setHasRealCamera}
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
          <AiSummaryPanel
            request={summaryRequest}
            items={activeTranscript}
            lessonTitle={lessonTitle}
          />

          <CatchUpButton
            currentTime={currentTime}
            items={activeTranscript}
            title={lessonTitle}
          />

          <AwayCatchUp
            currentTime={currentTime}
            items={activeTranscript}
          />
        </div>
      </div>

      <div className="shrink-0 px-3 pb-3">
        <AttentionTimeline
          bands={timelineBands}
          samples={timelineSamples}
          duration={activeDuration}
          currentTime={currentTime}
          onSeek={handleSeek}
          sample={attentionSample}
          level={attentionLevel}
          useRealCamera={hasRealCamera}
        />
      </div>
    </div>
  );
}
