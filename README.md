# FocusAid

FocusAid is an AI learning accessibility tool for students who miss parts of
a live or recorded lesson. It surfaces timestamped captions, lets a student
ask "catch me up" to get a summary of what they missed, and simulates
attention/understanding signals (real eye tracking and emotion recognition
are out of scope for this prototype).

This is a hackathon prototype, not production software. Attention/gaze data
is simulated with mock data — there is no real tracking, database, or auth.

## Install

```bash
npm install
```

## Run (dev)

```bash
npm run dev
```

Then open http://localhost:3000.

## Build

```bash
npm run build
```

## Lint

```bash
npm run lint
```

## Project structure

```
src/
  app/                 # Next.js App Router pages, layout, composition
  components/
    layout/            # Header, page chrome
    video/             # Lesson video area (mock player)
    transcript/        # Timestamped captions/transcript
    catchup/            # "Catch me up" feature
    attention/         # Attention status + timeline
    summary/           # AI summary / visual summaries
    threads/           # Topic/conversation threads
    ui/                # Small shared primitives (Card, Badge)
  data/                # Shared mock data (transcript, attention events)
  lib/
    catchup/           # Catch-up summarization logic
    attention/         # Attention scoring/alert logic
    summary/           # Summary/thread grouping logic
  types/               # Shared TypeScript domain types
```

`src/app/page.tsx` is the integration/composition layer. It owns the single
source of truth for lesson playback time (`currentTime`) and passes it down
to every feature area. Do not create competing playback state elsewhere.

## Team ownership

| Area | Owns |
| --- | --- |
| PC1 — Foundation + UI | `src/app/**`, `src/components/layout/**`, `src/components/video/**`, `src/components/transcript/**`, page composition |
| PC2 — Catch-up | `src/components/catchup/**`, `src/lib/catchup/**` |
| PC3 — Attention | `src/components/attention/**`, `src/lib/attention/**` |
| PC4 — Summaries + Threads | `src/components/summary/**`, `src/components/threads/**`, `src/lib/summary/**` |
| Shared (keep minimal & stable) | `src/types/**`, `src/data/**` |

See `CLAUDE.md` for the full collaboration rules.

## Git workflow

- `main` is the shared integration branch — always in a working state.
- Branch per feature area, e.g. `feature/catchup`, `feature/attention`.
- Pull from `main` before starting a session; merge/rebase back often to
  keep conflicts small.
- Only touch another developer's directory if you're unblocking something
  and you say so in the PR/commit message.

```bash
git fetch origin
git checkout main
git pull origin main
git checkout -b feature/<your-area>
```

## Current prototype scope

- Simulated attention/gaze/confusion data (no real tracking)
- Mock lesson video with basic play/pause/seek controls
- Static demo transcript (photosynthesis / Calvin cycle lesson)
- Manual "Catch me up" over a recent time window
- Attention timeline and status built from mock events
- Basic AI summary / topic thread placeholders

## Out of scope

- Real eye tracking or facial/emotion recognition
- Authentication
- A real database or persistence layer
- Production infrastructure, deployment hardening
- Complex global state management
