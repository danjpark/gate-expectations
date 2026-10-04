// Zone patterns that scale to any single-aisle plane and any zone count.
//
// Every pattern is "rank the seats, then cut the ranking into zones":
//   score(seat) = cos(angle) * rowFromBack + sin(angle) * nearnessToAisle   (both 0..1, lower boards first)
//   angle 0   -> rows, back to front
//   angle 90  -> window, then middle, then aisle seats
//   in between -> a diagonal sweep: rear windows first, then front windows with rear middles, and so on
// Seats with equal scores (e.g. the left and right window of one row) form a group and always share a zone.
// The search tries a set of angles and, for each, moves the cut points to minimise mean boarding ticks.
import { meanTicks } from "./stats.js";
import { makeRng } from "./rng.js";

export const SEARCH_ANGLES = [0, 15, 30, 45, 60, 75, 85, 90];

export function patternName(angle) {
  if (angle === 0) return "Rows, back to front";
  if (angle === 90) return "Window to aisle";
  return `Diagonal ${angle}°`;
}

// Seat groups in boarding-priority order for one angle.
export function seatGroups(layout, angle) {
  const rad = (angle * Math.PI) / 180;
  const rowSpan = Math.max(1, layout.rows - 1), distSpan = Math.max(1, layout.maxDistance);
  const byScore = new Map();
  for (let s = 0; s < layout.seatCount; s++) {
    const fromBack = (layout.rows - 1 - layout.seatRow(s)) / rowSpan;
    const fromWindow = 1 - layout.seatAisleDistance(s) / distSpan; // seats farthest from their aisle board first
    const key = Math.round((Math.cos(rad) * fromBack + Math.sin(rad) * fromWindow) * 1e6);
    if (!byScore.has(key)) byScore.set(key, []);
    byScore.get(key).push(s);
  }
  return [...byScore.keys()].sort((a, b) => a - b).map((k) => byScore.get(k));
}

// cuts: strictly increasing group indices; groups before cuts[0] are zone 0, and so on.
export function planFromCuts(layout, groups, cuts) {
  const zoneOfSeat = new Array(layout.seatCount).fill(0);
  let zone = 0;
  groups.forEach((g, i) => {
    while (zone < cuts.length && i >= cuts[zone]) zone++;
    for (const s of g) zoneOfSeat[s] = zone;
  });
  return zoneOfSeat;
}

// Cuts that make zones as close to equal size as the groups allow.
export function evenCuts(groups, zones) {
  const k = Math.min(zones, groups.length);
  const total = groups.reduce((a, g) => a + g.length, 0);
  const cuts = [];
  let seen = 0;
  groups.forEach((g, i) => {
    if (i === 0) { seen += g.length; return; }
    const want = (cuts.length + 1) * total / k;
    if (cuts.length < k - 1 && seen + g.length / 2 > want) cuts.push(i);
    seen += g.length;
  });
  // Guarantee k - 1 cuts (tiny planes / lumpy groups).
  for (let i = groups.length - 1; cuts.length < k - 1 && i > 0; i--) if (!cuts.includes(i)) cuts.push(i);
  return cuts.sort((a, b) => a - b);
}

export function evenPattern(layout, angle, zones) {
  const groups = seatGroups(layout, angle);
  return planFromCuts(layout, groups, evenCuts(groups, zones));
}

const zoneSizes = (zoneOfSeat) => {
  const sizes = [];
  for (const z of zoneOfSeat) sizes[z] = (sizes[z] ?? 0) + 1;
  return sizes;
};

// For one angle: start from even cuts, then move each cut by +-step, halving the step when stuck.
export function tuneCuts({ layout, angle, zones, trainSeeds, order }) {
  const groups = seatGroups(layout, angle);
  const G = groups.length;
  const cache = new Map();
  const score = (cuts) => {
    const key = cuts.join(",");
    if (!cache.has(key)) cache.set(key, meanTicks(layout, planFromCuts(layout, groups, cuts), trainSeeds, order));
    return cache.get(key);
  };
  let cuts = evenCuts(groups, zones), best = score(cuts);
  let step = Math.max(1, Math.floor(G / (2 * Math.max(1, cuts.length + 1))));
  while (cuts.length && step >= 1) {
    let improved = false;
    for (let i = 0; i < cuts.length; i++) {
      for (const d of [-step, step]) {
        const c = cuts.slice();
        c[i] += d;
        const lo = i === 0 ? 1 : c[i - 1] + 1, hi = i === c.length - 1 ? G - 1 : c[i + 1] - 1;
        if (c[i] < lo || c[i] > hi) continue;
        const m = score(c);
        if (m < best - 1e-9) { best = m; cuts = c; improved = true; }
      }
    }
    if (!improved) step = Math.floor(step / 2);
  }
  const zoneOfSeat = planFromCuts(layout, groups, cuts);
  return { angle, zoneOfSeat, trainMean: best, evaluations: cache.size,
    label: `${patternName(angle)} · zone sizes ${zoneSizes(zoneOfSeat).join("/")}` };
}

// Best pattern per angle, sorted best first. Planes where every seat is an aisle seat have no
// window/aisle choice, so only the row angle is searched there.
export function searchPatterns({ layout, zones, trainSeeds, order, angles = SEARCH_ANGLES, onProgress = () => {} }) {
  const use = layout.maxDistance === 0 ? [0] : angles;
  const byPlan = new Map(); // different angles can land on the same plan; keep one, note the angles
  use.forEach((angle, i) => {
    onProgress(`${patternName(angle)} (${i + 1}/${use.length})`);
    const r = tuneCuts({ layout, angle, zones, trainSeeds, order });
    const key = r.zoneOfSeat.join(",");
    if (byPlan.has(key)) byPlan.get(key).angles.push(angle);
    else byPlan.set(key, { ...r, angles: [angle] });
  });
  return [...byPlan.values()]
    .map((r) => (r.angles.length > 1 ? { ...r, label: `${r.label} (same plan from ${r.angles.join("°, ")}°)` } : r))
    .sort((a, b) => a.trainMean - b.trainMean);
}

// Seat-by-seat refinement: random single-seat zone changes, kept only if they lower the mean.
// Works for any plane size because it has a fixed evaluation budget.
export function refineSeats({ layout, zones, trainSeeds, start, order, budget = 400, rngSeed = 1, onProgress = () => {} }) {
  const rng = makeRng(rngSeed);
  const z = start.slice();
  let best = meanTicks(layout, z, trainSeeds, order), accepted = 0;
  for (let i = 0; i < budget && zones > 1; i++) {
    const s = rng.int(0, z.length - 1);
    const v = rng.int(0, zones - 2);
    const old = z[s];
    z[s] = v >= old ? v + 1 : v;
    const m = meanTicks(layout, z, trainSeeds, order);
    if (m < best - 1e-9) { best = m; accepted++; } else z[s] = old;
    if (i % 25 === 0) onProgress(`seat moves ${i}/${budget}, kept ${accepted}`);
  }
  return { zoneOfSeat: z, trainMean: best, label: `Refined seat by seat (${accepted} changes kept) · zone sizes ${zoneSizes(z).join("/")}` };
}
