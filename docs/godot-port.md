# Porting Gate Expectations to Godot 4

The intended port is a rewrite of adapters plus a translation of the deterministic model, not an automatic JavaScript conversion. The repository does not yet contain a Godot project.

## Keep the useful boundary

| Web code | Suggested Godot counterpart |
|---|---|
| `PlaneLayout`, plane definitions | Layout helper (`RefCounted`) plus data-only plane definition (`Resource` or loaded JSON) |
| `BoardingPlan` | Editable plan object; snapshot it when a flight begins |
| `Passenger` | Plain simulation data/state; a `RefCounted` helper is sufficient |
| `BoardingSim` | Headless `RefCounted` model exposing one `step()` per logical tick |
| `progress.js` | Economy/save normalization helper, with FileAccess or ConfigFile in an external persistence adapter |
| `main.js` | Flight controller Node, Control UI, input and logical tick accumulator |
| `boarding-view.js` | Node2D/Control drawing and interpolation reading simulation coordinates |
| analysis worker | A separate headless analysis runner; move to threading only when needed |

Godot's [RefCounted](https://docs.godotengine.org/en/stable/classes/class_refcounted.html) is a reference-counted object base. There is no need for one physics body or processing Node per passenger to implement this queue model. Visual passengers can be sprites or draws driven by the model; collisions stay in integer-cell arrays.

## Time and ordering

Godot exposes variable-rate `_process` and fixed-rate `_physics_process` ([official processing documentation](https://docs.godotengine.org/en/stable/tutorials/scripting/idle_and_physics_processing.html)). Neither should turn one engine callback into one boarding tick accidentally. The prototype's base logical tick is 500 ms, independent of render rate.

Accumulate elapsed time in a controller and call `step()` only at the logical interval, adjusted by the selected playback speed. Keep interpolation in the view. A headless runner calls `step()` directly without an engine clock. `_physics_process` is an optional fixed-frequency driver, not a requirement to use physics for passenger movement.

Preserve the update sequence exactly:

1. Auto-call when the lounge queue is empty, before the simulation step.
2. Increment tick.
3. Complete reseating holds.
4. Advance lanes in aisle-index order, processing each lane from rear to front.
5. Advance the shared bridge from exit to entrance.
6. Admit one gate passenger if the bridge entrance is free.
7. Update waiting counters.

Within a lane, a newly freed cell is available to a following passenger in the same tick. Changing to simultaneous updates changes the model. Preserve the `-1` empty / `-2` neighbour-hold sentinels, passenger IDs, state/phase enums, and integer row-to-cell mapping. Avoid iterating unordered dictionaries where sequencing matters.

## Randomness and fixtures

The JS model uses **mulberry32**, including JavaScript unsigned 32-bit wrapping and `Math.imul`. Godot's [RandomNumberGenerator](https://docs.godotengine.org/en/stable/classes/class_randomnumbergenerator.html) currently uses PCG32 and documents its algorithm as an implementation detail. Setting the same integer seed in both implementations does not produce the same manifest.

For parity, port mulberry32 explicitly. In GDScript's wider integer arithmetic, mask additions/multiplications with `0xffffffff` and shift masked nonnegative values. Preserve Fisher–Yates traversal and the order of name/patience RNG calls. Generate seat ordering, patience and names in the same order as `manifest.js`. Avoid adding cosmetic RNG draws to this stream; derive a separate visual stream if needed.

Alternatively, import complete generated manifests when testing the movement model. That isolates movement parity while the RNG translation is being verified.

`tests/fixtures/port-v1.json` records three small flights with:

- Layout, seed, complete zone map and call order.
- Generated manifest (seat, patience, name) in passenger-ID order.
- Checkpoints at ticks 0, 8 and 20: occupancy, releases, seated count and passenger counters/states.
- Final time and average mood.

Passenger checkpoint tuples are `[state, lane, cell, phase, timer, gateWait, blocked, seatedWait]`. Passenger index is their ID. Fixtures are versioned; changing a rule requires reviewing its expected results, not regenerating them automatically in the test run.

These fixtures are a starting acceptance suite, not a proof of cross-language parity. After they match, generate a larger corpus covering sparse zones, reversed calls, custom middle blocks, last-row shuffles and intentionally unfinished flights. Keep the existing per-tick occupancy checks in both implementations.

## Staged migration

1. Freeze the rule version and retain JS as the oracle.
2. Translate layout, seeded manifest and editable plan; verify manifests and seat/aisle mappings.
3. Translate Passenger/BoardingSim without visuals; compare checkpoints and completion.
4. Build one small cabin view, controls and interpolation. Do not port every plane UI before the model matches.
5. Add save/economy adapter and exercise a full retry/new-flight/upgrade flow.
6. Compare many seeds and manual command traces, then retire the JS implementation if desired.

Add a portable command trace only when manual replay or migration tests need it: `(logical tick, command, arguments)`, with a defined before-step boundary. Keep it out of the renderer. Save/replay files should identify the rule version, layout, plan, seed and calling policy; a seed alone is not a complete flight specification.

Godot migration should follow a validated core loop. Engine polish will not repair a dominant strategy or an uninformative mood score.
