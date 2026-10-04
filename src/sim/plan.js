// The player's editable plan: a zone number per seat. Call order is a separate command.
export const MAX_ZONES_TIER1 = 2;

// Validate at the simulation boundary, including maps supplied by the analysis tool.
export function validateZoneMap(layout, zones, maxZones) {
  if (!Array.isArray(zones) || zones.length !== layout.seatCount ||
      Array.from(zones).some((z) => !Number.isSafeInteger(z) || z < 0 || z >= maxZones)) {
    throw new RangeError("zone map must assign every seat an integer zone within the limit");
  }
  return Math.max(...zones) + 1;
}

export class BoardingPlan {
  constructor(layout, maxZones = MAX_ZONES_TIER1) {
    if (!Number.isSafeInteger(maxZones) || maxZones < 1) throw new RangeError("maxZones must be a positive integer");
    this.layout = layout;
    this.maxZones = maxZones;
    this.zoneOfSeat = new Array(layout.seatCount).fill(0); // all zone 0 = the standing line
  }
  paint(seat, zone) {
    if (!Number.isSafeInteger(seat) || seat < 0 || seat >= this.layout.seatCount || !Number.isSafeInteger(zone)) {
      throw new RangeError("paint requires a valid seat and integer zone");
    }
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
