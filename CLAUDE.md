@AGENTS.md

# FocusAid — hackathon project rules

This is a 5-hour hackathon project built by 4 developers (4 Claude Code
instances) working in parallel against one shared repo. Optimize for a
working demo, not production architecture.

## Ground rules

1. This is a 4-person parallel hackathon — expect concurrent, fast-moving
   changes from other developers.
2. Do not make repo-wide refactors or renames. If something looks messy,
   leave it unless it blocks your feature.
3. Respect the directory ownership map below.
4. Do not modify another developer's feature area unless you're genuinely
   blocked by it — and say so clearly in the commit message.
5. Changes to shared files (`src/types/**`, `src/data/**`) should be
   minimal and additive. Prefer adding a new optional field over changing
   an existing one's meaning.
6. Keep components composable via props — a feature component should be
   droppable into `src/app/page.tsx` without the page needing a rewrite.
7. Run `npm run build` and `npm run lint` before committing.
8. Do not add dependencies casually. Ask (or note it clearly in the PR) if
   you think one is genuinely needed.
9. Do not rename or move files outside your area.
10. Optimize for a working demo in 5 hours, not production correctness.

## Feature ownership map

| Area | Owns |
| --- | --- |
| PC1 — Foundation + UI | `src/app/**`, `src/components/layout/**`, `src/components/video/**`, `src/components/transcript/**`, page composition |
| PC2 — Catch-up | `src/components/catchup/**`, `src/lib/catchup/**` |
| PC3 — Attention | `src/components/attention/**`, `src/lib/attention/**` |
| PC4 — Summaries + Threads | `src/components/summary/**`, `src/components/threads/**`, `src/lib/summary/**` |
| Shared (minimal & stable) | `src/types/**`, `src/data/**` |

## Playback time

`src/app/page.tsx` owns the single `currentTime` source of truth and passes
it down as a prop. Do not introduce a second/competing playback state —
transcript, catch-up, attention, and timeline all read the same value.

## Out of scope for this sprint

Real eye tracking, real emotion recognition, authentication, a database,
and production infrastructure. Attention/gaze/confusion data is simulated
via `src/data/attention-events.ts`.
