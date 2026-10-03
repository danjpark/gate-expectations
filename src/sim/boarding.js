import { generateManifest } from "./manifest.js";
import { State } from "./passenger.js";

// Deterministic boarding sim. Fixed ticks, integer cells, no DOM, no Date, no Math.random.
// Aisle cell 0 is the door; row r is reached at cell r + 1.
export const SEAT_TICKS = 2; // placeholder: ticks spent in the aisle sitting down

export class BoardingSim {
  constructor(layout, plan, seed) {
    this.layout = layout;
    this.plan = plan;
    this.passengers = generateManifest(layout, seed);
    for (const p of this.passengers) p.zone = plan.zoneOfSeat[p.seat];
    this.aisle = new Array(layout.rows + 1).fill(-1); // passenger id or -1
    this.gateQueue = [];
    this.tick = 0;
    this.zonesReleased = 0;
    this.seatedCount = 0;
  }

  get done() { return this.seatedCount === this.passengers.length; }
  get canRelease() { return this.zonesReleased < this.plan.zoneCount; }

  // Manual trigger: call the next zone to the door.
  releaseNextZone() {
    if (!this.canRelease) return;
    for (const p of this.passengers) if (p.zone === this.zonesReleased) this.gateQueue.push(p);
    this.zonesReleased++;
  }

  step() {
    if (this.done) return;
    this.tick++;
    // Front of the plane first, so followers see freed cells this tick.
    for (let c = this.aisle.length - 1; c >= 0; c--) {
      if (this.aisle[c] === -1) continue;
      const p = this.passengers[this.aisle[c]];
      if (c === p.row + 1) {
        if (p.seatingLeft > 0 && --p.seatingLeft === 0) {
          this.aisle[c] = -1;
          p.state = State.SEATED;
          p.cell = -1;
          p.seatedTick = this.tick;
          this.seatedCount++;
        }
        continue;
      }
      if (this.aisle[c + 1] === -1) {
        this.aisle[c + 1] = p.id;
        this.aisle[c] = -1;
        p.cell = c + 1;
        if (p.cell === p.row + 1) p.seatingLeft = SEAT_TICKS;
      } else {
        p.blocked++;
      }
    }
    // Door
    if (this.gateQueue.length > 0 && this.aisle[0] === -1) {
      const next = this.gateQueue.shift();
      next.state = State.IN_AISLE;
      next.cell = 0;
      this.aisle[0] = next.id;
    }
    // Experience counters
    for (const p of this.passengers) {
      if (p.state === State.AT_GATE) p.gateWait++;
      else if (p.state === State.SEATED && p.seatedTick !== this.tick) p.seatedWait++;
    }
  }

  // Headless helper: release a zone every `gap` ticks, run to completion.
  // Returns boarding time in ticks, or -1 if it did not finish.
  runAuto(gap, maxTicks = 1000) {
    this.releaseNextZone();
    while (!this.done && this.tick < maxTicks) {
      if (gap > 0 && this.tick % gap === 0) this.releaseNextZone();
      this.step();
    }
    return this.done ? this.tick : -1;
  }

  averageMood() {
    return this.passengers.reduce((a, p) => a + p.mood(), 0) / this.passengers.length;
  }
}
