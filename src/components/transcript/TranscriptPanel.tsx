"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { TranscriptItem } from "@/types";

const TABS = ["Live Captions", "Key Moments", "Visual Summary", "Notes"] as const;
type Tab = (typeof TABS)[number];

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
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
  keyMomentsSlot,
  visualSummarySlot,
}: {
  items: TranscriptItem[];
  currentTime: number;
  onSeek: (time: number) => void;
  missedIds: string[];
  keyMomentsSlot?: ReactNode;
  visualSummarySlot?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("Live Captions");

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div
        role="tablist"
        aria-label="Lesson record"
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-zinc-200 px-2 pt-2 dark:border-zinc-800"
      >
        {TABS.map((name) => (
          <button
            key={name}
            role="tab"
            type="button"
            aria-selected={tab === name}
            onClick={() => setTab(name)}
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

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "Live Captions" && (
          <CaptionList
            items={items}
            currentTime={currentTime}
            onSeek={onSeek}
            missedIds={missedIds}
          />
        )}
        {tab === "Key Moments" && <SlotArea>{keyMomentsSlot}</SlotArea>}
        {tab === "Visual Summary" && <SlotArea>{visualSummarySlot}</SlotArea>}
        {tab === "Notes" && <NotesTab currentTime={currentTime} />}
      </div>
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

function CaptionList({
  items,
  currentTime,
  onSeek,
  missedIds,
}: {
  items: TranscriptItem[];
  currentTime: number;
  onSeek: (time: number) => void;
  missedIds: string[];
}) {
  const activeRef = useRef<HTMLLIElement>(null);
  // Auto-scroll follows playback until the user takes over, so the panel
  // never fights someone reading back through the lesson.
  const [following, setFollowing] = useState(true);

  useEffect(() => {
    if (!following) return;
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [currentTime, following]);

  return (
    <div className="relative h-full">
      <ol
        onWheel={() => setFollowing(false)}
        onTouchMove={() => setFollowing(false)}
        className="flex h-full flex-col gap-1 overflow-y-auto p-3"
      >
        {items.map((item) => {
          const isActive = currentTime >= item.start && currentTime < item.end;
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
                  {item.text}
                </span>
                {wasMissed && (
                  <span
                    title="You missed this"
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white"
                  >
                    !
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      {!following && (
        <button
          type="button"
          onClick={() => setFollowing(true)}
          className="absolute bottom-3 right-4 rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Follow along
        </button>
      )}
    </div>
  );
}

/** Deliberately simple: a scratchpad with timestamped entries. */
function NotesTab({ currentTime }: { currentTime: number }) {
  const [notes, setNotes] = useState("");

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <button
        type="button"
        onClick={() =>
          setNotes((text) =>
            `${text}${text && !text.endsWith("\n") ? "\n" : ""}[${formatTime(currentTime)}] `
          )
        }
        className="self-start rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        Add note at {formatTime(currentTime)}
      </button>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Your notes for this lesson…"
        aria-label="Lesson notes"
        className="min-h-0 flex-1 resize-none rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
      />
    </div>
  );
}
