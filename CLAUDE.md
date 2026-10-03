# Gate Expectations: working rules

Web prototype first (vanilla JS ES modules + canvas). Godot 4 comes later; keep the sim portable.

- `src/sim/` is pure logic: no DOM, canvas, `Date`, `performance.now`, or `Math.random`.
- Fixed ticks and integer cells. Frame time may only drive the UI's tick accumulator.
- Randomness only from the flight's seeded RNG (`src/sim/rng.js`).
- Visuals only read sim state.
- Placeholder numbers; tune by playtesting. Don't invent "realistic" boarding values.
- Scope contract: Tier 1 prototype (see README). No later tiers or parked features without a doc change.
- Simplest structure for one gate, one plane. No frameworks or build step unless needed.
- Run `npm test` after every sim change.
