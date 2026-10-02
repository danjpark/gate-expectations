extends Control
## Visual layer for the Tier 1 prototype. Reads sim state and draws it; owns no sim logic.
## Plan: click or drag seats to toggle zone 1/0. Go: start boarding. Release: call next zone.

const PlaneLayout := preload("res://sim/plane_layout.gd")
const BoardingPlan := preload("res://sim/boarding_plan.gd")
const BoardingSim := preload("res://sim/boarding_sim.gd")
const Passenger := preload("res://sim/passenger.gd")

enum Phase { PLAN, RUNNING, DONE }

const CELL: float = 64.0
const X0: float = 120.0
const AISLE_Y: float = 300.0
const TICK_SECONDS: float = 0.5
const TARGET_TICKS: int = 40  # prototype target; tune by playtesting
const ZONE_COLORS: Array[Color] = [Color("4f9dde"), Color("f2a03d")]

var layout := PlaneLayout.new()
var plan: BoardingPlan = BoardingPlan.new(layout)
var sim: BoardingSim
var phase: Phase = Phase.PLAN
var seed_value: int = 1
var acc: float = 0.0
var paint_zone: int = 1
var go_btn: Button
var release_btn: Button
var retry_btn: Button
var new_btn: Button

func _ready() -> void:
	var bar := HBoxContainer.new()
	bar.position = Vector2(16, 16)
	add_child(bar)
	go_btn = _button(bar, "Go", _on_go)
	release_btn = _button(bar, "Release next zone", _on_release)
	retry_btn = _button(bar, "Retry (same passengers)", _on_retry)
	new_btn = _button(bar, "New flight", _on_new)
	_reset_sim()

func _button(parent: Node, label: String, cb: Callable) -> Button:
	var b := Button.new()
	b.text = label
	b.pressed.connect(cb)
	parent.add_child(b)
	return b

func _reset_sim() -> void:
	sim = BoardingSim.new(layout, plan, seed_value)
	phase = Phase.PLAN
	acc = 0.0
	_refresh_buttons()

func _refresh_buttons() -> void:
	go_btn.disabled = phase != Phase.PLAN
	release_btn.disabled = phase != Phase.RUNNING or not sim.can_release()
	retry_btn.disabled = phase == Phase.PLAN

func _on_go() -> void:
	sim = BoardingSim.new(layout, plan, seed_value)
	sim.release_next_zone()
	phase = Phase.RUNNING
	_refresh_buttons()

func _on_release() -> void:
	sim.release_next_zone()
	_refresh_buttons()

func _on_retry() -> void:
	_reset_sim()

func _on_new() -> void:
	seed_value += 1
	_reset_sim()

func _process(delta: float) -> void:
	if phase == Phase.RUNNING:
		acc += delta
		while acc >= TICK_SECONDS and not sim.is_done():
			acc -= TICK_SECONDS
			sim.step()
		if sim.is_done():
			phase = Phase.DONE
			_refresh_buttons()
	queue_redraw()

# --- input -------------------------------------------------------------

func _input(event: InputEvent) -> void:
	if phase != Phase.PLAN:
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		var s: int = _seat_at(event.position)
		if s >= 0:
			paint_zone = 1 - plan.zone_of_seat[s]
			plan.paint(s, paint_zone)
	elif event is InputEventMouseMotion and (event.button_mask & MOUSE_BUTTON_MASK_LEFT) != 0:
		var s: int = _seat_at(event.position)
		if s >= 0:
			plan.paint(s, paint_zone)

func _seat_pos(seat: int) -> Vector2:
	var row: int = layout.seat_row(seat)
	var y: float = AISLE_Y - CELL if layout.seat_col(seat) == 0 else AISLE_Y + CELL
	return Vector2(X0 + float(row + 1) * CELL, y)

func _seat_at(pos: Vector2) -> int:
	for s: int in layout.seat_count():
		if absf(pos.x - _seat_pos(s).x) < CELL * 0.45 and absf(pos.y - _seat_pos(s).y) < CELL * 0.45:
			return s
	return -1

func _passenger_pos(p: Passenger) -> Vector2:
	match p.state:
		Passenger.State.IN_AISLE:
			return Vector2(X0 + float(p.cell) * CELL, AISLE_Y)
		Passenger.State.SEATED:
			return _seat_pos(p.seat)
		_:
			var i: int = p.id
			return Vector2(40.0 + float(i % 3) * 26.0, 160.0 + float(i / 3) * 34.0)

# --- drawing -----------------------------------------------------------

func _draw() -> void:
	var font: Font = ThemeDB.fallback_font
	draw_rect(Rect2(X0 - CELL * 0.5, AISLE_Y - CELL * 2.0, CELL * float(layout.rows + 1), CELL * 4.0), Color(0.93, 0.93, 0.95), true)
	draw_rect(Rect2(X0 - CELL * 0.5, AISLE_Y - CELL * 0.5, CELL * float(layout.rows + 1), CELL), Color(0.82, 0.82, 0.86), true)
	draw_string(font, Vector2(X0 - 40.0, AISLE_Y - CELL * 2.0 - 8.0), "DOOR", HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color.BLACK)
	for s: int in layout.seat_count():
		var c: Color = ZONE_COLORS[plan.zone_of_seat[s]]
		draw_rect(Rect2(_seat_pos(s) - Vector2.ONE * CELL * 0.4, Vector2.ONE * CELL * 0.8), c.lerp(Color.WHITE, 0.35), true)
	var hover: Passenger = null
	var mouse: Vector2 = get_local_mouse_position()
	for p: Passenger in sim.passengers:
		var pos: Vector2 = _passenger_pos(p)
		var base: Color = ZONE_COLORS[p.zone]
		var mood_color: Color = Color.RED.lerp(Color.GREEN, float(p.mood()) / 100.0)
		draw_circle(pos, 18.0, mood_color)
		draw_circle(pos, 14.0, base)
		if pos.distance_to(mouse) < 18.0:
			hover = p
	var status: String = "Tick %d / target %d   zones called: %d/%d   seated %d/%d" % [
		sim.tick, TARGET_TICKS, sim.zones_released, plan.zone_count(), sim.seated_count, sim.passengers.size()]
	draw_string(font, Vector2(16.0, 70.0), status, HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color.WHITE)
	if phase == Phase.PLAN:
		draw_string(font, Vector2(16.0, 96.0), "Drag across seats to paint zone 2 (orange). Seed %d." % seed_value, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color.WHITE)
	if phase == Phase.DONE:
		var verdict: String = "ON TIME" if sim.tick <= TARGET_TICKS else "LATE"
		draw_string(font, Vector2(16.0, 96.0), "%s in %d ticks. Avg mood %d." % [verdict, sim.tick, int(sim.average_mood())], HORIZONTAL_ALIGNMENT_LEFT, -1, 20, Color.WHITE)
	if hover != null:
		var card := Rect2(mouse + Vector2(14.0, 14.0), Vector2(190.0, 62.0))
		draw_rect(card, Color(1, 1, 1, 0.95), true)
		draw_rect(card, Color.BLACK, false, 1.0)
		draw_string(font, card.position + Vector2(6.0, 18.0), hover.display_name, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color.BLACK)
		draw_string(font, card.position + Vector2(6.0, 36.0), "Patience %d/5   Mood %d" % [hover.patience, hover.mood()], HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color.BLACK)
		draw_string(font, card.position + Vector2(6.0, 54.0), "Waited %d  Blocked %d" % [hover.gate_wait, hover.blocked], HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color.BLACK)
