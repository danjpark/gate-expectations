// Seat geometry for any plane made of seat blocks separated by aisles.
//   [1, 1]    Tier 1: 1 seat each side of one aisle
//   [3, 3]    single-aisle (737-style)
//   [3, 4, 3] wide-body, two aisles
// Columns are numbered left to right across all blocks. Each seat uses its nearest aisle; in a middle
// block the left half uses the left aisle and the right half the right aisle (an odd centre seat goes left).
// maxZones and target (ticks) are placeholders, to tune by playtesting. Targets sit between the
// standing line (should fail) and an even window-to-aisle plan (should pass).
export const PLANES = {
  tier1: { name: "Tier 1 · 24 seats", rows: 12, blocks: [1, 1], maxZones: 2, target: 45 },
  tier2: { name: "Tier 2 · 48 seats", rows: 12, blocks: [2, 2], maxZones: 3, target: 90 },
  single: { name: "Single-aisle 737 · 192 seats", rows: 32, blocks: [3, 3], maxZones: 4, target: 300 },
  wide: { name: "Wide-body 3-4-3 · 320 seats", rows: 32, blocks: [3, 4, 3], maxZones: 5, target: 400 },
  wide9: { name: "Wide-body 3-3-3 · 288 seats", rows: 32, blocks: [3, 3, 3], maxZones: 5, target: 380 },
};

export class PlaneLayout {
  // `blocks` may also be a number n, meaning [n, n].
  constructor(rows = 12, blocks = [1, 1]) {
    this.rows = rows;
    this.blocks = typeof blocks === "number" ? [blocks, blocks] : blocks.slice();
    this.cols = this.blocks.reduce((a, b) => a + b, 0);
    this.aisleCount = this.blocks.length - 1;
    // Per column: block, aisle used, distance from that aisle (0 = aisle seat), and the columns between it and the aisle.
    this.colInfo = [];
    let start = 0;
    this.blocks.forEach((size, b) => {
      for (let i = 0; i < size; i++) {
        let aisle, distance, between = [];
        const useLeft = b === this.blocks.length - 1 || (b > 0 && i < Math.ceil(size / 2));
        if (useLeft) { aisle = b - 1; distance = i; for (let j = 0; j < i; j++) between.push(start + j); }
        else { aisle = b; distance = size - 1 - i; for (let j = i + 1; j < size; j++) between.push(start + j); }
        this.colInfo.push({ block: b, aisle, distance, between });
      }
      start += size;
    });
    this.maxDistance = Math.max(...this.colInfo.map((c) => c.distance));
  }
  get seatCount() { return this.rows * this.cols; }
  get label() { return this.blocks.join("-"); }
  seatIndex(row, col) { return row * this.cols + col; }
  seatRow(seat) { return Math.floor(seat / this.cols); }
  seatCol(seat) { return seat % this.cols; }
  seatAisle(seat) { return this.colInfo[this.seatCol(seat)].aisle; }
  // 0 = aisle seat; window seats have the largest distance.
  seatAisleDistance(seat) { return this.colInfo[this.seatCol(seat)].distance; }
  // Seats someone must get past (in the same row) to reach this seat from its aisle.
  seatsBetweenAisle(seat) {
    const row = this.seatRow(seat);
    return this.colInfo[this.seatCol(seat)].between.map((c) => this.seatIndex(row, c));
  }
}
