import test from "node:test";
import assert from "node:assert/strict";
import { PlaneLayout } from "../src/sim/layout.js";
import { BoardingPlan, MAX_ZONES_TIER1 } from "../src/sim/plan.js";
import { BoardingSim } from "../src/sim/boarding.js";
import { generateManifest } from "../src/sim/manifest.js";

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
