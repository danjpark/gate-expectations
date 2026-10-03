// Analysis tools (not part of the game): run many flights and summarise, or search for good plans.
// Pure and deterministic. Uses the same sim as the game.
import { BoardingPlan } from "./plan.js";
import { BoardingSim } from "./boarding.js";
import { makeRng } from "./rng.js";

export const seedRange = (from, count) => Array.from({ length: count }, (_, i) => from + i);

// Boarding ticks for one plan + release gap, once per seed. Same seeds => comparable runs.
export function runBatch(layout, zoneOfSeat, gap, seeds, maxZones = 2) {
  const plan = new BoardingPlan(layout, maxZones);
  plan.zoneOfSeat = zoneOfSeat.slice();
  // A flight that never finishes (e.g. gap 0 with 2 zones never calls zone 2) counts as DNF_TICKS.
  return seeds.map((seed) => {
    const t = new BoardingSim(layout, plan, seed).runAuto(gap, DNF_TICKS);
    return t < 0 ? DNF_TICKS : t;
  });
}
export const DNF_TICKS = 1000;

export function summarize(ticks, target = Infinity) {
  const n = ticks.length;
  const sorted = ticks.slice().sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(sorted.reduce((a, t) => a + (t - mean) ** 2, 0) / n);
  const q = (p) => sorted[Math.min(n - 1, Math.floor(p * n))];
  const hist = new Map();
  for (const t of sorted) hist.set(t, (hist.get(t) ?? 0) + 1);
  return { n, mean, sd, min: sorted[0], max: sorted[n - 1], p10: q(0.1), median: q(0.5), p90: q(0.9),
    onTime: sorted.filter((t) => t <= target).length / n, hist };
}

// Hill-climb over (zone per seat, release gap), minimising mean boarding ticks on `trainSeeds`.
// Best-improvement steps from several starting points; the result is a good plan, not a proven optimum.
export function optimizePlan({ layout, trainSeeds, maxZones = 2, gaps = [1, 12], restarts = 6, rngSeed = 1, starts = [] }) {
  const rng = makeRng(rngSeed);
  const mean = (z, g) => runBatch(layout, z, g, trainSeeds, maxZones).reduce((a, b) => a + b, 0) / trainSeeds.length;
  const climb = (z0, g0) => {
    let z = z0.slice(), g = g0, best = mean(z, g);
    for (;;) {
      let move = null, bestScore = best;
      for (let s = 0; s < z.length; s++) {
        for (let v = 0; v < maxZones; v++) {
          if (v === z[s]) continue;
          const old = z[s]; z[s] = v;
          const m = mean(z, g);
          z[s] = old;
          if (m < bestScore - 1e-9) { bestScore = m; move = { s, v }; }
        }
      }
      for (const dg of [-1, 1]) {
        const ng = g + dg;
        if (ng < gaps[0] || ng > gaps[1]) continue;
        const m = mean(z, ng);
        if (m < bestScore - 1e-9) { bestScore = m; move = { g: ng }; }
      }
      if (!move) return { zoneOfSeat: z, gap: g, trainMean: best };
      if (move.g !== undefined) g = move.g; else z[move.s] = move.v;
      best = bestScore;
    }
  };
  const randomStart = () => Array.from({ length: layout.seatCount }, () => rng.int(0, maxZones - 1));
  const seedsFrom = [...starts, ...Array.from({ length: restarts }, randomStart)];
  let champion = null;
  for (const z of seedsFrom) {
    const r = climb(z, Math.round((gaps[0] + gaps[1]) / 2));
    if (!champion || r.trainMean < champion.trainMean) champion = r;
  }
  return champion;
}

// Best release gap for a fixed plan.
export function bestGap(layout, zoneOfSeat, seeds, maxGap = 12, maxZones = 2) {
  let best = null;
  for (let g = 1; g <= maxGap; g++) {
    const m = summarize(runBatch(layout, zoneOfSeat, g, seeds, maxZones)).mean;
    if (!best || m < best.mean) best = { gap: g, mean: m };
  }
  return best;
}
