// Seat geometry for a single-aisle plane. Tier 1: 12 rows, 1 seat on each side.
// Columns run left window -> left aisle seat | aisle | right aisle seat -> right window.
export class PlaneLayout {
  constructor(rows = 12, seatsPerSide = 1) {
    this.rows = rows;
    this.seatsPerSide = seatsPerSide;
  }
  get cols() { return this.seatsPerSide * 2; }
  get seatCount() { return this.rows * this.cols; }
  seatIndex(row, col) { return row * this.cols + col; }
  seatRow(seat) { return Math.floor(seat / this.cols); }
  seatCol(seat) { return seat % this.cols; }
  // 0 = left, 1 = right.
  seatSide(seat) { return this.seatCol(seat) < this.seatsPerSide ? 0 : 1; }
  // 0 = window ... seatsPerSide - 1 = aisle seat.
  seatDepth(seat) {
    const c = this.seatCol(seat);
    return c < this.seatsPerSide ? c : this.cols - 1 - c;
  }
  seatAt(row, side, depth) {
    return this.seatIndex(row, side === 0 ? depth : this.cols - 1 - depth);
  }
}
