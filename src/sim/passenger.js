export const State = Object.freeze({ AT_GATE: 0, IN_AISLE: 1, SEATED: 2 });

// One passenger: a small state machine plus experience counters.
export class Passenger {
  constructor({ id, name, seat, row, patience }) {
    this.id = id;
    this.name = name;
    this.seat = seat;
    this.row = row;
    this.patience = patience; // trait, 1 (snappy) .. 5 (zen)
    this.zone = 0;
    this.state = State.AT_GATE;
    this.cell = -1;           // aisle cell while IN_AISLE
    this.seatingLeft = 0;     // ticks left blocking the aisle while sitting down
    // Experience (ticks)
    this.gateWait = 0;
    this.blocked = 0;
    this.seatedWait = 0;
    this.seatedTick = -1;
  }
  // 0..100, lower is unhappier. Placeholder weights; never feeds back into the sim.
  mood() {
    const sourness = this.gateWait + 2 * this.blocked + 0.5 * this.seatedWait;
    return Math.max(0, Math.min(100, 100 - Math.trunc((sourness * 6) / this.patience)));
  }
}
