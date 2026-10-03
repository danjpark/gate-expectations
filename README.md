# Gate Expectations

A comedic airport game: you're a gate agent who thinks "I could organize this better."
Paint boarding zones onto the seat map, press go, watch the passengers move, and
improve the plan on the next attempt. Earn your way from gate agent to running the airport.

**Current target: a web prototype** (plain HTML + canvas + ES modules, no build step).
The simulation is kept separate from the drawing so it can be ported to Godot 4 later.

## Status

Planes (`PLANES` in `src/sim/layout.js`): Tier 1 (24 seats, 2 zones), Tier 2 (48), single-aisle
737-style (32 rows, 3-3, 192 seats), wide-body (32 rows, 3-4-3 or 3-3-3, two aisles, one door).

- Paint up to the plane's zone limit; call zones by hand in any order (the first call starts the flight).
- First upgrade: auto-call zones (cheap). Calls the next zone in your chosen order once the lounge line clears.
  Placeholder economy: $10 per finished flight, +$10 on time, upgrade costs $30. Saved in the browser.
- Seat shuffle: seated neighbours between you and your seat step into the aisle (blocking two cells),
  you sit, then they step back and sit down again.
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
The search tunes the cuts for several blend angles; an optional pass then refines single seats.
CLI version: `node tools/analyze.js 32 3-4-3 5` (rows, seat blocks, zones).

## Layout

- `src/sim/` pure JS: layout, plan, manifest, passenger, boarding sim, seeded RNG. No DOM, no clock, no `Math.random`.
- `src/main.js` canvas UI; reads sim state and draws it.
- `tests/` Node test runner tests for the sim.
- `tools/serve.js` tiny static dev server.

## Simulation rules

Fixed ticks, integer cells, one seeded RNG per flight. Same plane + manifest + zones = same boarding time.
