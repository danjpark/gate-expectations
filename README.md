# Gate Expectations

A comedic airport game: you're a gate agent who thinks "I could organize this better."
Paint boarding zones onto the seat map, press go, watch the passengers move, and
improve the plan on the next attempt. Earn your way from gate agent to running the airport.

**Current target: a web prototype** (plain HTML + canvas + ES modules, no build step).
The simulation is kept separate from the drawing so it can be ported to Godot 4 later.

## Status

Prototype scope = Tier 1 only: 24 seats (12 rows, 1 seat per side), manual zone release,
2-zone cap, hover name cards, one trait (patience) feeding mood. Anything beyond that needs
a design-doc change first.

## Run

Needs Node 20+ (no dependencies to install).

```bash
npm start    # serves http://localhost:5173
npm test     # headless simulation tests
```

## Stats tool (dev only)

`stats.html` runs many seeded simulation flights per zone plan and overlays the boarding-time
distributions, with a seat map of each plan. Works for any single-aisle plane (rows x seats per side)
and up to 5 zones. Zone patterns rank seats by a blend of row (back to front) and seat depth
(window to aisle), then cut the ranking into zones (`src/sim/patterns.js`). The search tunes the
cuts for several blend angles; an optional pass then refines single seats. CLI version:
`node tools/analyze.js 34 3 5` (rows, seats per side, zones).

## Layout

- `src/sim/` pure JS: layout, plan, manifest, passenger, boarding sim, seeded RNG. No DOM, no clock, no `Math.random`.
- `src/main.js` canvas UI; reads sim state and draws it.
- `tests/` Node test runner tests for the sim.
- `tools/serve.js` tiny static dev server.

## Simulation rules

Fixed ticks, integer cells, one seeded RNG per flight. Same plane + manifest + zones = same boarding time.
