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

test("layout: aisle distance and aisle choice for 3-3 and 3-4-3", () => {
  const n = new PlaneLayout(10, [3, 3]);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((c) => n.seatAisleDistance(c)), [2, 1, 0, 0, 1, 2]);
  assert.deepEqual(n.seatsBetweenAisle(n.seatIndex(4, 0)), [n.seatIndex(4, 1), n.seatIndex(4, 2)]);
  const w = new PlaneLayout(10, [3, 4, 3]);
  assert.equal(w.aisleCount, 2);
  assert.deepEqual([...Array(10).keys()].map((c) => w.seatAisle(c)), [0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);
  assert.deepEqual([...Array(10).keys()].map((c) => w.seatAisleDistance(c)), [2, 1, 0, 0, 1, 1, 0, 0, 1, 2]);
});

// Seat 0 of row 0 is the left window of a 3-3 plane; seats 1 and 2 are between it and the aisle.
function shuffleScenario() {
  const l = new PlaneLayout(4, [3, 3]);
  const plan = new BoardingPlan(l, 5);
  const sim = new BoardingSim(l, plan, 1);
  for (const s of [1, 2]) sim.seat(sim.bySeat[s]);
  const window = sim.bySeat[0];
  window.state = 1; window.lane = 0; window.cell = window.targetCell; // standing at row 0
  sim.lanes[0][window.targetCell] = window.id;
  sim.arrive(window);
  return { sim, window, c: window.targetCell };
}

test("seat shuffle: neighbours stand in the aisle past the row, then step back and reseat", () => {
  const { sim, window, c } = shuffleScenario();
  assert.equal(window.neighbours.length, 2);
  sim.step();
  assert.equal(sim.lanes[0][c + 1], -2, "neighbours hold the cell past the row");
  assert.equal(sim.bySeat[1].state, 3, "middle passenger is standing");
  let ticks = 0;
  while (window.state !== 2 && ticks++ < 50) sim.step();
  assert.equal(sim.lanes[0][c], -2, "neighbours now hold the row's own cell while reseating");
  while (sim.bySeat[1].state !== 2 && ticks++ < 50) sim.step();
  assert.equal(sim.lanes[0][c], -1);
  assert.ok(sim.seatTaken[0] && sim.seatTaken[1] && sim.seatTaken[2]);
});

test("seat interference: window-first beats aisle-first on a 3-3 plane", () => {
  const l = new PlaneLayout(12, [3, 3]);
  const by = (first) => Array.from({ length: l.seatCount }, (_, s) => (l.seatAisleDistance(s) === first ? 0 : 1));
  const seeds = seedRange(1, 20);
  assert.ok(meanTicks(l, by(2), seeds) < meanTicks(l, by(0), seeds));
});

test("zones can be called in any order; auto-call follows a chosen order", () => {
  const l = new PlaneLayout();
  const plan = new BoardingPlan(l, 3);
  for (let s = 0; s < l.seatCount; s++) plan.paint(s, l.seatRow(s) % 3);
  const sim = new BoardingSim(l, plan, 3);
  sim.releaseZone(2);
  assert.deepEqual(sim.released, [false, false, true]);
  assert.ok(sim.gateQueue.every((p) => p.zone === 2));
  sim.releaseZone(2); // calling twice does nothing
  assert.equal(sim.gateQueue.length, 8);
  const auto = new BoardingSim(l, plan, 3);
  const order = [1, 2, 0];
  const calls = [];
  while (!auto.done) {
    const before = auto.released.slice();
    auto.autoCall(order);
    auto.released.forEach((r, z) => { if (r && !before[z]) calls.push(z); });
    auto.step();
  }
  assert.deepEqual(calls, order);
});

test("wide-body boards on two aisles and finishes", () => {
  const l = new PlaneLayout(32, [3, 4, 3]);
  const plan = new BoardingPlan(l, 5);
  const sim = new BoardingSim(l, plan, 1);
  sim.releaseZone(0);
  let usedRight = false;
  while (!sim.done && sim.tick < 5000) { sim.step(); usedRight ||= sim.lanes[1].some((v) => v >= 0); }
  assert.ok(sim.done && usedRight);
  assert.equal(sim.seatedCount, 320);
});

test("runBatch is repeatable and a never-finishing gap counts as DNF", () => {
  const l = new PlaneLayout();
  const z = Array.from({ length: 24 }, (_, s) => (l.seatRow(s) >= 6 ? 0 : 1));
  const seeds = seedRange(1, 10);
  assert.deepEqual(runBatch(l, z, seeds), runBatch(l, z, seeds));
  assert.equal(runBatch(l, z, [1], 0)[0], DNF_TICKS); // gap 0 never calls zone 2
});

test("patterns scale to 204 seats and 5 zones with balanced even zones", () => {
  const l = new PlaneLayout(34, [3, 3]);
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

test("mood sours slower on bigger planes and for more patient passengers", () => {
  const mood = (moodTicks, patience) => {
    const p = generateManifest(new PlaneLayout(), 1)[0];
    Object.assign(p, { moodTicks, patience, gateWait: 30, blocked: 5, seatedWait: 20 });
    return p.mood();
  };
  assert.ok(mood(300, 3) > mood(45, 3));
  assert.ok(mood(45, 5) > mood(45, 1));
  assert.ok(mood(1, 1) >= 0 && mood(1000, 5) <= 100);
});

test("a good plan leaves passengers mostly content, a sloppy one visibly less so", () => {
  const l = new PlaneLayout(32, [3, 3]);
  const avg = (z) => {
    const plan = new BoardingPlan(l, 9);
    plan.zoneOfSeat = z;
    const sim = new BoardingSim(l, plan, 1, { moodTicks: 300 });
    sim.runAuto(1);
    return sim.averageMood();
  };
  const good = avg(evenPattern(l, 90, 4)), sloppy = avg(Array(l.seatCount).fill(0));
  assert.ok(good > 60, `good=${good}`);
  assert.ok(sloppy < good, `sloppy=${sloppy} good=${good}`);
});

test("summarize reports mean and percentiles", () => {
  const s = summarize([1, 2, 3, 4]);
  assert.equal(s.mean, 2.5);
  assert.equal(s.median, 3);
});
