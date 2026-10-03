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

// Every way to cut the plane into `zones` contiguous bands of rows and choose the boarding order of the
// bands. Exhaustive: C(rows-1, zones-1) * zones! plans (330 for 3 zones on 12 rows). Returns the best
// `top` by mean ticks on `trainSeeds`, with a readable label.
export function searchRowBands({ layout, zones, trainSeeds, top = 3, gap = 1 }) {
  const R = layout.rows;
  const cutSets = [];
  const pick = (start, chosen) => {
    if (chosen.length === zones - 1) { cutSets.push(chosen.slice()); return; }
    for (let c = start; c < R; c++) { chosen.push(c); pick(c + 1, chosen); chosen.pop(); }
  };
  pick(1, []);
  const orders = [];
  const permute = (arr, rest) => {
    if (!rest.length) { orders.push(arr); return; }
    rest.forEach((v, i) => permute([...arr, v], rest.filter((_, j) => j !== i)));
  };
  permute([], Array.from({ length: zones }, (_, i) => i));

  const results = [];
  for (const cuts of cutSets) {
    const edges = [0, ...cuts, R];
    for (const order of orders) { // order[b] = boarding rank of band b (0 boards first)
      const zoneOfSeat = Array.from({ length: layout.seatCount }, (_, s) => {
        const r = layout.seatRow(s);
        return order[edges.findIndex((e, i) => r >= e && r < edges[i + 1])];
      });
      const mean = runBatch(layout, zoneOfSeat, gap, trainSeeds, zones).reduce((a, b) => a + b, 0) / trainSeeds.length;
      const bands = order.map((rank, b) => ({ rank, b })).sort((x, y) => x.rank - y.rank)
        .map(({ b }) => `rows ${edges[b] + 1}-${edges[b + 1]}`);
      results.push({ zoneOfSeat, gap, trainMean: mean, label: bands.join(" then ") });
    }
  }
  return results.sort((a, b) => a.trainMean - b.trainMean).slice(0, top);
}

// Equal-sized row bands, rear first (what "split the plane into thirds" means).
export function evenBands(layout, zones) {
  return Array.from({ length: layout.seatCount }, (_, s) =>
    zones - 1 - Math.min(zones - 1, Math.floor((layout.seatRow(s) * zones) / layout.rows)));
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
