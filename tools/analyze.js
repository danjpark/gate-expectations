// Dev analysis from the command line. Usage: node tools/analyze.js [rows] [seatsPerSide] [zones]
import { PlaneLayout } from "../src/sim/layout.js";
import { runBatch, summarize, seedRange } from "../src/sim/stats.js";
import { searchPatterns, evenPattern } from "../src/sim/patterns.js";

const [rows = 12, perSide = 2, zones = 3] = process.argv.slice(2).map(Number);
const layout = new PlaneLayout(rows, perSide);
const big = layout.seatCount > 60;
const train = seedRange(1, big ? 30 : 100);
const holdout = seedRange(10001, big ? 300 : 2000);
const report = (name, z) => {
  const s = summarize(runBatch(layout, z, holdout));
  console.log(`${s.mean.toFixed(2).padStart(8)} ±${s.sd.toFixed(2)}  ${name}`);
};

console.log(`${rows} rows x ${perSide * 2} seats = ${layout.seatCount} seats, ${zones} zones`);
let t = performance.now();
report("Standing line", Array(layout.seatCount).fill(0));
report("Rows back to front, even", evenPattern(layout, 0, zones));
if (perSide > 1) report("Window to aisle, even", evenPattern(layout, 90, zones));
console.log(`baselines ${(performance.now() - t).toFixed(0)} ms`);

t = performance.now();
const found = searchPatterns({ layout, zones, trainSeeds: train });
console.log(`search ${((performance.now() - t) / 1000).toFixed(1)} s, ${found.reduce((a, r) => a + r.evaluations, 0)} plans tried`);
for (const r of found.slice(0, 4)) report(r.label, r.zoneOfSeat);
