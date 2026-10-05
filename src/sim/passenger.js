// STANDING: a seated passenger who got up into the aisle to let someone reach an inner seat.
export const State = Object.freeze({ AT_GATE: 0, IN_AISLE: 1, SEATED: 2, STANDING: 3 });

// What a passenger in the aisle is doing once they reach their row.
export const Phase = Object.freeze({ WALK: 0, WAIT_FOR_SPACE: 1, NEIGHBOURS_OUT: 2, SIT: 3 });

// One passenger: a small state machine plus experience counters.
export class Passenger {
  constructor({ id, name, seat, row, patience }) {
    this.id = id;
    this.name = name;
    this.seat = seat;
    this.row = row;
    this.patience = patience; // trait, 1 (snappy) .. 5 (zen)
    this.zone = 0;
    this.moodTicks = 100;     // set by the sim; see mood()
    this.state = State.AT_GATE;
    this.lane = -1;           // -1 = jet bridge, otherwise the aisle index
    this.cell = -1;           // cell within the jet bridge or aisle
    this.targetCell = 0;      // aisle cell next to the assigned row
    this.phase = Phase.WALK;
    this.timer = 0;           // ticks left in the current phase
    this.neighbours = [];     // passengers who must stand up to let this one in
    // Experience (ticks)
    this.gateWait = 0;
    this.blocked = 0;
    this.seatedWait = 0;
    this.seatedTick = -1;
  }
  // 0..100, lower is unhappier. Placeholder weights; never feeds back into the sim.
  // Scales with the plane (`moodTicks`, roughly a good boarding time) so a 300-tick flight isn't
  // sourer than a 40-tick one; patience 1..5 gives 1.5x..3.5x that much tolerance.
  mood() {
    const sourness = this.gateWait + 2 * this.blocked + 0.5 * this.seatedWait;
    const tolerance = this.moodTicks * (1 + 0.5 * this.patience);
    return Math.max(0, Math.min(100, Math.round(100 - (100 * sourness) / tolerance)));
  }
}
