import test from "node:test";
import assert from "node:assert/strict";
import { PlaneLayout } from "../src/sim/layout.js";
import { BoardingPlan, MAX_ZONES_TIER1 } from "../src/sim/plan.js";
import { BoardingSim } from "../src/sim/boarding.js";
import { generateManifest } from "../src/sim/manifest.js";
import { runBatch, summarize, optimizePlan, seedRange, DNF_TICKS } from "../src/sim/stats.js";

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

test("runBatch is repeatable and a never-finishing gap counts as DNF", () => {
  const l = new PlaneLayout();
  const z = Array.from({ length: 24 }, (_, s) => (l.seatRow(s) >= 6 ? 0 : 1));
  const seeds = seedRange(1, 10);
  assert.deepEqual(runBatch(l, z, 6, seeds), runBatch(l, z, 6, seeds));
  assert.ok(runBatch(l, z, 0, [1])[0] === DNF_TICKS); // gap 0 never calls zone 2
});

test("optimizer beats the best simple plan on held-out seeds", () => {
  const l = new PlaneLayout();
  const back = Array.from({ length: 24 }, (_, s) => (l.seatRow(s) >= 6 ? 0 : 1));
  const best = optimizePlan({ layout: l, trainSeeds: seedRange(1, 30), starts: [back], restarts: 0 });
  const held = seedRange(5001, 300);
  const mean = (z, g) => summarize(runBatch(l, z, g, held)).mean;
  assert.ok(mean(best.zoneOfSeat, best.gap) <= mean(back, 6) + 0.1);
});

test("Tier 1 caps zones at 2", () => {
  const plan = new BoardingPlan(new PlaneLayout());
  plan.paint(0, 9);
  assert.equal(plan.zoneOfSeat[0], MAX_ZONES_TIER1 - 1);
});
