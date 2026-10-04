// Analysis tools (not part of the game): run many flights of a plan and summarise them.
// Pure and deterministic. Uses the same sim as the game.
import { BoardingPlan } from "./plan.js";
import { BoardingSim } from "./boarding.js";

import { MAX_FLIGHT_TICKS } from "./tuning.js";

export const DNF_TICKS = MAX_FLIGHT_TICKS;
// null uses the game's queue-empty auto-caller. An integer gap is an explicit experimental policy.
export const STATS_GAP = null;

export const seedRange = (from, count) => Array.from({ length: count }, (_, i) => from + i);

// Boarding ticks for one plan, once per seed. Same seeds => comparable runs.
// A flight that never finishes counts as DNF_TICKS.
export function runBatch(layout, zoneOfSeat, seeds, gap = STATS_GAP, order) {
  if (!seeds.length) throw new RangeError("at least one seed is required");
  if (gap !== null && (!Number.isSafeInteger(gap) || gap < 0)) throw new RangeError("gap must be null or a nonnegative integer");
  const maxZone = Math.max(...zoneOfSeat);
  const plan = new BoardingPlan(layout, maxZone + 1);
  plan.zoneOfSeat = zoneOfSeat.slice();
  return seeds.map((seed) => {
    const sim = new BoardingSim(layout, plan, seed);
    const t = gap === null ? sim.runAutoCall(DNF_TICKS, order) : sim.runAuto(gap, DNF_TICKS, order);
    return t < 0 ? DNF_TICKS : t;
  });
}

export const meanTicks = (layout, zoneOfSeat, seeds, order) =>
  runBatch(layout, zoneOfSeat, seeds, undefined, order).reduce((a, b) => a + b, 0) / seeds.length;

export function summarize(ticks) {
  const n = ticks.length;
  if (!n) throw new RangeError("cannot summarize an empty sample");
  const sorted = ticks.slice().sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(sorted.reduce((a, t) => a + (t - mean) ** 2, 0) / n);
  const q = (p) => sorted[Math.min(n - 1, Math.floor(p * n))];
  return { n, mean, sd, min: sorted[0], max: sorted[n - 1], p10: q(0.1), median: q(0.5), p90: q(0.9) };
}
