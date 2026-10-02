extends RefCounted
## The player's plan: a zone number per seat. Zones board in index order.

const MAX_ZONES_TIER1: int = 2

var layout: RefCounted
var max_zones: int = MAX_ZONES_TIER1
var zone_of_seat: PackedInt32Array = PackedInt32Array()

func _init(p_layout: RefCounted, p_max_zones: int = MAX_ZONES_TIER1) -> void:
	layout = p_layout
	max_zones = p_max_zones
	zone_of_seat.resize(layout.seat_count())  # everyone in zone 0 = the standing line

func paint(seat: int, zone: int) -> void:
	zone_of_seat[seat] = clampi(zone, 0, max_zones - 1)

## Highest painted zone + 1.
func zone_count() -> int:
	var top: int = 0
	for z: int in zone_of_seat:
		top = maxi(top, z)
	return top + 1

## Presets used by tests and as starting points.
func back_half_first() -> void:
	for s: int in layout.seat_count():
		paint(s, 0 if layout.seat_row(s) >= layout.rows / 2 else 1)

func front_half_first() -> void:
	for s: int in layout.seat_count():
		paint(s, 0 if layout.seat_row(s) < layout.rows / 2 else 1)
