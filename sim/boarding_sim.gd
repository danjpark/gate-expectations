extends RefCounted
## Deterministic boarding sim. Fixed ticks, integer cells, no physics, no nodes.
## Aisle cell 0 is the door; row r is reached at cell r + 1.

const Passenger := preload("res://sim/passenger.gd")
const Manifest := preload("res://sim/manifest.gd")

const SEAT_TICKS: int = 2  # placeholder: ticks spent in the aisle sitting down

var layout: RefCounted
var plan: RefCounted
var passengers: Array[Passenger] = []
var aisle: Array[int] = []        # passenger id or -1
var gate_queue: Array[Passenger] = []
var tick: int = 0
var zones_released: int = 0
var seated_count: int = 0

func _init(p_layout: RefCounted, p_plan: RefCounted, seed_value: int) -> void:
	layout = p_layout
	plan = p_plan
	passengers = Manifest.generate(layout, seed_value)
	for p: Passenger in passengers:
		p.zone = plan.zone_of_seat[p.seat]
	aisle.resize(layout.rows + 1)
	aisle.fill(-1)

func is_done() -> bool:
	return seated_count == passengers.size()

func can_release() -> bool:
	return zones_released < plan.zone_count()

## Manual trigger: call the next zone to the door.
func release_next_zone() -> void:
	if not can_release():
		return
	for p: Passenger in passengers:
		if p.zone == zones_released:
			gate_queue.append(p)
	zones_released += 1

func step() -> void:
	if is_done():
		return
	tick += 1
	# Front of the plane first, so followers see freed cells this tick.
	for c: int in range(aisle.size() - 1, -1, -1):
		if aisle[c] == -1:
			continue
		var p: Passenger = passengers[aisle[c]]
		if c == p.row + 1:
			if p.seating_left > 0:
				p.seating_left -= 1
				if p.seating_left == 0:
					aisle[c] = -1
					p.state = Passenger.State.SEATED
					p.cell = -1
					p.seated_tick = tick
					seated_count += 1
			continue
		if aisle[c + 1] == -1:
			aisle[c + 1] = p.id
			aisle[c] = -1
			p.cell = c + 1
			if p.cell == p.row + 1:
				p.seating_left = SEAT_TICKS
		else:
			p.blocked += 1
	# Door
	if not gate_queue.is_empty() and aisle[0] == -1:
		var next: Passenger = gate_queue.pop_front()
		next.state = Passenger.State.IN_AISLE
		next.cell = 0
		aisle[0] = next.id
		if next.row + 1 == 0:
			next.seating_left = SEAT_TICKS
	# Experience counters
	for p: Passenger in passengers:
		match p.state:
			Passenger.State.AT_GATE:
				p.gate_wait += 1
			Passenger.State.SEATED:
				if p.seated_tick != tick:
					p.seated_wait += 1

## Headless helper: release a zone every `gap` ticks, run to completion.
## Returns boarding time in ticks, or -1 if it did not finish.
func run_auto(gap: int, max_ticks: int = 1000) -> int:
	release_next_zone()
	while not is_done() and tick < max_ticks:
		if gap > 0 and tick % gap == 0:
			release_next_zone()
		step()
	return tick if is_done() else -1

func average_mood() -> float:
	var total: int = 0
	for p: Passenger in passengers:
		total += p.mood()
	return float(total) / float(passengers.size())
