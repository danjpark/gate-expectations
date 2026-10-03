// Seat geometry. Tier 1: 12 rows, 1 seat on each side of one aisle.
export class PlaneLayout {
  constructor(rows = 12, seatsPerSide = 1) {
    this.rows = rows;
    this.seatsPerSide = seatsPerSide;
  }
  get cols() { return this.seatsPerSide * 2; }
  get seatCount() { return this.rows * this.cols; }
  seatRow(seat) { return Math.floor(seat / this.cols); }
  seatCol(seat) { return seat % this.cols; }
}
