import test from "node:test";
import assert from "node:assert/strict";
import { PLANES, PlaneLayout } from "../src/sim/layout.js";
import { BoardingPlan } from "../src/sim/plan.js";
import { BoardingSim, SHUFFLE_HESITATION_TICKS } from "../src/sim/boarding.js";
import { State } from "../src/sim/passenger.js";

function flight({ seed = 1, autoAssist = false, blocks = [2, 2], rows = 12 } = {}) {
  const layout = new PlaneLayout(rows, blocks);
  return new BoardingSim(layout, new BoardingPlan(layout), seed, { moodTicks: 100000, autoAssist });
}
function reachEvent(sim) {
  while (!sim.shuffleAssist && !sim.done && sim.tick < 5000) { sim.autoCall(); sim.step(); }
  return sim.shuffleAssist;
}

test("an assist comes from a real shuffle; ignoring it resolves and cannot retrigger", () => {
  const sim = flight();
  const event = reachEvent(sim);
  assert.equal(event.outcome, "pending");
  const p = sim.passengers[event.passengerId];
  assert.ok(p.neighbours.length > 0);
  assert.ok(p.neighbours.every(id => sim.passengers[id].state === State.STANDING));
  const timer = p.timer;
  for (let i = 0; i < SHUFFLE_HESITATION_TICKS; i++) sim.step();
  assert.equal(event.outcome, "ignored");
  assert.equal(p.timer, timer, "only hesitation elapsed; physical shuffle still remains");
  assert.equal(event.remaining, 0);
  const id = event.passengerId;
  sim.runAutoCall();
  assert.ok(sim.done);
  assert.equal(sim.shuffleAssist.passengerId, id);
  assert.equal(sim.shuffleAssist.tick, event.tick);
});

test("manual help and delegation improve the same seeded flight without skipping the shuffle", () => {
  const ignored = flight(); ignored.runAutoCall();
  const manual = flight(); const event = reachEvent(manual);
  assert.equal(manual.assistShuffle(event.passengerId + 1), false);
  const p = manual.passengers[event.passengerId], timer = p.timer;
  assert.equal(manual.assistShuffle(event.passengerId), true);
  assert.equal(p.timer, timer);
  assert.equal(p.state, State.IN_AISLE);
  assert.equal(manual.assistShuffle(event.passengerId), false);
  manual.runAutoCall();
  const delegated = flight({ autoAssist: true }); delegated.runAutoCall();
  assert.equal(manual.shuffleAssist.outcome, "manual");
  assert.equal(delegated.shuffleAssist.outcome, "staff");
  assert.equal(manual.shuffleAssist.savedTicks, SHUFFLE_HESITATION_TICKS);
  assert.ok(manual.tick < ignored.tick, `${manual.tick} vs ${ignored.tick}`);
  assert.equal(manual.tick, delegated.tick);
  assert.deepEqual(manual.passengers, delegated.passengers);
  assert.equal(ignored.assistShuffle(ignored.shuffleAssist.passengerId), false);
});

test("a late assist saves only unelapsed hesitation; no event on a plane without seat interference", () => {
  const sim = flight(); const event = reachEvent(sim);
  sim.step(); sim.step(); sim.step();
  assert.equal(sim.assistShuffle(event.passengerId), true);
  assert.equal(event.savedTicks, SHUFFLE_HESITATION_TICKS - 3);
  const tier1 = flight({ blocks: [1, 1] }); tier1.runAutoCall();
  assert.equal(tier1.shuffleAssist, null);
  assert.equal(tier1.assistShuffle(0), false);
});

test("logical assist traces are deterministic and boarding retains every seat across plane layouts", () => {
  for (const data of Object.values(PLANES)) {
    for (const autoAssist of [false, true]) {
      const run = () => {
        const sim = flight({ rows: data.rows, blocks: data.blocks, autoAssist });
        let helpAt = null;
        while (!sim.done && sim.tick < 5000) {
          sim.autoCall();
          if (!autoAssist && sim.shuffleAssist?.outcome === "pending") {
            helpAt ??= sim.tick + 2;
            if (sim.tick === helpAt) sim.assistShuffle(sim.shuffleAssist.passengerId);
          }
          sim.step();
        }
        assert.ok(sim.done);
        assert.ok(sim.seatTaken.every(Boolean));
        assert.equal(sim.seatedCount, sim.layout.seatCount);
        assert.ok(sim.walkway.every(id => id === -1));
        assert.ok(sim.lanes.every(lane => lane.every(id => id === -1)));
        return JSON.stringify(sim);
      };
      assert.equal(run(), run(), `${data.name}, autoAssist=${autoAssist}`);
    }
  }
});

test("headless defaults use the same mood budget and result as configured playable planes", () => {
  for (const data of Object.values(PLANES)) {
    const layout = new PlaneLayout(data.rows, data.blocks), plan = new BoardingPlan(layout);
    const headless = new BoardingSim(layout, plan, 1);
    const game = new BoardingSim(layout, plan, 1, { moodTicks: data.target });
    assert.equal(headless.passengers[0].moodTicks, data.target);
    headless.runAutoCall(); game.runAutoCall();
    assert.deepEqual(headless, game);
  }
});

test("a meltdown freezes a pending hesitation and help resumes afterwards", () => {
  const sim = flight(); const event = reachEvent(sim);
  // Force a real threshold crossing while the hesitation is pending.
  const waiting = sim.passengers.find(p => p.state === State.AT_GATE);
  assert.ok(waiting);
  waiting.moodTicks = 1;
  sim.step();
  assert.ok(sim.meltdownRemaining > 0);
  const remaining = event.remaining;
  assert.equal(sim.assistShuffle(event.passengerId), false);
  while (sim.meltdownRemaining > 0) sim.step();
  assert.equal(event.remaining, remaining);
  assert.equal(sim.assistShuffle(event.passengerId), true);
  sim.runAutoCall();
  assert.ok(sim.done);
});
