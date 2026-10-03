// Dev analysis: distribution per plan, and a search for the best plan.
// Usage: node tools/analyze.js
import { PlaneLayout } from "../src/sim/layout.js";
import { runBatch, summarize, optimizePlan, bestGap, seedRange } from "../src/sim/stats.js";

const layout = new PlaneLayout();
const train = seedRange(1, 100);
const holdout = seedRange(10001, 2000); // never seen by the optimizer
const rows = (f) => Array.from({ length: layout.seatCount }, (_, s) => (f(layout.seatRow(s), layout.seatCol(s)) ? 0 : 1));
const baselines = {
  "standing line (1 zone)": rows(() => true),
  "front half first": rows((r) => r < 6),
  "back half first": rows((r) => r >= 6),
  "window seats first": rows((r, c) => c === 0),
};
const fmt = (n) => n.toFixed(2);

let t = performance.now();
console.log("plan                          gap  mean   sd    p10 med p90  on-time(<=45)");
for (const [name, z] of Object.entries(baselines)) {
  const { gap } = bestGap(layout, z, train);
  const s = summarize(runBatch(layout, z, gap, holdout), 45);
  console.log(`${name.padEnd(30)}${String(gap).padStart(3)}  ${fmt(s.mean)} ${fmt(s.sd)}  ${s.p10}  ${s.median}  ${s.p90}   ${(s.onTime * 100).toFixed(0)}%`);
}
console.log(`(baselines: ${(performance.now() - t).toFixed(0)} ms)\n`);

t = performance.now();
const best = optimizePlan({ layout, trainSeeds: train, starts: Object.values(baselines), restarts: 6 });
const s = summarize(runBatch(layout, best.zoneOfSeat, best.gap, holdout), 45);
console.log(`optimizer (${((performance.now() - t) / 1000).toFixed(1)} s): gap ${best.gap}, train mean ${fmt(best.trainMean)}, held-out mean ${fmt(s.mean)} sd ${fmt(s.sd)} on-time ${(s.onTime * 100).toFixed(0)}%`);
console.log("zones by row (window/aisle):");
for (let r = 0; r < layout.rows; r++) {
  console.log(`  row ${String(r + 1).padStart(2)}: ${best.zoneOfSeat[r * 2] + 1} ${best.zoneOfSeat[r * 2 + 1] + 1}`);
}
