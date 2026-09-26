"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import Fuse, { type FuseResultMatch } from "fuse.js";
import type { TranscriptItem } from "@/types";

const TABS = ["Live Captions", "Key Moments", "Visual Summary", "Notes"] as const;
type Tab = (typeof TABS)[number];

/** Stable DOM ids so each tab can point at its panel. */
const slug = (tab: Tab) => tab.toLowerCase().replace(/\s+/g, "-");

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * The lesson record, tabbed. Tab state is local — it is not playback state,
 * so it does not belong on the page (see ROADMAP §2).
 *
 * PC4's panels arrive as slots rather than imports, so a half-built panel
 * on their side cannot break this one.
 */
export function TranscriptPanel({
  items,
  currentTime,
  onSeek,
  missedIds,
  isTranscribing,
  isLiveLesson,
  transcriptionSupported,
  transcriptionError,
  interimText,
  onStartTranscription,
  onStopTranscription,
  onUseDemoLesson,
  keyMomentsSlot,
  visualSummarySlot,
}: {
  items: TranscriptItem[];
  currentTime: number;
  onSeek: (time: number) => void;
  missedIds: string[];
  isTranscribing: boolean;
  isLiveLesson: boolean;
  transcriptionSupported: boolean;
  transcriptionError: string | null;
  interimText: string;
  onStartTranscription: () => void;
  onStopTranscription: () => void;
  onUseDemoLesson: () => void;
  keyMomentsSlot?: ReactNode;
  visualSummarySlot?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("Live Captions");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Arrow/Home/End navigation, as expected of a tablist.
  const handleTabKeyDown = (event: KeyboardEvent, index: number) => {
    const lastIndex = TABS.length - 1;
    let next: number | null = null;

    if (event.key === "ArrowRight") next = index === lastIndex ? 0 : index + 1;
    else if (event.key === "ArrowLeft") next = index === 0 ? lastIndex : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = lastIndex;

    if (next === null) return;
    event.preventDefault();
    setTab(TABS[next]);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div
        role="tablist"
        aria-label="Lesson record"
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-zinc-200 px-2 pt-2 dark:border-zinc-800"
      >
        {TABS.map((name, index) => (
          <button
            key={name}
            id={`tab-${slug(name)}`}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            role="tab"
            type="button"
            aria-selected={tab === name}
            aria-controls={`panel-${slug(name)}`}
            // Roving tabindex: the tablist is one tab stop, arrows move within.
            tabIndex={tab === name ? 0 : -1}
            onClick={() => setTab(name)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
            className={`whitespace-nowrap rounded-t-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${
              tab === name
                ? "border-b-2 border-indigo-600 text-indigo-700 dark:text-indigo-300"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`panel-${slug(tab)}`}
        aria-labelledby={`tab-${slug(tab)}`}
        className="min-h-0 flex-1 overflow-hidden"
      >
        {tab === "Live Captions" && (
          <CaptionList
            items={items}
            currentTime={currentTime}
            onSeek={onSeek}
            missedIds={missedIds}
            isLiveLesson={isLiveLesson}
            interimText={interimText}
            controls={
              <LiveControls
                isTranscribing={isTranscribing}
                isLiveLesson={isLiveLesson}
                supported={transcriptionSupported}
                error={transcriptionError}
                onStart={onStartTranscription}
                onStop={onStopTranscription}
                onUseDemoLesson={onUseDemoLesson}
              />
            }
          />
        )}
        {tab === "Key Moments" && <SlotArea>{keyMomentsSlot}</SlotArea>}
        {tab === "Visual Summary" && <SlotArea>{visualSummarySlot}</SlotArea>}
        {tab === "Notes" && <NotesTab currentTime={currentTime} />}
      </div>
    </div>
  );
}

/**
 * Source control for the transcript: the scripted demo lesson, or the
 * microphone transcribing a real one.
 */
function LiveControls({
  isTranscribing,
  isLiveLesson,
  supported,
  error,
  onStart,
  onStop,
  onUseDemoLesson,
}: {
  isTranscribing: boolean;
  isLiveLesson: boolean;
  supported: boolean;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
  onUseDemoLesson: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {isTranscribing ? (
        <button
          type="button"
          onClick={onStop}
          className="flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          <span
            aria-hidden
            className="h-2 w-2 animate-pulse rounded-full bg-white motion-reduce:animate-none"
          />
          Stop transcribing
        </button>
      ) : (
        <button
          type="button"
          onClick={onStart}
          disabled={!supported}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:disabled:bg-zinc-700"
        >
          Transcribe this lesson
        </button>
      )}

      {isLiveLesson && !isTranscribing && (
        <button
          type="button"
          onClick={onUseDemoLesson}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Back to demo lesson
        </button>
      )}

      {!supported && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          This browser has no speech recognition — try Chrome or Edge.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
}

function SlotArea({ children }: { children?: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto p-3">
      {children ?? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Nothing here yet.
        </p>
      )}
    </div>
  );
}

/**
 * Wrap the matched ranges Fuse reports in <mark>. Without this a search
 * result is just a filtered list — the point is seeing *why* a line matched.
 */
function highlight(text: string, matches?: readonly FuseResultMatch[]) {
  const ranges = matches?.find((match) => match.key === "text")?.indices;
  if (!ranges?.length) return text;

  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const [start, end] of [...ranges].sort((a, b) => a[0] - b[0])) {
    if (start < cursor) continue; // Fuse can report overlapping ranges.
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark
        key={start}
        className="rounded bg-amber-200 px-0.5 text-inherit dark:bg-amber-500/40"
      >
        {text.slice(start, end + 1)}
      </mark>
    );
    cursor = end + 1;
  }

  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

function CaptionList({
  items,
  currentTime,
  onSeek,
  missedIds,
  isLiveLesson,
  interimText,
  controls,
}: {
  items: TranscriptItem[];
  currentTime: number;
  onSeek: (time: number) => void;
  missedIds: string[];
  isLiveLesson: boolean;
  interimText: string;
  controls: ReactNode;
}) {
  const activeRef = useRef<HTMLLIElement>(null);
  // Auto-scroll follows playback until the user takes over, so the panel
  // never fights someone reading back through the lesson.
  const [following, setFollowing] = useState(true);
  // Distinguishes our own scrolling from the user's, so the guard catches
  // the keyboard and the scrollbar too — not just the wheel.
  const selfScrolling = useRef(false);
  const [query, setQuery] = useState("");

  const fuse = useMemo(
    () =>
      new Fuse(items, {
        keys: ["text", "topic"],
        includeMatches: true,
        // Tuned against the demo transcript: 0.3 returns exactly the lines
        // that literally contain the term, while still finding "RuBisCO"
        // from "rubsico". At 0.35 a search for "ATP" matched 11 of 12 lines.
        threshold: 0.3,
        ignoreLocation: true,
        minMatchCharLength: 2,
      }),
    [items]
  );

  const trimmed = query.trim();
  const isSearching = trimmed.length > 0;
  const results = useMemo(
    () => (isSearching ? fuse.search(trimmed) : null),
    [fuse, trimmed, isSearching]
  );

  // Rows are either the whole lesson, or just what matched.
  const rows = results
    ? results.map((result) => ({ item: result.item, matches: result.matches }))
    : items.map((item) => ({ item, matches: undefined }));

  useEffect(() => {
    // While searching the active line may not be rendered at all, and
    // yanking the list around under someone who is reading results is rude.
    if (!following || isSearching) return;

    selfScrolling.current = true;
    activeRef.current?.scrollIntoView({
      block: "center",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });

    // Long enough to cover a smooth scroll settling.
    const release = setTimeout(() => {
      selfScrolling.current = false;
    }, 700);
    return () => clearTimeout(release);
  }, [currentTime, following, isSearching]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-col gap-2 px-3 pt-3">
        {controls}
        <div className="relative">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setQuery("");
            }}
            placeholder="Search the lesson…"
            aria-label="Search the lesson transcript"
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-1.5 pl-3 pr-16 text-sm text-zinc-800 placeholder:text-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
          {isSearching && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
              {rows.length} {rows.length === 1 ? "hit" : "hits"}
            </span>
          )}
        </div>
        {/* Announce result counts to screen readers without stealing focus. */}
        <p aria-live="polite" className="sr-only">
          {isSearching ? `${rows.length} results for ${trimmed}` : ""}
        </p>
      </div>

      <div className="relative min-h-0 flex-1">
        {isSearching && rows.length === 0 ? (
          <p className="p-3 text-sm text-zinc-500 dark:text-zinc-400">
            Nothing in this lesson matches “{trimmed}”.
          </p>
        ) : (
          <ol
            onScroll={() => {
              if (!selfScrolling.current) setFollowing(false);
            }}
            className="flex h-full flex-col gap-1 overflow-y-auto p-3"
          >
            {rows.map(({ item, matches }, index) => {
              // Live transcription has no "current" line in the playback
              // sense — the newest one is what the student is reading.
              const isActive = isSearching
                ? false
                : isLiveLesson
                  ? index === rows.length - 1
                  : currentTime >= item.start && currentTime < item.end;
              const wasMissed = missedIds.includes(item.id);

              return (
                <li key={item.id} ref={isActive ? activeRef : undefined}>
                  <button
                    type="button"
                    onClick={() => {
                      onSeek(item.start);
                      setFollowing(true);
                    }}
                    aria-label={
                      wasMissed
                        ? `${formatTime(item.start)}. Missed while you were away: ${item.text}`
                        : `${formatTime(item.start)}. ${item.text}`
                    }
                    className={`flex w-full gap-3 rounded-lg border-l-4 px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${
                      wasMissed
                        ? "border-l-purple-500 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/40"
                        : isActive
                          ? "border-l-indigo-500 bg-indigo-50 dark:bg-indigo-950"
                          : "border-l-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <span className="mt-0.5 shrink-0 text-xs tabular-nums text-zinc-400">
                      {formatTime(item.start)}
                    </span>
                    <span className="flex-1 text-zinc-700 dark:text-zinc-300">
                      {highlight(item.text, matches)}
                    </span>
                    {wasMissed && (
                      <span
                        aria-hidden
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white"
                      >
                        !
                      </span>
                    )}
                  </button>
                </li>
              );
            })}

            {isLiveLesson && interimText && !isSearching && (
              <li>
                <p className="flex gap-3 rounded-lg border-l-4 border-l-transparent px-2.5 py-2 text-left text-sm italic text-zinc-400 dark:text-zinc-500">
                  <span className="mt-0.5 shrink-0 text-xs tabular-nums">
                    {formatTime(currentTime)}
                  </span>
                  <span className="flex-1">{interimText}…</span>
                </p>
              </li>
            )}

            {isLiveLesson && items.length === 0 && !interimText && (
              <li className="px-2.5 py-2 text-sm text-zinc-500 dark:text-zinc-400">
                Listening — start speaking and the lesson will appear here.
              </li>
            )}
          </ol>
        )}

        {!following && !isSearching && (
          <button
            type="button"
            onClick={() => setFollowing(true)}
            className="absolute bottom-3 right-4 rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Follow along
          </button>
        )}
      </div>
    </div>
  );
}

const NOTES_STORAGE_KEY = "focusaid:notes:v1";

/**
 * Notes live in localStorage rather than component state — a student losing
 * a lesson's notes to an accidental refresh is a real failure, not a demo
 * detail.
 *
 * Read through useSyncExternalStore so the server render and the first
 * client render agree (both empty) and the stored value arrives without a
 * hydration mismatch.
 */
const notesStore = {
  listeners: new Set<() => void>(),
  subscribe(listener: () => void) {
    notesStore.listeners.add(listener);
    return () => {
      notesStore.listeners.delete(listener);
    };
  },
  read() {
    try {
      return window.localStorage.getItem(NOTES_STORAGE_KEY) ?? "";
    } catch {
      // Private mode or blocked storage — notes still work for this session.
      return "";
    }
  },
  write(value: string) {
    try {
      window.localStorage.setItem(NOTES_STORAGE_KEY, value);
    } catch {
      // Ignore: the in-memory value below keeps the textarea usable.
    }
    notesStore.listeners.forEach((listener) => listener());
  },
};

function NotesTab({ currentTime }: { currentTime: number }) {
  const notes = useSyncExternalStore(
    notesStore.subscribe,
    notesStore.read,
    () => ""
  );

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() =>
            notesStore.write(
              `${notes}${notes && !notes.endsWith("\n") ? "\n" : ""}[${formatTime(currentTime)}] `
            )
          }
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Add note at {formatTime(currentTime)}
        </button>
        {notes && (
          <button
            type="button"
            onClick={() => notesStore.write("")}
            className="rounded-lg px-2.5 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">
          Saved on this device
        </span>
      </div>
      <textarea
        value={notes}
        onChange={(event) => notesStore.write(event.target.value)}
        placeholder="Your notes for this lesson…"
        aria-label="Lesson notes"
        className="min-h-0 flex-1 resize-none rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
      />
    </div>
  );
}
