extends RefCounted
## One passenger: a small state machine plus experience counters.

enum State { AT_GATE, IN_AISLE, SEATED }

var id: int
var display_name: String
var seat: int
var row: int
var patience: int          # trait, 1 (snappy) .. 5 (zen)
var zone: int = 0
var state: State = State.AT_GATE
var cell: int = -1         # aisle cell while IN_AISLE
var seating_left: int = 0  # ticks left occupying the aisle while sitting down

# Experience (ticks)
var gate_wait: int = 0
var blocked: int = 0
var seated_wait: int = 0
var seated_tick: int = -1

## 0..100, lower is unhappier. Placeholder weights; never feeds back into the sim.
func mood() -> int:
	var sourness: float = float(gate_wait) + 2.0 * float(blocked) + 0.5 * float(seated_wait)
	return clampi(100 - int(sourness * 6.0 / float(patience)), 0, 100)
