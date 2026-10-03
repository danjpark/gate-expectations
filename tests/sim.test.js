import test from "node:test";
import assert from "node:assert/strict";
import { PlaneLayout } from "../src/sim/layout.js";
import { BoardingPlan, MAX_ZONES_TIER1 } from "../src/sim/plan.js";
import { BoardingSim } from "../src/sim/boarding.js";
import { generateManifest } from "../src/sim/manifest.js";
import { runBatch, summarize, meanTicks, seedRange, DNF_TICKS } from "../src/sim/stats.js";
import { seatGroups, evenPattern, searchPatterns, refineSeats } from "../src/sim/patterns.js";

function flight(kind, seed, gap) {
  const layout = new PlaneLayout();
  const plan = new BoardingPlan(layout);
  if (kind === "back") plan.backHalfFirst();
  if (kind === "front") plan.frontHalfFirst();
  const sim = new BoardingSim(layout, plan, seed);
  sim.runAuto(gap);
  return sim;
}

test("manifest fills every seat exactly once", () => {
  const seats = new Set(generateManifest(new PlaneLayout(), 1).map((p) => p.seat));
  assert.equal(seats.size, 24);
});

test("same seed gives the same manifest; different seeds differ", () => {
  const l = new PlaneLayout();
  const sig = (s) => JSON.stringify(generateManifest(l, s).map((p) => [p.seat, p.patience, p.name]));
  assert.equal(sig(42), sig(42));
  assert.notEqual(sig(1), sig(2));
});

test("standing line finishes in a sane time", () => {
  const sim = flight("none", 7, 0);
  assert.ok(sim.done);
  assert.ok(sim.tick > 0 && sim.tick < 200, `ticks=${sim.tick}`);
});

test("same plane + manifest + zones gives the same time", () => {
  assert.equal(flight("back", 5, 6).tick, flight("back", 5, 6).tick);
});

test("back-half-first beats front-half-first over 20 seeds", () => {
  let back = 0, front = 0;
  for (let s = 1; s <= 20; s++) { back += flight("back", s, 6).tick; front += flight("front", s, 6).tick; }
  assert.ok(back < front, `back=${back} front=${front}`);
});

test("Tier 1 caps zones at 2", () => {
  const plan = new BoardingPlan(new PlaneLayout());
  plan.paint(0, 9);
  assert.equal(plan.zoneOfSeat[0], MAX_ZONES_TIER1 - 1);
});

test("layout depth: window is 0, aisle seat is seatsPerSide - 1, on both sides", () => {
  const l = new PlaneLayout(10, 3);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((c) => l.seatDepth(l.seatIndex(0, c))), [0, 1, 2, 2, 1, 0]);
  assert.equal(l.seatAt(4, 1, 0), l.seatIndex(4, 5));
});

test("seat interference: window-first beats aisle-first on a 2+2 plane", () => {
  const l = new PlaneLayout(12, 2);
  const byDepth = (first) => Array.from({ length: l.seatCount }, (_, s) => (l.seatDepth(s) === first ? 0 : 1));
  const seeds = seedRange(1, 20);
  assert.ok(meanTicks(l, byDepth(0), seeds) < meanTicks(l, byDepth(1), seeds));
});

test("runBatch is repeatable and a never-finishing gap counts as DNF", () => {
  const l = new PlaneLayout();
  const z = Array.from({ length: 24 }, (_, s) => (l.seatRow(s) >= 6 ? 0 : 1));
  const seeds = seedRange(1, 10);
  assert.deepEqual(runBatch(l, z, seeds), runBatch(l, z, seeds));
  assert.equal(runBatch(l, z, [1], 0)[0], DNF_TICKS); // gap 0 never calls zone 2
});

test("patterns scale to 204 seats and 5 zones with balanced even zones", () => {
  const l = new PlaneLayout(34, 3);
  for (const angle of [0, 45, 90]) {
    const sizes = [0, 0, 0, 0, 0];
    for (const z of evenPattern(l, angle, 5)) sizes[z]++;
    const expectZones = angle === 90 ? 3 : 5; // only 3 seat depths when sorting purely by depth
    assert.equal(sizes.filter((n) => n > 0).length, expectZones, `angle ${angle}: ${sizes}`);
  }
  assert.equal(seatGroups(l, 0).length, 34);  // one group per row
  assert.equal(seatGroups(l, 90).length, 3);  // window, middle, aisle
});

test("pattern search beats even back-to-front on held-out seeds (2+2 plane)", () => {
  const l = new PlaneLayout(12, 2);
  const [best] = searchPatterns({ layout: l, zones: 3, trainSeeds: seedRange(1, 15), angles: [0, 45, 90] });
  const held = seedRange(5001, 200);
  assert.ok(meanTicks(l, best.zoneOfSeat, held) < meanTicks(l, evenPattern(l, 0, 3), held));
});

test("seat refinement never makes the training mean worse", () => {
  const l = new PlaneLayout(12, 2);
  const train = seedRange(1, 10);
  const start = evenPattern(l, 90, 3);
  const r = refineSeats({ layout: l, zones: 3, trainSeeds: train, start, budget: 40 });
  assert.ok(r.trainMean <= meanTicks(l, start, train));
});

test("summarize reports mean and percentiles", () => {
  const s = summarize([1, 2, 3, 4]);
  assert.equal(s.mean, 2.5);
  assert.equal(s.median, 3);
});
