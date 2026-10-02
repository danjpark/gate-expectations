extends SceneTree
## Headless tests. Run: godot --headless -s tests/run_tests.gd
## (first time in a fresh clone: godot --headless --import)

const PlaneLayout := preload("res://sim/plane_layout.gd")
const BoardingPlan := preload("res://sim/boarding_plan.gd")
const BoardingSim := preload("res://sim/boarding_sim.gd")
const Manifest := preload("res://sim/manifest.gd")

var failures: int = 0

func _init() -> void:
	test_manifest_fills_every_seat_once()
	test_manifest_is_deterministic()
	test_seeds_differ()
	test_boarding_completes()
	test_same_inputs_same_time()
	test_zone_order_matters()
	test_zone_cap()
	print("%s (%d failure(s))" % ["FAIL" if failures > 0 else "OK", failures])
	quit(1 if failures > 0 else 0)

func check(cond: bool, label: String) -> void:
	if cond:
		print("  pass: ", label)
	else:
		failures += 1
		print("  FAIL: ", label)

func _flight(plan_kind: String, seed_value: int, gap: int) -> BoardingSim:
	var layout := PlaneLayout.new()
	var plan := BoardingPlan.new(layout)
	match plan_kind:
		"back": plan.back_half_first()
		"front": plan.front_half_first()
	var sim := BoardingSim.new(layout, plan, seed_value)
	sim.run_auto(gap)
	return sim

func test_manifest_fills_every_seat_once() -> void:
	var seen: Dictionary = {}
	for p in Manifest.generate(PlaneLayout.new(), 1):
		seen[p.seat] = true
	check(seen.size() == 24, "24 passengers in 24 distinct seats")

func test_manifest_is_deterministic() -> void:
	var layout := PlaneLayout.new()
	var a := Manifest.generate(layout, 42)
	var b := Manifest.generate(layout, 42)
	var same: bool = true
	for i in a.size():
		same = same and a[i].seat == b[i].seat and a[i].patience == b[i].patience and a[i].display_name == b[i].display_name
	check(same, "same seed -> same manifest")

func test_seeds_differ() -> void:
	var layout := PlaneLayout.new()
	var a := Manifest.generate(layout, 1)
	var b := Manifest.generate(layout, 2)
	var diff: bool = false
	for i in a.size():
		diff = diff or a[i].seat != b[i].seat
	check(diff, "different seeds -> different manifests")

func test_boarding_completes() -> void:
	var sim := _flight("none", 7, 0)
	check(sim.is_done(), "standing line finishes")
	check(sim.tick > 0 and sim.tick < 200, "boarding time is sane (%d ticks)" % sim.tick)

func test_same_inputs_same_time() -> void:
	check(_flight("back", 5, 6).tick == _flight("back", 5, 6).tick, "same plane+manifest+zones -> same time")

func test_zone_order_matters() -> void:
	var back_total: int = 0
	var front_total: int = 0
	for s in range(1, 21):
		back_total += _flight("back", s, 6).tick
		front_total += _flight("front", s, 6).tick
	check(back_total < front_total, "back-half-first beats front-half-first (%d vs %d ticks over 20 seeds)" % [back_total, front_total])

func test_zone_cap() -> void:
	var plan := BoardingPlan.new(PlaneLayout.new())
	plan.paint(0, 9)
	check(plan.zone_of_seat[0] == BoardingPlan.MAX_ZONES_TIER1 - 1, "Tier 1 caps zones at 2")
