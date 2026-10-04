import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PlaneLayout, PLANES } from "../src/sim/layout.js";
import { BoardingPlan } from "../src/sim/plan.js";
import { BoardingSim } from "../src/sim/boarding.js";
import { State } from "../src/sim/passenger.js";
import { runBatch, summarize, seedRange } from "../src/sim/stats.js";
import { evenPattern } from "../src/sim/patterns.js";
import { normalizeSave, flightReward } from "../src/game/progress.js";
import { WorkerClient } from "../src/analysis/worker-client.js";

function assertOccupancy(sim) {
  const movers = [...sim.walkway, ...sim.lanes.flat()].filter((id) => id >= 0);
  assert.equal(new Set(movers).size, movers.length, "one cell per walking passenger");
  assert.equal(sim.seatedCount, sim.passengers.filter((p) => p.state === State.SEATED).length);
  assert.equal(sim.seatedCount, sim.seatTaken.filter(Boolean).length);
  assert.equal(sim.passengers.filter((p) => p.state === State.IN_AISLE).length, movers.length);
  const queued = new Set(sim.gateQueue.map((p) => p.id));
  assert.equal(queued.size, sim.gateQueue.length);
  for (const p of sim.passengers) {
    assert.equal(sim.seatTaken[p.seat], p.state === State.SEATED);
    if (p.state === State.IN_AISLE) {
      assert.equal(p.lane === -1 ? sim.walkway[p.cell] : sim.lanes[p.lane][p.cell], p.id);
    }
    if (queued.has(p.id)) assert.equal(p.state, State.AT_GATE);
  }
}

test("occupancy and seat counts stay consistent across every plane and tick", () => {
  for (const p of Object.values(PLANES)) {
    const layout = new PlaneLayout(p.rows, p.blocks);
    for (const angle of [0, 90]) {
      for (const seed of [1, 42, 991]) {
        const plan = new BoardingPlan(layout, p.maxZones);
        plan.zoneOfSeat = evenPattern(layout, angle, p.maxZones);
        const sim = new BoardingSim(layout, plan, seed);
        while (!sim.done && sim.tick < 3000) {
          sim.autoCall(); sim.step(); assertOccupancy(sim);
        }
        assert.ok(sim.done);
        assert.equal(sim.reseating.length, 0);
      }
    }
  }
});

test("invalid layout, painting, and zone maps fail at their boundaries", () => {
  for (const [rows, blocks] of [[0, [1, 1]], [1.5, [1, 1]], [2, [3]], [2, [0, 2]], [2, [1.5, 1]]]) {
    assert.throws(() => new PlaneLayout(rows, blocks), RangeError);
  }
  const layout = new PlaneLayout();
  const plan = new BoardingPlan(layout);
  for (const [seat, zone] of [[-1, 0], [24, 0], [0, NaN], [0, 0.5]]) assert.throws(() => plan.paint(seat, zone), RangeError);
  for (const bad of [Array(23).fill(0), Array(24), Array(24).fill(NaN), Array(24).fill(2)]) {
    plan.zoneOfSeat = bad;
    assert.throws(() => new BoardingSim(layout, plan, 1), RangeError);
  }
  assert.throws(() => runBatch(layout, Array(24).fill(0), []), RangeError);
  assert.throws(() => summarize([]), RangeError);
});

test("a flight owns its plan snapshot; bad calls cannot enqueue or mark zones", () => {
  const layout = new PlaneLayout();
  const plan = new BoardingPlan(layout); plan.backHalfFirst();
  const sim = new BoardingSim(layout, plan, 1);
  const before = sim.passengers.map((p) => p.zone);
  plan.zoneOfSeat.fill(0);
  assert.deepEqual(sim.passengers.map((p) => p.zone), before);
  assert.equal(sim.plan.zoneCount, 2);
  for (const z of [undefined, NaN, -1, 2, 0.5, "0"]) assert.equal(sim.releaseZone(z), false);
  assert.deepEqual(sim.released, [false, false]);
  assert.equal(sim.gateQueue.length, 0);
  sim.releaseNextZone([-1, 99, 1]);
  assert.deepEqual(sim.released, [false, true]);
});

test("analysis and the game follow the same calling policy and order", () => {
  const layout = new PlaneLayout(8, [2, 2]);
  const plan = new BoardingPlan(layout, 3);
  plan.zoneOfSeat = evenPattern(layout, 45, 3);
  const seeds = seedRange(1, 12), order = [2, 0, 1];
  const expected = seeds.map((seed) => {
    const sim = new BoardingSim(layout, plan, seed);
    while (!sim.done && sim.tick < 20000) { sim.autoCall(order); sim.step(); }
    return sim.tick;
  });
  assert.deepEqual(runBatch(layout, plan.zoneOfSeat, seeds, undefined, order), expected);
});

test("fixed-gap helper does not call a second zone at tick zero", () => {
  const layout = new PlaneLayout();
  const plan = new BoardingPlan(layout); plan.backHalfFirst();
  const sim = new BoardingSim(layout, plan, 1);
  sim.runAuto(6, 1);
  assert.deepEqual(sim.released, [true, false]);
});

test("malformed saves normalize to finite currency and owned upgrades", () => {
  for (const money of ["100", -5, null, 2.5, NaN, Infinity]) assert.equal(normalizeSave({money}).money, 0);
  assert.equal(normalizeSave({money: 30, autoCall: true, autoOn: true}).money, 30);
  assert.equal(normalizeSave({autoCall: false, autoOn: true}).autoOn, false);
  assert.equal(normalizeSave(null).money, 0);
  assert.equal(flightReward(45, 45), 20);
  assert.equal(flightReward(46, 45), 10);
});

test("cancelling worker work settles callers and creates a fresh worker", async () => {
  const workers = [];
  const client = new WorkerClient(() => {
    const worker = { terminated: false, postMessage(msg) { this.message = msg; }, terminate() { this.terminated = true; } };
    workers.push(worker); return worker;
  });
  const old = client.request("search", {});
  const cancelled = assert.rejects(old, {name: "AbortError"});
  client.stop(); await cancelled;
  assert.equal(workers[0].terminated, true);
  const next = client.request("evaluate", {});
  const id = workers[1].message.id;
  workers[1].onmessage({data: {id, result: [42]}});
  assert.deepEqual(await next, [42]);
  const bad = client.request("bad", {});
  workers[1].onmessage({data: {id: workers[1].message.id, error: "bad input"}});
  await assert.rejects(bad, /bad input/);
  const crash = client.request("search", {});
  workers[1].onerror({message: "worker crashed"});
  await assert.rejects(crash, /worker crashed/);
  assert.equal(client.pending.size, 0);
});

// Language-neutral fixtures: the future Godot implementation should read the same JSON.
const fixtures = JSON.parse(readFileSync(new URL("./fixtures/port-v1.json", import.meta.url)));
for (const fixture of fixtures.cases) {
  test(`Godot port fixture: ${fixture.name}`, () => {
    const { rows, blocks, zones, seed, order } = fixture.input;
    const layout = new PlaneLayout(rows, blocks), plan = new BoardingPlan(layout, Math.max(...zones) + 1);
    plan.zoneOfSeat = zones;
    const sim = new BoardingSim(layout, plan, seed);
    assert.deepEqual(sim.passengers.map((p) => [p.seat, p.patience, p.name]), fixture.manifest);
    for (const checkpoint of fixture.checkpoints) {
      while (sim.tick < checkpoint.tick) { sim.autoCall(order); sim.step(); }
      assert.deepEqual({tick: sim.tick, walkway: sim.walkway, lanes: sim.lanes, released: sim.released,
        seatedCount: sim.seatedCount, passengers: sim.passengers.map((p) => [p.state, p.lane, p.cell, p.phase, p.timer, p.gateWait, p.blocked, p.seatedWait])}, checkpoint);
    }
    sim.runAutoCall(20000, order);
    assert.equal(sim.tick, fixture.finalTicks);
    assert.equal(sim.averageMood(), fixture.finalMood);
  });
}
