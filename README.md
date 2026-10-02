# Gate Expectations

A comedic airport game: you're a gate agent who thinks "I could organize this better."
Paint boarding zones onto the seat map, press go, watch the passengers move, and
improve the plan on the next attempt. Earn your way from gate agent to running the airport.

Built in **Godot 4 (GDScript 2.0, statically typed)**, Compatibility renderer, web export first.

## Status

Prototype scope = Tier 1 only: 24 seats (12 rows, 1 seat per side), manual zone release,
2-zone cap, hover name cards, one trait (patience) feeding mood. Anything beyond that needs
a design-doc change first.

## Run

Needs Godot 4.3+ on your PATH (or use the editor: open `project.godot`, press F5).

```bash
godot --headless --import            # first time only
godot --headless -s tests/run_tests.gd   # simulation tests, exit code 1 on failure
```

## Layout

- `sim/` pure `RefCounted` GDScript: layout, plan, manifest, passenger, boarding sim. No nodes, no physics, no frame time, no global RNG.
- `scenes/` visual layer; reads sim state and draws it.
- `tests/` headless tests.

## Rules for the simulation

Fixed ticks, integer cells, one seeded `RandomNumberGenerator` per flight. Same plane + manifest + zones = same boarding time.
