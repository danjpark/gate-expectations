import { defaultMoodTicks } from "./layout.js";
import { generateManifest } from "./manifest.js";
import { State, Phase } from "./passenger.js";

// Deterministic boarding sim. Fixed ticks, integer cells, no DOM, no Date, no Math.random.
//
// Geometry: gate queue -> jet bridge (WALKWAY_CELLS cells) -> one aisle per gap between seat blocks.
// Each aisle has cell 0 at the door (the front cross-aisle), row r at cell r + 1, and a rear galley cell.
// A passenger takes the aisle nearest their seat.
//
// Seat shuffle: reaching your row with seated neighbours between you and your seat, you wait until the
// aisle cell just past your row is free; the neighbours stand up into it (both cells now blocked),
// you sit, then they step back into your row's cell and sit down again (that cell stays blocked).
export const WALKWAY_CELLS = 4;    // placeholder: jet bridge length
export const SEAT_TICKS = 2;       // placeholder: ticks to sit down
export const UNSEAT_TICKS = 2;     // placeholder: ticks per neighbour to stand up and step out
export const RESEAT_TICKS = 2;     // placeholder: ticks per neighbour to sit back down
export const SHUFFLE_HESITATION_TICKS = 8; // placeholder: one optional assist per flight
export const MELTDOWN_THRESHOLD = 20; // placeholders: one disruption per flight
export const MELTDOWN_TICKS = 4;
const HOLD = -2;                   // aisle cell taken by standing neighbours

export class BoardingSim {
  // moodTicks: expected boarding time, scaling patience and review thresholds.
  constructor(layout, plan, seed, { moodTicks = defaultMoodTicks(layout), autoAssist = false } = {}) {
    this.autoAssist = autoAssist;
    this.shuffleAssist = null;
    this.seed = seed;
    this.worstJam = null;
    this.meltdown = null;
    this.meltdownRemaining = 0;
    this.layout = layout;
    this.plan = plan;
    this.passengers = generateManifest(layout, seed);
    this.bySeat = [];
    for (const p of this.passengers) {
      p.zone = plan.zoneOfSeat[p.seat];
      p.moodTicks = moodTicks;
      p.targetCell = p.row + 1;
      this.bySeat[p.seat] = p;
    }
    this.walkway = new Array(WALKWAY_CELLS).fill(-1);
    this.lanes = Array.from({ length: layout.aisleCount }, () => new Array(layout.rows + 2).fill(-1));
    this.seatTaken = new Array(layout.seatCount).fill(false);
    this.reseating = [];             // { lane, cell, ids, timer }
    this.gateQueue = [];
    this.overlapCalls = 0; // calls that allowed newcomers to pass waiting passengers
    this.released = new Array(plan.zoneCount).fill(false);
    this.tick = 0;
    this.seatedCount = 0;
  }

  get done() { return this.seatedCount === this.passengers.length; }
  get zoneCount() { return this.released.length; }
  get zonesReleased() { return this.released.filter(Boolean).length; }
  get canRelease() { return this.released.includes(false); }
  get lineMixed() {
    const seen = new Set();
    let previous = -1;
    for (const p of this.gateQueue) {
      if (p.zone !== previous && seen.has(p.zone)) return true;
      seen.add(p.zone);
      previous = p.zone;
    }
    return false;
  }
  isReleased(zone) { return this.released[zone]; }

  // Calling into an occupied lounge line mixes the new zone into the old one.
  // Placeholder rule: preserve each group's internal order, alternating old/new passengers.
  // The person already at the front keeps their place; later arrivals can slip past the rest.
  // No random draws: the same call trace produces the same queue and boarding result.
  // A call after the lounge line clears preserves the planned zone order.
  // Call one zone to the door. Zones can be called in any order, each once.
  releaseZone(zone) {
    if (!Number.isInteger(zone) || zone < 0 || zone >= this.zoneCount || this.released[zone]) return;
    const arrivals = this.passengers.filter((p) => p.zone === zone);
    if (arrivals.length && this.gateQueue.length > 1) {
      const waiting = this.gateQueue;
      const mixed = [];
      for (let i = 0; i < Math.max(waiting.length, arrivals.length); i++) {
        if (i < waiting.length) mixed.push(waiting[i]);
        if (i < arrivals.length) mixed.push(arrivals[i]);
      }
      this.gateQueue = mixed;
      this.overlapCalls++;
    } else this.gateQueue.push(...arrivals);
    this.released[zone] = true;
  }
  // Call the first not-yet-called zone in `order` (defaults to 1, 2, 3...).
  releaseNextZone(order = this.defaultOrder()) {
    const next = order.find((z) => !this.released[z]);
    if (next !== undefined) this.releaseZone(next);
  }
  defaultOrder() { return Array.from({ length: this.zoneCount }, (_, i) => i); }

  // Automatic calling: the next zone is called as soon as the lounge line is empty.
  autoCall(order = this.defaultOrder()) {
    if (this.gateQueue.length === 0) this.releaseNextZone(order);
  }

  step() {
    if (this.done) return;
    this.tick++;
    // This bounded pause costs time without creating more sourness or another breakdown.
    if (this.meltdownRemaining > 0) { this.meltdownRemaining--; return; }
    this.stepReseating();
    for (let a = 0; a < this.lanes.length; a++) this.stepLane(a);
    this.stepWalkway();
    if (this.gateQueue.length > 0 && this.walkway[0] === -1) {
      const p = this.gateQueue.shift();
      p.state = State.IN_AISLE;
      p.lane = -1;
      p.cell = 0;
      this.walkway[0] = p.id;
    }
    for (const p of this.passengers) {
      if (p.state === State.AT_GATE) p.gateWait++;
      else if (p.state === State.STANDING) this.block(p);
      else if (p.state === State.SEATED && p.seatedTick !== this.tick) p.seatedWait++;
    }
    if (!this.done && !this.meltdown) {
      const p = this.passengers.find((p) => p.state !== State.SEATED && p.mood() < MELTDOWN_THRESHOLD);
      if (p) {
        this.meltdown = { passengerId: p.id, tick: this.tick, penalty: MELTDOWN_TICKS };
        this.meltdownRemaining = MELTDOWN_TICKS;
      }
    }
  }

  // Longest uninterrupted wait at one location, measured from actual blocked ticks.
  block(p) {
    p.blocked++;
    const location = { kind: p.state === State.STANDING ? "seat shuffle" : p.lane < 0 ? "jet bridge" : "aisle", lane: p.lane, cell: p.cell };
    const same = p.jam && p.jam.lastTick === this.tick - 1 &&
      p.jam.kind === location.kind && p.jam.lane === location.lane && p.jam.cell === location.cell;
    p.jam = { ...location, ticks: same ? p.jam.ticks + 1 : 1, lastTick: this.tick };
    if (!this.worstJam || p.jam.ticks > this.worstJam.ticks) {
      this.worstJam = { passengerId: p.id, ...location, ticks: p.jam.ticks };
    }
  }

  stepReseating() {
    this.reseating = this.reseating.filter((r) => {
      if (--r.timer > 0) return true;
      this.lanes[r.lane][r.cell] = -1;
      for (const id of r.ids) this.seat(this.passengers[id]);
      return false;
    });
  }

  // Rear of the aisle first, so followers see cells freed this tick.
  stepLane(a) {
    const lane = this.lanes[a];
    for (let c = lane.length - 1; c >= 0; c--) {
      if (lane[c] < 0) continue;
      const p = this.passengers[lane[c]];
      if (c !== p.targetCell) {
        if (lane[c + 1] === -1) {
          lane[c + 1] = p.id; lane[c] = -1; p.cell = c + 1;
          if (p.cell === p.targetCell) this.arrive(p);
        } else this.block(p);
        continue;
      }
      if (p.phase === Phase.WAIT_FOR_SPACE) {
        if (lane[c + 1] !== -1) { this.block(p); continue; }
        lane[c + 1] = HOLD;
        for (const id of p.neighbours) {
          const n = this.passengers[id];
          n.state = State.STANDING; n.lane = a; n.cell = c + 1;
          this.seatTaken[n.seat] = false;
          this.seatedCount--;
        }
        p.phase = Phase.NEIGHBOURS_OUT;
        p.timer = UNSEAT_TICKS * p.neighbours.length;
        // A real shuffle triggers one hesitant passenger, never a random popup.
        if (!this.shuffleAssist) {
          this.shuffleAssist = { passengerId: p.id, lane: a, row: p.row, tick: this.tick,
            remaining: SHUFFLE_HESITATION_TICKS, outcome: "pending", savedTicks: 0 };
          if (this.autoAssist) this.assistShuffle(p.id);
        }
      } else if (p.phase === Phase.NEIGHBOURS_OUT) {
        const assist = this.shuffleAssist;
        if (assist?.passengerId === p.id && assist.outcome === "pending") {
          this.block(p);
          if (--assist.remaining === 0) assist.outcome = "ignored";
          continue;
        }
        if (--p.timer === 0) { p.phase = Phase.SIT; p.timer = SEAT_TICKS; }
      } else if (p.phase === Phase.SIT && --p.timer === 0) {
        lane[c] = -1;
        this.seat(p);
        if (p.neighbours.length) {
          lane[c + 1] = -1;
          lane[c] = HOLD;
          for (const id of p.neighbours) this.passengers[id].cell = c;
          this.reseating.push({ lane: a, cell: c, ids: p.neighbours, timer: RESEAT_TICKS * p.neighbours.length });
        }
      }
    }
  }

  // Logical player command; only removes the remaining hesitation, not the physical shuffle.
  // Duplicate, stale, wrong-passenger and during-meltdown commands are harmless.
  assistShuffle(passengerId) {
    const event = this.shuffleAssist;
    if (!event || event.outcome !== "pending" || event.passengerId !== passengerId || this.meltdownRemaining > 0) return false;
    event.savedTicks = event.remaining;
    event.remaining = 0;
    event.outcome = this.autoAssist ? "staff" : "manual";
    return true;
  }

  stepWalkway() {
    const w = this.walkway;
    for (let c = w.length - 1; c >= 0; c--) {
      if (w[c] === -1) continue;
      const p = this.passengers[w[c]];
      if (c === w.length - 1) {
        const a = this.layout.seatAisle(p.seat);
        if (this.lanes[a][0] === -1) { this.lanes[a][0] = p.id; w[c] = -1; p.lane = a; p.cell = 0; }
        else this.block(p);
      } else if (w[c + 1] === -1) {
        w[c + 1] = p.id; w[c] = -1; p.cell = c + 1;
      } else this.block(p);
    }
  }

  arrive(p) {
    p.neighbours = this.layout.seatsBetweenAisle(p.seat).filter((s) => this.seatTaken[s]).map((s) => this.bySeat[s].id);
    if (p.neighbours.length) p.phase = Phase.WAIT_FOR_SPACE;
    else { p.phase = Phase.SIT; p.timer = SEAT_TICKS; }
  }

  seat(p) {
    p.state = State.SEATED;
    p.lane = -1;
    p.cell = -1;
    p.seatedTick = this.tick;
    this.seatTaken[p.seat] = true;
    this.seatedCount++;
  }

  // Headless equivalent of the game's upgrade: check the lounge line before each step.
  runAutoCall(maxTicks = 20000, order = this.defaultOrder()) {
    while (!this.done && this.tick < maxTicks) {
      this.autoCall(order);
      this.step();
    }
    return this.done ? this.tick : -1;
  }

  // Headless helper: call a zone every `gap` ticks in `order`, run to completion.
  // Returns boarding time in ticks, or -1 if it did not finish.
  runAuto(gap, maxTicks = 20000, order = this.defaultOrder()) {
    this.releaseNextZone(order);
    while (!this.done && this.tick < maxTicks) {
      if (gap > 0 && this.tick > 0 && this.tick % gap === 0) this.releaseNextZone(order);
      this.step();
    }
    return this.done ? this.tick : -1;
  }

  averageMood() {
    return this.passengers.reduce((a, p) => a + p.mood(), 0) / this.passengers.length;
  }
}
