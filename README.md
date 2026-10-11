# Gate Expectations

A comedic airport game: you're a gate agent who thinks "I could organize this better."
Paint boarding zones onto the seat map, press go, watch the passengers move, and
improve the plan on the next attempt. Earn your way from gate agent to running the airport.

**Current target: a web prototype** (plain HTML + canvas + ES modules, no build step).
The simulation is kept separate from the drawing so it can be ported to Godot 4 later.

## Status

Planes (`PLANES` in `src/sim/layout.js`): Tier 1 (24 seats, 2 zones), Tier 2 (48), single-aisle
737-style (32 rows, 3-3, 192 seats), wide-body (32 rows, 3-4-3 or 3-3-3, two aisles, one door).

- Controls sit under the canvas: a Zones panel (one row per zone with Paint and Call buttons), Flight
  (Go in auto mode, New flight, Retry), Upgrades and money kept apart in their own box, and Settings
  (plane, speed, analyze link) bottom right.
- Paint up to the plane's zone limit; call zones by hand in any order (the first call starts the flight).
- **Phase 1: call timing matters.** Calling while two or more passengers are still in the lounge line
  interleaves the newly called zone with that line, allowing later-zone passengers to slip ahead.
  The front passenger keeps their place. This one-for-one mixing rule is a deterministic placeholder,
  not a claim about real boarding. Calling at the last passenger or after the line clears preserves order;
  delaying beyond that can leave the entrance idle.
- A compact colored strip shows the next 12 passengers in actual admission order. An amber warning
  identifies a mixed line; a green cue marks a clear line with more zones to call. Existing lounge
  circles also follow the mixed queue. Phase 1 awaits local visual playtesting.
- First upgrade: auto-call zones (cheap). Calls the next zone in your chosen order once the lounge line clears, avoiding line mixing.
  Placeholder economy: $10 per finished flight, +$10 on time, upgrade costs $30. Saved in the browser.
- Seat shuffle: seated neighbours between you and your seat step into the aisle (blocking two cells),
  you sit, then they step back and sit down again.
- **Phase 2: post-flight review.** Separate time/target, average mood and money; up to three
  evidence-based complaints and compliments, the single longest consecutive blockage (passenger,
  location and ticks), and previous-attempt time/mood after Retry. New flight or plane clears comparison.
  Wording varies deterministically; no runtime language model and no combined score.
- Mood below 20 triggers at most one meltdown per flight: a visible ring/message and four fixed
  pause ticks. Experience counters freeze during the pause, so its penalty cannot cause a mood cascade.
  Thresholds, limits and penalties are placeholders. Failure and money remain time-only.
- Hover name cards; one trait (patience) feeding mood.

## Run

Needs Node 20+ (no dependencies to install).

```bash
npm start    # serves http://localhost:5173
npm test     # headless simulation tests
```

## Stats tool (dev only)

`stats.html` runs many seeded simulation flights per zone plan and overlays the boarding-time
distributions, with a seat map of each plan. Works for any plane given as rows x seat blocks
(e.g. `3-4-3`) and up to 5 zones. Zone patterns rank seats by a blend of row (back to front) and
distance from the aisle (window first), then cut the ranking into zones (`src/sim/patterns.js`).
The default analysis uses queue-empty auto-calling in numerical zone order (not a replay of manual
calls). An explicit numeric `runBatch` gap still tests fixed call timing; `0` calls only the first zone.
The search tunes the cuts for several blend angles; an optional pass then refines single seats.
CLI version: `node tools/analyze.js 32 3-4-3 5` (rows, seat blocks, zones).

## Layout

- `src/sim/` pure JS: layout, plan, manifest, passenger, boarding sim, seeded RNG. No DOM, no clock, no `Math.random`.
- `src/main.js` canvas UI; reads sim state and draws it.
- `tests/` Node test runner tests for the sim.
- `tools/serve.js` tiny static dev server.

## Simulation rules

Fixed ticks, integer cells, one seeded RNG per flight. Same plane + manifest + zones + calling policy/order (or manual calls at the same logical ticks)
= the same boarding result. Timing changes the outcome; rendering and playback speed do not change
a recorded logical call trace.

## Phase 1 playtest

Compare the same Tier 2 seed and plan using Retry:

1. Paint the outer seats as zone 1 and the two aisle seats as zone 2 (window-first).
2. Call both zones immediately. Watch the alternating colors and amber mixing warning.
3. Retry. Call zone 1, then call zone 2 when the lounge line clears.
4. Retry again and wait well past the clear-line cue before calling zone 2.
5. With the existing auto-call upgrade, compare the same plan and order to the manual attempts.

Placeholder benchmark, seeds 1–50: this two-zone Tier 2 plan averaged 112.70 ticks with immediate
calls versus 78.64 with auto-call; auto-call was faster on all 50 seeds. For seed 1, immediate calls
were 109 ticks, auto-call 80, and waiting until tick 120 for the second zone 168. These results are
specific to that plan and seed set, not a guarantee that every overlapping call hurts every plan.

Existing browser saves keep the same shape in Phases 1–2. Progression, luggage, doors and engine work remain deferred.

## Phase 2 playtest

Finish a flight, check whether the comments and worst jam match what you watched, then Retry and
compare time and mood. Delay a zone long enough to sour a passenger below 20: boarding pauses once
for four ticks, with a highlighted passenger. No further meltdowns occur that flight. Reviews and
disruption visibility await local visual playtesting. Phase 1 benchmarks above predate Phase 2.
