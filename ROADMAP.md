# FocusAid — 5-hour build roadmap

Target: the split-screen "recover what you missed without losing the live
thread" dashboard for Deaf and hard-of-hearing learners.

This document is the plan of record for a 5-hour, 4-developer parallel
sprint. It does not change `CLAUDE.md`; it schedules the work inside it.

---

## 0. Where we are vs. where we're going

The repo already has a working skeleton, but it is **not** the target
screen. Honest gap list:

| Target screen element | Today | Gap |
| --- | --- | --- |
| Header: tagline, centre description, Live pill, Settings, avatar | Logo + "Prototype" badge | Rewrite |
| Video with teacher + whiteboard + burned-in large captions | Grey placeholder box | Build |
| Webcam attention tracker (face box, 3 metric bars, red badge) | One `<Badge>` | Build |
| Pink "You might have missed something" alert + 2 actions | Does not exist | Build |
| Transcript with 4 tabs + purple/`!` missed-line highlight | Flat list, no tabs | Extend |
| AI summary: text **and** generated flowchart | "Topics covered: …" string | Build |
| Wavy 4-colour attention timeline + legend | Flat coloured pills | Rebuild |
| Full-bleed dashboard layout | `max-w-6xl` 2/3 + 1/3 | Relayout |

So roughly: **one panel is keepable (the transcript list), everything else
is new or rebuilt.** Budget accordingly — nobody should spend hour 1
polishing.

### Scope call I am making for you

The described screen has no "Topic Threads" panel, but PC4 owns
`src/components/threads/**`. Rather than delete that ownership or build a
panel with nowhere to live, **threads become the "Key Moments" tab** inside
the transcript panel. Same code, same owner, a home on screen. If you
disagree, say so at the T+0:30 checkpoint, not at T+4:00.

### Ownership amendment (needed — state it in commit messages)

API route handlers live under `src/app/api/**`, which the map gives to PC1.
For this sprint only:

- `src/app/api/catchup/**` → **PC2**
- `src/app/api/summary/**` → **PC4**

PC1 owns everything else under `src/app/**`. No other carve-outs.

---

## 1. Step 0 for everyone (before your first commit)

```bash
npm install          # node_modules is not present in the repo
ls node_modules/next/dist/docs/
```

Per `AGENTS.md`, this is **not** the Next.js in your training data
(Next 16.3.6, React 19.2). Read the docs page relevant to what you are
about to write, before writing it. Two things already in the tree that will
surprise you: `src/app/layout.tsx` uses the generated `LayoutProps<"/">`
type, and `next dev` rewrites the `AGENTS.md` header block — commit that
change along with your work rather than fighting it.

Then, on every commit, both of these must pass:

```bash
npm run build && npm run lint
```

---

## 2. The shared contract (PC1 lands this by T+0:20, alone)

**Nobody else touches `src/types/index.ts` today.** Four people editing one
type file in parallel is the single most likely way this sprint dies. PC1
commits the whole additive block below in one commit, pushes, and announces
it. After that, feature-local types go in your own `src/lib/<area>/types.ts`.

```ts
// src/types/index.ts — ADDITIVE ONLY, existing types unchanged

/** One sampled frame of the simulated webcam signal. */
export interface AttentionSample {
  t: number;            // seconds from lesson start
  gaze: number;         // 0-1, "gaze to screen"
  confusion: number;    // 0-1, "brow"
  engagement: number;   // 0-1
}

/** Colour bands for the bottom timeline. */
export type TimelineBand =
  | "high"       // green  — high attention
  | "away"       // red    — looking away
  | "confused"   // yellow — confusion detected
  | "key"        // purple — key information
  | "recovered"; // green  — back on track

/** A stretch of lesson the student demonstrably missed. */
export interface MissedWindow {
  id: string;
  start: number;
  end: number;
  reason: AttentionEventType;
  /** TranscriptItem ids overlapping the window. */
  transcriptIds: string[];
  /** True if any overlapped item has importance: "high". */
  hitKeyContent: boolean;
}

/** Short caption chunk for the burned-in live captions overlay. */
export interface CaptionChunk {
  id: string;
  itemId: string;   // parent TranscriptItem
  start: number;
  end: number;
  text: string;
}

/** Nodes/edges for the generated summary flowchart. */
export interface SummaryFlowNode {
  id: string;
  label: string;
  kind: "input" | "process" | "output";
}
export interface SummaryFlowEdge {
  from: string;
  to: string;
  label?: string;
}
export interface VisualSummaryData {
  title: string;
  text: string;
  nodes: SummaryFlowNode[];
  edges: SummaryFlowEdge[];
}
```

### Component prop contracts (frozen at T+0:30)

PC1 writes `page.tsx` against these immediately, importing components that
may still be stubs. Everyone builds to their signature. Changing a
signature after T+0:30 means telling the other three.

```ts
// PC1
<Header isLive={boolean} />
<VideoPanel currentTime isPlaying duration onPlayPause onSeek caption={CaptionChunk | null} />
<TranscriptPanel
  items currentTime onSeek
  missedIds={string[]}                 // purple + "!" lines
  keyMomentsSlot={ReactNode}           // PC4
  visualSummarySlot={ReactNode}        // PC4
/>

// PC3
<AttentionTracker currentTime sample={AttentionSample} level={"high"|"medium"|"low"} />
<AttentionTimeline bands={{band, start, end}[]} samples duration currentTime onSeek />

// PC2
<MissedAlert
  window={MissedWindow | null}
  onShowSummary={(w: MissedWindow) => void}
  onReplay={(t: number) => void}
  onDismiss={() => void}
/>

// PC4
<AiSummaryPanel request={MissedWindow | null} />
<KeyMoments items currentTime onSeek />
<VisualSummaryTab items />
```

### Shared state, owned by `src/app/page.tsx` only

`currentTime` stays the single source of truth (existing rule). PC1 adds
exactly three more pieces of page-level state — `isPlaying`,
`summaryRequest: MissedWindow | null`, and `dismissedAlertIds: string[]`.
**No other component may hold playback or alert state.**

---

## 3. Timeline and checkpoints

| Time | Milestone | Gate |
| --- | --- | --- |
| T+0:00 | `npm install`, read Next docs, pull `main` | — |
| T+0:20 | PC1 lands shared types + prop contracts | others start real work |
| T+0:30 | **Checkpoint 1** — contracts agreed, layout shell on `main` | signature objections raised now |
| T+1:45 | **Checkpoint 2** — every panel renders real content from mock data | merge to `main`, build green |
| T+3:00 | **Checkpoint 3** — cross-panel interactions wired end to end | feature-complete |
| T+3:45 | **Integration freeze** — `main` takes bug fixes and CSS only | no new features after this |
| T+4:30 | Demo rehearsal, twice, start to finish | — |
| T+5:00 | Done | — |

Merge to `main` at every checkpoint, minimum. Long-lived branches in a
4-way parallel sprint are how you get a 45-minute merge at T+4:00.

---

## PC1 — Foundation, layout, video, transcript

Owns `src/app/**` (minus the two API carve-outs),
`src/components/layout/**`, `src/components/video/**`,
`src/components/transcript/**`, `src/components/ui/**`.

You are the integration owner. Your panels are the demo's spine, and three
people are blocked on your contracts. **Unblock first, polish last.**

### T+0:00 → 0:30 — Unblock the team (highest-priority work in the sprint)

1. `npm install`; read the Next 16 App Router + `next/image` docs.
2. Land the shared types block from §2 in one commit. Push.
3. Rewrite `src/app/page.tsx` to the target grid, importing every component
   at its final signature even though most are still stubs:

   ```
   ┌──────────────────────────┬──────────────────┐
   │  VideoPanel (captions)   │ AttentionTracker │
   │                          ├──────────────────┤
   │                          │  MissedAlert     │
   ├──────────────────────────┼──────────────────┤
   │  TranscriptPanel (tabs)  │  AiSummaryPanel  │
   ├──────────────────────────┴──────────────────┤
   │  AttentionTimeline (full width)             │
   └─────────────────────────────────────────────┘
   ```

   Drop `max-w-6xl` — this is a full-bleed dashboard (`h-screen`,
   `grid-cols-[3fr_2fr]`, `overflow-hidden`, panels scroll internally).
   Stack to one column below `lg`.
4. Push. Announce. **You are now unblocked to build your own panels.**

### T+0:30 → 1:45 — Your panels

5. **Header** (`src/components/layout/Header.tsx`): left logo + "FocusAid" +
   "Never miss what matters."; centre "AI attention & understanding support
   for deaf learners" (hide below `lg`); right red pulsing dot + "Live
   Lesson", a Settings button (it can open nothing), circular avatar. Ship
   the tagline change here — the current "Never lose the thread of a
   lesson" is wrong.
6. **Playback clock**: a `useEffect` interval in `page.tsx` advancing
   `currentTime` by 1s while `isPlaying`, stopping at `LESSON_DURATION`.
   Without this there is no demo — the whole screen is time-driven. Add a
   2× toggle so a 5-minute lesson demos in 2.5 minutes.
7. **Captions data**: new file `src/data/captions.ts` exporting
   `CaptionChunk[]` — split each `TranscriptItem` into ~8-second phrases
   with proportional timings. By hand for the 12 items, or a small deriving
   function; either is fine. Also export `getCaptionAt(time)`.
8. **VideoPanel**: 16:9 stage. "Prof. Emma Rossi" name chip, a CSS-drawn
   whiteboard panel titled "Today's key points" listing the photosynthesis
   bullets (light-dependent / light-independent reactions). Burned-in
   caption bar across the bottom third: **large** (`text-2xl`+), high
   contrast, dark scrim, max two lines. This is an accessibility product —
   the captions are the hero element, size them like it. No real video
   file; a styled composition reads better on a projector anyway.

### T+1:45 → 3:00 — Transcript panel

9. Tab bar: **Live Captions · Key Moments · Visual Summary · Notes**. Tab
   state is local to the panel (it is not playback state). Render
   `keyMomentsSlot` / `visualSummarySlot` — do not import PC4's modules
   directly, take them as props so a half-built panel cannot break you.
10. Live Captions tab: keep the existing list, add auto-scroll to the
    active line (`scrollIntoView({ block: "center" })`, guarded by a "user
    scrolled up" flag so it does not fight the user).
11. Missed-line treatment: for `item.id ∈ missedIds`, purple left border +
    purple tint + red `!` marker, and an aria-label saying it was missed.
    This is the visual payoff of the whole product — make it obvious.
12. Notes tab: `useState` textarea plus an "add note at 2:15" button.
    Deliberately dumb. 20 minutes, not 60.

### T+3:00 → 3:45 — Integration

13. Wire `onShowSummary` → `setSummaryRequest`, `onReplay` → `onSeek`.
14. Accessibility pass, because of who this is for: visible focus rings on
    every control; no information conveyed by colour alone (the timeline
    legend and the `!` marker carry the meaning); `prefers-reduced-motion`
    disabling the pulse animations; keyboard-reachable transcript lines.
15. Fix whatever the other three broke. That is the job at this hour.

**Done means:** the page renders at 1920×1080 without scrolling, the clock
drives every panel, and a stranger can tell what the product does in 10s.

---

## PC2 — Catch-up: the missed-moment alert and summary request

Owns `src/components/catchup/**`, `src/lib/catchup/**`,
`src/app/api/catchup/**`.

You own the moment the product justifies itself: the student looked away,
and the app noticed and offered help.

### T+0:30 → 1:15 — Logic first, against a stub

1. In `src/lib/catchup/index.ts`, keep `generateCatchUp` (it works) and add:
   - `buildMissedWindow(events, transcript, event): MissedWindow` — expands
     an `AttentionEvent` to the whole transcript lines it overlaps,
     collects `transcriptIds`, sets `hitKeyContent` from `importance`.
   - `getPendingAlert(events, transcript, currentTime, dismissedIds):
     MissedWindow | null` — returns a window whose event **has just ended**
     (within ~8s of `currentTime`) and is not dismissed. Alert *after* the
     gap, not during it; alerting someone while they are looking away is
     useless.
   - Prefer windows where `hitKeyContent` is true.

   PC3 also needs missed windows for the timeline. Settle at Checkpoint 1
   who exports the canonical `buildMissedWindow` — **suggestion: you do,
   PC3 imports it from `@/lib/catchup`.** One implementation, not two.

2. Improve the summary text. The current `bullets: missed.map(text)` just
   replays the transcript verbatim, which is exactly the "scroll back
   through infinite text" problem we exist to solve. Condense: first clause
   of each sentence, cap at 3 bullets, plus the `keyIdea` sentence.

### T+1:15 → 2:15 — `MissedAlert`

3. `src/components/catchup/MissedAlert.tsx`, matching the target exactly:
   pink/rose card, bold heading **"You might have missed something
   important"**, body "A key concept was explained while you were looking
   away and showed signs of confusion.", two buttons — solid blue **"Show
   me a summary"**, white/outline **"Replay that moment"** — plus a dismiss ×.
4. Behaviour: `onShowSummary(window)` and `onReplay(window.start)` call
   props only. Hold no playback state. Mount/unmount is a fade + slide
   (respect `prefers-reduced-motion`), and the card needs `role="status"`
   so it is announced.
5. Keep `CatchUpButton` alive as an always-available manual "What did I
   miss?". It needs a home — propose a slot to PC1 (header-adjacent, or
   inside the alert card's empty state) rather than editing `page.tsx`
   yourself.

### T+2:15 → 3:00 — Optional AI, behind a flag

6. `src/app/api/catchup/route.ts` — POST `{ start, end }`, returns the same
   `CatchUpResult` shape. **If `process.env.ANTHROPIC_API_KEY` is unset,
   return the deterministic local result immediately.** The demo must never
   depend on a network call.
   - Package `@anthropic-ai/sdk` — the one dependency add I would sanction;
     note it in the commit per rule 8.
   - Model `claude-opus-5`, `max_tokens: 1024`, adaptive thinking,
     `output_config: { effort: "low" }` — this is a 3-bullet summary, not a
     reasoning task, and low effort keeps it fast.
   - The system prompt matters here: *"Summarise for a Deaf student who
     missed this passage. Plain language, short sentences, no idioms, no
     audio references ('as you heard'). 3 bullets max."*
   - Wrap in try/catch, fall back to local on any error. Log, do not throw.
7. Client side: fire the fetch, show a skeleton, swap in the result. If it
   takes longer than ~4s, fall back.

### T+3:00 → 3:45 — Integration

8. Verify with PC3 that a window fires on the `a2` event (75-92s,
   `looking-away`, overlapping `t4`, which is `importance: "high"`). That
   is the demo beat — it must be reliable, and it must land while the
   lesson is still playing.

**Done means:** play from 0 and, around 1:35, the pink alert appears
unprompted; both buttons work; dismissing it does not bring it back.

---

## PC3 — Attention: tracker, signals, and the timeline graph

Owns `src/components/attention/**`, `src/lib/attention/**`.

You own two of the most visually load-bearing panels. The timeline is the
thing people photograph.

### T+0:30 → 1:15 — Signal data

1. New file `src/data/attention-samples.ts` (additive — do not restructure
   `attention-events.ts`, PC2 reads it):
   `export const attentionSamples: AttentionSample[]` at 1s resolution over
   300s. Generate it deterministically in-module (seeded pseudo-random
   noise plus smooth dips aligned to the existing `attentionEvents`); do
   not hand-write 300 rows. Requirements:
   - Around `a2` (75-92s): `gaze` ≈ 0.20, `confusion` ≈ 0.72,
     `engagement` ≈ 0.28 — the exact numbers on the target screen, and they
     must be true at the moment the demo pauses there.
   - Smooth (no per-frame jitter above ±0.03), or the bars look broken.
2. `src/lib/attention/index.ts` — keep `getActiveAttentionEvent`, add:
   - `getSampleAt(samples, t)` (nearest, interpolated).
   - `getAttentionLevel(sample): "high" | "medium" | "low"`.
   - `buildTimelineBands(events, transcript, duration)` — segment the full
     duration into the four colours: `key` (purple) where
     `importance === "high"`, `away` (red) / `confused` (yellow) from
     events, `high` / `recovered` (green) elsewhere. Purple wins ties; the
     "key information was being taught" band is the point.

### T+1:15 → 2:15 — `AttentionTracker`

3. `src/components/attention/AttentionTracker.tsx` (new file — keep
   `AttentionStatus.tsx` until PC1 swaps the import; do not break `main`):
   - Simulated webcam feed: dark rounded panel, stylised head-and-shoulders
     silhouette, **green tracking rectangle** with corner ticks over the
     face. No `getUserMedia` — it will prompt for permission on the demo
     machine, can fail outright, and shows whoever is presenting. *If* you
     have spare time at T+3:00 and want the wow factor, add it behind a
     toggle that defaults to off, with the silhouette as fallback.
   - Red badge, top-left: **"Attention: Low"**, driven by
     `getAttentionLevel`, switching to amber/green at higher levels.
   - Three labelled horizontal bars on the right: **Gaze to screen**,
     **Confusion (brow)**, **Engagement**, each with its `%` value. Bars
     animate with a ~300ms transition as `currentTime` advances. Confusion
     is inverted semantically — high is bad — so colour it rose while the
     others are emerald, and label it so colour is not the only cue.

### T+2:15 → 3:15 — The timeline graph

4. Rewrite `AttentionTimeline.tsx` as the full-width **"Attention &
   Understanding Timeline"**:
   - Inline `<svg>`, `viewBox="0 0 1000 120"`, `preserveAspectRatio="none"`.
   - A **wavy line** from `attentionSamples` — build the path with a
     Catmull-Rom → cubic Bézier smoothing pass, not `L` segments. Plot
     `engagement` (or a blend) as y.
   - Coloured background bands from `buildTimelineBands`, low opacity,
     behind the line so the line still reads.
   - A **legend**: High attention (green) · Looking away (red) · Confusion
     detected (yellow) · Key information (purple) · Back on track (green).
     The legend is mandatory — this is an accessibility product, and four
     unlabelled colours are exactly the failure mode we exist to fix.
   - Playhead at `currentTime`; click/drag anywhere → `onSeek`. Compute
     from `getBoundingClientRect()`, not from SVG user units.
   - Hover tooltip with the timestamp and the three values, if time allows.
   - No charting library: `recharts` is ~500KB for one sparkline, and rule
     8 says don't.

### T+3:15 → 3:45 — Integration

5. Hand PC2 whichever `MissedWindow` helper you agreed on; confirm the
   timeline's purple band and the transcript's purple line agree on `a2`.

**Done means:** the bars move continuously as the lesson plays, the
timeline is a smooth coloured wave with a legend, and clicking it seeks.

---

## PC4 — AI summary panel, flowchart, key moments

Owns `src/components/summary/**`, `src/components/threads/**`,
`src/lib/summary/**`, `src/app/api/summary/**`.

You own the payoff panel: the student clicks "Show me a summary" and gets
something better than the transcript they already could not read.

### T+0:30 → 1:30 — Summary content

1. `src/lib/summary/index.ts` — keep `groupByTopic`, add
   `buildVisualSummary(transcript, window): VisualSummaryData`:
   - `text`: 2-3 plain sentences. For the demo window it must read roughly
     *"The teacher explained the Calvin cycle — the light-independent
     reactions. It uses the ATP and NADPH from the first stage to turn
     carbon dioxide from the air into glucose."*
   - `nodes` / `edges`: the flowchart **Sun → Light-dependent reactions →
     ATP / NADPH → Calvin cycle → Glucose**, with `CO₂` as a second input
     feeding the Calvin cycle.
   - Make it window-aware. A different `MissedWindow` must produce a
     different (even if coarser) graph, or the demo dies the moment anyone
     clicks a different moment. A topic → graph lookup table with a generic
     fallback is a perfectly good implementation.

### T+1:30 → 2:45 — `AiSummaryPanel` and the flowchart

2. `src/components/summary/AiSummaryPanel.tsx`:
   - Header **"AI Summary of the missed part"**, a small sparkle/AI badge,
     and the time range ("1:15 – 1:32").
   - Empty state when `request` is null: "Summaries appear here when you
     miss something." Do not render an empty box.
   - Text block, then the visual below it.
3. `src/components/summary/SummaryFlowchart.tsx` — inline `<svg>`,
   horizontal flow, rounded node boxes colour-coded by `kind` (input /
   process / output), arrowheads via `<marker>`, labels inside the nodes.
   Lay it out with a simple left-to-right column pass (depth from root → x,
   index within depth → y); five nodes do not need a layout library. Must
   stay legible at ~420px wide. Add `role="img"` and an `aria-label` that
   describes the flow in words — an SVG diagram with no text alternative
   fails the exact users we are building for.
4. Reveal animation: nodes fade in left to right over ~600ms. Cheap, and it
   makes the "AI generated this" claim land. Respect reduced-motion.

### T+2:45 → 3:15 — The two transcript tabs

5. `KeyMoments` (in `src/components/threads/`, repurposing
   `TopicThreads`): vertical list of `importance: "high"` lines grouped
   under their topic, each clickable → `onSeek`. Mark any that intersect a
   missed window.
6. `VisualSummaryTab` (in `src/components/summary/`): the whole lesson at a
   glance — each topic a card with a one-line gist. Reuse `groupByTopic`.
   Keep it simple; it is a tab, not a second product.

### T+3:15 → 3:45 — Optional AI, behind the same flag

7. `src/app/api/summary/route.ts`, same rules as PC2's: no
   `ANTHROPIC_API_KEY` → return the local `buildVisualSummary` result;
   `@anthropic-ai/sdk`, `claude-opus-5`, `effort: "low"`, try/catch →
   local fallback. Use structured outputs (`output_config.format` with a
   JSON schema matching `VisualSummaryData`) so the flowchart can never
   break on a malformed response.
   Coordinate with PC2: **one of you adds `@anthropic-ai/sdk` to
   `package.json`**, the other pulls. Two people adding the same dependency
   is a guaranteed `package-lock.json` conflict.

**Done means:** clicking "Show me a summary" fills the panel with readable
text and a legible flowchart within a second — always, online or not.

---

## 4. Demo script (rehearse twice, from T+4:30)

1. Land on the dashboard, paused at 0:00. Point out the split: live on the
   left, help on the right. Say the problem sentence — *scrolling back
   through captions means missing what is being said right now.*
2. Press Play (2×). Captions run under the teacher, the transcript
   auto-scrolls, the attention bars breathe, the timeline fills in green.
3. ~1:15 — the student looks away. Bars drop to 20 / 72 / 28, the badge
   flips to red **Attention: Low**, the timeline goes red, then yellow.
   **Touch nothing.** Let the app notice on its own.
4. ~1:35 — the pink alert appears. This is the beat. Pause here.
5. Click **"Show me a summary"** → text and flowchart render on the right.
   Note that the lesson never stopped.
6. Point at the transcript: the purple `!` line marks exactly the gap.
7. Click **"Replay that moment"** → seeks back, captions replay.
8. Finish on the timeline: four colours, one glance, the whole session.

Total: ~3 minutes. If something is not on this path, it is not worth fixing
after T+3:45.

---

## 5. Risks, ranked

1. **`page.tsx` merge conflicts.** Only PC1 edits it. Everyone else ships
   drop-in components against the frozen prop signatures. Non-negotiable.
2. **Type-file contention.** PC1 lands all of §2 in one commit at T+0:20.
   After that, feature-local types only.
3. **Nothing integrated until T+4:00.** Prevented by merging at every
   checkpoint, not by good intentions.
4. **A live API call fails during the demo.** Every AI path has a
   deterministic local fallback that runs when the key is absent. Do the
   actual demo with `ANTHROPIC_API_KEY` **unset**, unless the live path has
   survived rehearsal twice.
5. **Duplicate missed-window logic** between PC2 and PC3 that disagrees, so
   the alert and the timeline highlight different moments. Settled at
   Checkpoint 1: one owner, one export.
6. **A real webcam on the demo machine.** Permission prompt, wrong face,
   dead air. Simulated by default; real feed only behind an off-by-default
   toggle.
7. **Polish before function.** Nobody styles anything before Checkpoint 2.
