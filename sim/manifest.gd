extends RefCounted
## Builds the passenger list for one flight from a seed.

const Passenger := preload("res://sim/passenger.gd")

const FIRST_NAMES: PackedStringArray = [
	"Dave", "Priya", "Mo", "Ingrid", "Tomas", "Aiko", "Bea", "Carlos", "Dot", "Esme",
	"Farid", "Gus", "Hana", "Ivo", "June", "Kofi", "Lena", "Milo", "Nia", "Otto",
	"Pam", "Quinn", "Rosa", "Sven",
]
const LAST_NAMES: PackedStringArray = [
	"Bagley", "Okafor", "Lindqvist", "Tanaka", "Moreau", "Patel", "Kowalski", "Reyes",
	"Dubois", "Haddad", "Nakamura", "Fitch",
]

## Every seat gets exactly one passenger. Randomness only from `seed_value`.
static func generate(layout: RefCounted, seed_value: int) -> Array[Passenger]:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value
	var seats: Array[int] = []
	for s: int in layout.seat_count():
		seats.append(s)
	# Fisher-Yates with the flight rng (Array.shuffle would use the global rng).
	for i: int in range(seats.size() - 1, 0, -1):
		var j: int = rng.randi_range(0, i)
		var tmp: int = seats[i]
		seats[i] = seats[j]
		seats[j] = tmp
	var out: Array[Passenger] = []
	for i: int in seats.size():
		var p := Passenger.new()
		p.id = i
		p.seat = seats[i]
		p.row = layout.seat_row(p.seat)
		p.patience = rng.randi_range(1, 5)
		p.display_name = "%s %s" % [
			FIRST_NAMES[i % FIRST_NAMES.size()],
			LAST_NAMES[rng.randi_range(0, LAST_NAMES.size() - 1)],
		]
		out.append(p)
	return out
