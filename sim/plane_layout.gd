extends RefCounted
## Seat geometry. Tier 1: 12 rows, 1 seat on each side of one aisle.

var rows: int
var seats_per_side: int

func _init(p_rows: int = 12, p_seats_per_side: int = 1) -> void:
	rows = p_rows
	seats_per_side = p_seats_per_side

func cols() -> int:
	return seats_per_side * 2

func seat_count() -> int:
	return rows * cols()

func seat_index(row: int, col: int) -> int:
	return row * cols() + col

func seat_row(seat: int) -> int:
	return seat / cols()

func seat_col(seat: int) -> int:
	return seat % cols()
