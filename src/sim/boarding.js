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
const HOLD = -2;                   // aisle cell taken by standing neighbours

export class BoardingSim {
  // moodTicks: the boarding time passengers treat as normal (affects only how fast mood sours).
  constructor(layout, plan, seed, { moodTicks = 100 } = {}) {
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
    this.released = new Array(plan.zoneCount).fill(false);
    this.tick = 0;
    this.seatedCount = 0;
  }

  get done() { return this.seatedCount === this.passengers.length; }
  get zoneCount() { return this.released.length; }
  get zonesReleased() { return this.released.filter(Boolean).length; }
  get canRelease() { return this.released.includes(false); }
  isReleased(zone) { return this.released[zone]; }

  // Call one zone to the door. Zones can be called in any order, each once.
  releaseZone(zone) {
    if (zone < 0 || zone >= this.zoneCount || this.released[zone]) return;
    for (const p of this.passengers) if (p.zone === zone) this.gateQueue.push(p);
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
      else if (p.state === State.STANDING) p.blocked++;
      else if (p.state === State.SEATED && p.seatedTick !== this.tick) p.seatedWait++;
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
        } else p.blocked++;
        continue;
      }
      if (p.phase === Phase.WAIT_FOR_SPACE) {
        if (lane[c + 1] !== -1) { p.blocked++; continue; }
        lane[c + 1] = HOLD;
        for (const id of p.neighbours) {
          const n = this.passengers[id];
          n.state = State.STANDING; n.lane = a; n.cell = c + 1;
          this.seatTaken[n.seat] = false;
          this.seatedCount--;
        }
        p.phase = Phase.NEIGHBOURS_OUT;
        p.timer = UNSEAT_TICKS * p.neighbours.length;
      } else if (p.phase === Phase.NEIGHBOURS_OUT) {
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

  stepWalkway() {
    const w = this.walkway;
    for (let c = w.length - 1; c >= 0; c--) {
      if (w[c] === -1) continue;
      const p = this.passengers[w[c]];
      if (c === w.length - 1) {
        const a = this.layout.seatAisle(p.seat);
        if (this.lanes[a][0] === -1) { this.lanes[a][0] = p.id; w[c] = -1; p.lane = a; p.cell = 0; }
        else p.blocked++;
      } else if (w[c + 1] === -1) {
        w[c + 1] = p.id; w[c] = -1; p.cell = c + 1;
      } else p.blocked++;
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

  // Headless helper: call a zone every `gap` ticks in `order`, run to completion.
  // Returns boarding time in ticks, or -1 if it did not finish.
  runAuto(gap, maxTicks = 20000, order = this.defaultOrder()) {
    this.releaseNextZone(order);
    while (!this.done && this.tick < maxTicks) {
      if (gap > 0 && this.tick % gap === 0) this.releaseNextZone(order);
      this.step();
    }
    return this.done ? this.tick : -1;
  }

  averageMood() {
    return this.passengers.reduce((a, p) => a + p.mood(), 0) / this.passengers.length;
  }
}
