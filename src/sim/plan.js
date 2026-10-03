// The player's plan: a zone number per seat. Zones board in index order.
export const MAX_ZONES_TIER1 = 2;

export class BoardingPlan {
  constructor(layout, maxZones = MAX_ZONES_TIER1) {
    this.layout = layout;
    this.maxZones = maxZones;
    this.zoneOfSeat = new Array(layout.seatCount).fill(0); // all zone 0 = the standing line
  }
  paint(seat, zone) {
    this.zoneOfSeat[seat] = Math.max(0, Math.min(this.maxZones - 1, zone));
  }
  // Highest painted zone + 1.
  get zoneCount() { return Math.max(...this.zoneOfSeat) + 1; }

  backHalfFirst() {
    for (let s = 0; s < this.layout.seatCount; s++) {
      this.paint(s, this.layout.seatRow(s) >= this.layout.rows / 2 ? 0 : 1);
    }
  }
  frontHalfFirst() {
    for (let s = 0; s < this.layout.seatCount; s++) {
      this.paint(s, this.layout.seatRow(s) < this.layout.rows / 2 ? 0 : 1);
    }
  }
}
