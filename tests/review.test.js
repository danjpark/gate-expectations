import test from "node:test";
import assert from "node:assert/strict";
import { PlaneLayout } from "../src/sim/layout.js";
import { BoardingPlan } from "../src/sim/plan.js";
import { BoardingSim, MELTDOWN_TICKS } from "../src/sim/boarding.js";
import { buildReview } from "../src/sim/review.js";

const flight = (moodTicks = 90) => {
  const layout = new PlaneLayout(12, [2, 2]);
  return new BoardingSim(layout, new BoardingPlan(layout), 7, { moodTicks });
};

test("a meltdown adds exactly its fixed penalty, freezes experience, and cannot cascade", () => {
  const calm = flight(100000), sour = flight(1);
  calm.runAutoCall();
  sour.releaseZone(0);
  while (!sour.meltdown && sour.tick < 100) sour.step();
  assert.ok(sour.meltdown);
  const before = JSON.stringify(sour.passengers);
  const walkway = sour.walkway.slice(), lanes = sour.lanes.map(l => l.slice());
  const start = sour.tick;
  for (let i = 0; i < MELTDOWN_TICKS; i++) sour.step();
  assert.equal(sour.tick - start, MELTDOWN_TICKS);
  assert.equal(JSON.stringify(sour.passengers), before);
  assert.deepEqual(sour.walkway, walkway);
  assert.deepEqual(sour.lanes, lanes);
  const event = { ...sour.meltdown };
  sour.runAutoCall();
  assert.equal(sour.tick, calm.tick + MELTDOWN_TICKS);
  assert.deepEqual(sour.meltdown, event);
  assert.equal(sour.meltdownRemaining, 0);
  assert.ok(sour.passengers.every(p => p.mood() === 0));
});

test("worst jam measures consecutive actual blockage and resets when position changes", () => {
  const sim = flight();
  const p = sim.passengers[0];
  Object.assign(p, { state: 1, lane: 0, cell: 2 });
  for (let i = 0; i < 3; i++) { sim.tick++; sim.block(p); }
  assert.deepEqual(sim.worstJam, { passengerId: p.id, kind: "aisle", lane: 0, cell: 2, ticks: 3 });
  p.cell = 3;
  sim.tick++; sim.block(p);
  assert.equal(p.jam.ticks, 1);
  sim.tick += 2; sim.block(p);
  assert.equal(p.jam.ticks, 1);
  assert.equal(sim.worstJam.ticks, 3);
});

test("reviews are deterministic, read-only, bounded and backed by passenger experiences", () => {
  const sim = flight(); sim.runAutoCall();
  const before = JSON.stringify(sim);
  const review = buildReview(sim, { target: 90, money: 10, previous: { ticks: 200, mood: 20 } });
  assert.deepEqual(review, buildReview(sim, { target: 90, money: 10, previous: { ticks: 200, mood: 20 } }));
  assert.equal(JSON.stringify(sim), before);
  assert.equal(review.comparison.ticks, sim.tick - 200);
  assert.equal(review.comparison.mood, sim.averageMood() - 20);
  assert.equal(review.money, 10);
  assert.ok(review.worstJam.ticks > 0);
  assert.equal(review.worstJam.name, sim.passengers[review.worstJam.passengerId].name);
  for (const kind of ["complaints", "compliments"]) {
    assert.ok(review[kind].length <= 3);
    assert.equal(new Set(review[kind].map(c => c.category)).size, review[kind].length);
    for (const c of review[kind]) {
      assert.equal(c.name, sim.passengers[c.passengerId].name);
      assert.ok(c.evidence && c.text);
    }
  }
});

test("phrase categories have real triggers, different wording, and no complaint filler", () => {
  const sim = flight(100000); sim.runAutoCall();
  assert.deepEqual(buildReview(sim, { target: 1000 }).complaints, []);
  const p = sim.passengers[0];
  Object.assign(p, { moodTicks: 90, gateWait: 1000, blocked: 1000, seatedWait: 1000 });
  const a = buildReview(sim, { target: 1 });
  assert.equal(a.complaints.length, 1, "one comment per passenger, no padding");
  assert.equal(a.complaints[0].category, "blocked");
  assert.equal(a.complaints[0].evidence, "1000 blocked ticks");
  sim.seed++;
  assert.notEqual(a.complaints[0].text, buildReview(sim, { target: 1 }).complaints[0].text);
});
