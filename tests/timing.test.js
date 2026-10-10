import test from "node:test";
import assert from "node:assert/strict";
import { PlaneLayout, PLANES } from "../src/sim/layout.js";
import { BoardingPlan } from "../src/sim/plan.js";
import { BoardingSim } from "../src/sim/boarding.js";
import { State } from "../src/sim/passenger.js";
import { evenPattern } from "../src/sim/patterns.js";
import { runBatch, seedRange } from "../src/sim/stats.js";

function tier2Plan() {
  const layout = new PlaneLayout(12, [2, 2]);
  const plan = new BoardingPlan(layout, 2);
  plan.zoneOfSeat = evenPattern(layout, 90, 2);
  return {layout,plan};
}
function finish(sim) {
  while (!sim.done && sim.tick < 20000) sim.step();
  assert.ok(sim.done, "every passenger reaches their seat");
  return sim.tick;
}
function runTiming(seed, policy) {
  const {layout,plan} = tier2Plan();
  const sim = new BoardingSim(layout,plan,seed);
  if (policy === "auto") sim.runAutoCall();
  else {
    sim.releaseZone(0);
    if (policy === "early") sim.releaseZone(1);
    else {
      while (sim.tick < 120) sim.step();
      sim.releaseZone(1);
    }
    finish(sim);
  }
  return sim;
}

test("Tier 2: a later call beats tick-zero calls; waiting too long also costs time", () => {
  const early = runTiming(1,"early"), auto = runTiming(1,"auto"), late = runTiming(1,"late");
  assert.ok(auto.tick < early.tick, `auto=${auto.tick}, early=${early.tick}`);
  assert.ok(auto.tick < late.tick, `auto=${auto.tick}, late=${late.tick}`);
  assert.equal(auto.overlapCalls,0);
  assert.equal(early.overlapCalls,1);
});

test("auto-call beats careless early calls over 50 seeded Tier 2 flights", () => {
  let early = 0, auto = 0, wins = 0;
  for (const seed of seedRange(1,50)) {
    const e = runTiming(seed,"early"), a = runTiming(seed,"auto");
    early += e.tick; auto += a.tick;
    if (a.tick < e.tick) wins++;
  }
  assert.ok(auto < early, `mean auto=${auto/50}, early=${early/50}`);
  assert.ok(wins >= 40, `${wins}/50 faster flights`);
});

test("overlapping calls interleave colors while preserving each cohort's order", () => {
  const {layout,plan} = tier2Plan();
  const sim = new BoardingSim(layout,plan,1);
  sim.releaseZone(0);
  const waiting = sim.gateQueue.map(p=>p.id);
  const arrivals = sim.passengers.filter(p=>p.zone===1).map(p=>p.id);
  sim.releaseZone(1);
  assert.deepEqual(sim.gateQueue.slice(0,4).map(p=>p.zone),[0,1,0,1]);
  assert.equal(sim.gateQueue[0].id,waiting[0],"the person at the door retains their place");
  assert.deepEqual(sim.gateQueue.filter(p=>p.zone===0).map(p=>p.id),waiting);
  assert.deepEqual(sim.gateQueue.filter(p=>p.zone===1).map(p=>p.id),arrivals);
  assert.equal(sim.lineMixed,true,"the view can report a genuinely mixed line");
  sim.releaseZone(1);
  assert.equal(sim.overlapCalls,1,"a duplicate call cannot mix the line again");
  assert.equal(new Set(sim.gateQueue.map(p=>p.id)).size,layout.seatCount);
});

test("calls at the last passenger and empty or duplicate zones do not create false mixing", () => {
  const {layout,plan} = tier2Plan();
  const sim = new BoardingSim(layout,plan,1);
  sim.releaseZone(0);
  while (sim.gateQueue.length>1) sim.step();
  sim.releaseZone(1);
  assert.equal(sim.overlapCalls,0);
  assert.equal(sim.lineMixed,false);
  finish(sim);
  const sparsePlan = new BoardingPlan(layout,3);
  sparsePlan.zoneOfSeat = plan.zoneOfSeat.map(z=>z===1?2:0);
  const sparse = new BoardingSim(layout,sparsePlan,1);
  sparse.releaseZone(0);sparse.releaseZone(1);sparse.releaseZone(0);
  for (const bad of [-1,NaN,0.5,99]) sparse.releaseZone(bad);
  assert.equal(sparse.overlapCalls,0);
  sparse.releaseZone(2);finish(sparse);
});

test("same seed, plan and logical call trace reproduce the entire flight", () => {
  const {layout,plan} = tier2Plan();
  const run = () => {
    const sim = new BoardingSim(layout,plan,42);
    const snapshots=[];
    while (!sim.done && sim.tick<20000) {
      if (sim.tick===0) sim.releaseZone(0);
      if (sim.tick===10) sim.releaseZone(1);
      sim.step();
      snapshots.push(JSON.stringify({queue:sim.gateQueue.map(p=>p.id),lanes:sim.lanes,
        walkway:sim.walkway,passengers:sim.passengers,overlapCalls:sim.overlapCalls}));
    }
    assert.ok(sim.done);
    return snapshots;
  };
  assert.deepEqual(run(),run());
});

test("mixed calls retain occupancy invariants on every configured plane", () => {
  for (const config of Object.values(PLANES)) {
    const layout = new PlaneLayout(config.rows,config.blocks);
    const plan = new BoardingPlan(layout,config.maxZones);
    plan.zoneOfSeat = evenPattern(layout,45,config.maxZones);
    const sim = new BoardingSim(layout,plan,7);
    while (!sim.done && sim.tick<20000) {
      if (sim.tick===0) for(const zone of sim.defaultOrder().reverse()) sim.releaseZone(zone);
      sim.step();
      const movers=[...sim.walkway,...sim.lanes.flat()].filter(id=>id>=0);
      assert.equal(new Set(movers).size,movers.length);
      assert.equal(movers.length,sim.passengers.filter(p=>p.state===State.IN_AISLE).length);
      assert.equal(sim.seatedCount,sim.passengers.filter(p=>p.state===State.SEATED).length);
      assert.equal(sim.seatedCount,sim.seatTaken.filter(Boolean).length);
      assert.equal(new Set(sim.gateQueue.map(p=>p.id)).size,sim.gateQueue.length);
    }
    assert.ok(sim.done,config.name);
    assert.equal(sim.reseating.length,0);
  }
});

test("analysis defaults to the same queue-empty caller as the game", () => {
  const {layout,plan} = tier2Plan();
  const seeds=seedRange(1,10);
  const expected=seeds.map(seed=>new BoardingSim(layout,plan,seed).runAutoCall());
  assert.deepEqual(runBatch(layout,plan.zoneOfSeat,seeds),expected);
});

test("fixed-gap helper releases its second zone at the requested tick, not tick zero", () => {
  const {layout,plan} = tier2Plan();
  const sim = new BoardingSim(layout,plan,1);
  sim.runAuto(6,6);
  assert.deepEqual(sim.released,[true,false]);
  sim.runAuto(6,7);
  assert.deepEqual(sim.released,[true,true]);
});
