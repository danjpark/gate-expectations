# Gate Expectations: working rules

Godot 4.x, GDScript 2.0 only. Reject Godot 3 syntax (yield, `export var`, old `connect`, KinematicBody2D).

- Static typing everywhere.
- Simulation (`sim/`) is plain `RefCounted` classes. No scene nodes, physics, navigation, tweens, timers.
- Fixed ticks and integer cells. Never delta or float positions in the sim.
- Randomness only from the flight's seeded `RandomNumberGenerator`. Never `randi()`, `randf()`, `Array.shuffle()`.
- Visuals only read sim state.
- Keep `.tscn` files minimal; don't hand-edit resource IDs. `.godot/` and build output are gitignored.
- Placeholder numbers; tune by playtesting. Don't invent "realistic" boarding values.
- Scope contract: Tier 1 prototype (see README). No later tiers or parked features without a doc change.
- Simplest structure for one gate, one plane. No manager singletons.
- Run `godot --headless -s tests/run_tests.gd` after every sim change; web export before a playtest.
