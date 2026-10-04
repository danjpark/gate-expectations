# Gate Expectations: engineering review

Reviewed `main` at `c2f07cc31976811f75766d42033dff628c5b8dad` on 2026-10-03. This is a source review and seeded simulation analysis, with fixes in the accompanying branch. It is not a player usability study or an implemented Godot port.

The prototype is appropriately small and already has the most valuable architectural decision: the boarding model runs without a browser. The staff/principal-level concern is preserving a trustworthy model and making the next mechanic cheap to add. A framework, ECS, physics engine, or TypeScript migration would not solve the current problems by itself.

## Findings and changes

| Priority | Finding | Consequence | Resolution |
|---|---|---|---|
| High | Quoted test-file glob required newer Node despite documented Node 20 support | The advertised test command failed on Node 20 | Use built-in test discovery (`node --test`); verify on Node 20 CI |
| High | Stats released zones at fixed one-tick intervals; the upgrade waited for the lounge queue to clear | Results modeled a different calling policy; especially misleading for non-default orders | `runAutoCall` shares the game's policy; batch/search/refinement use it by default. The analysis link carries auto-call order |
| High | Stats reset discarded promise records but left CPU work running | A stale expensive search delayed the next plane, while awaiting handlers never settled | Worker client terminates old work, rejects pending requests, handles worker errors, and creates a new worker on demand |
| High | No validation at layout/plan/sim boundaries | Fractional zones, missing seats, or invalid aisle geometry could produce invalid or unfinished flights | Validate positive integer layout sizes, complete integer zone maps, and paint commands; ignore invalid zone-release commands |
| Medium | Flight retained the mutable editor plan | Flight metadata could disagree with passenger zones after edits | Snapshot and freeze the zone map at flight construction |
| Medium | Painting could survive cancellation or the start of boarding | A drag could rebuild the simulation during a running flight | Clear painting on start/reset/cancel/lost capture; guard pointer movement by phase |
| Medium | Save data was spread into runtime state without checking types | String currency could concatenate rewards; invalid upgrade flags could leak into the UI | Versioned whitelist normalization and independent economy module |
| Medium | Upgrade purchase was possible mid-flight | A manual flight could switch control policy while running | Purchase enabled during planning only |
| Medium | Fixed-gap helper called another zone at tick zero | The requested gap did not apply between the first two calls | Skip the tick-zero periodic release; regression test |
| Medium | Drawing, geometry, economy, input, and orchestration shared one file | Presentation changes obscured game-flow changes | Canvas adapter and palette extracted; economy separated; main reduced from 358 to 237 lines |
| Medium | Refinement selected its starting plan from held-out results | Evaluation seeds influenced optimization | Select the starting candidate using training seeds in the worker |
| Low | Worker exceptions and zero-variance curves were unhandled | Analysis could remain busy indefinitely or plot NaN coordinates | Structured errors, UI error handling, and skip undefined normal curves |
| Low | Pattern keys joined zone labels without a separator | Multi-digit zone labels could collide | Delimited plan keys |

The policy alignment should not be overstated: with a fixed queue order and no later player intervention, both old and new policies often produce the same final queue sequence and boarding time. The old policy was still the wrong contract, and the fixed-gap API really did violate its requested spacing. Analysis evaluates queue-empty auto-calling, not a recording of a manually played flight.

## Boundaries after cleanup

- `src/sim/`: layout, plan, passenger state machines, manifest/RNG, tuning, boarding and deterministic analysis. No DOM, clocks, or rendering.
- `src/game/progress.js`: economy and save normalization. No storage API.
- `src/view/`: Canvas geometry, interpolation, drawing and palette. Reads simulation state.
- `src/main.js`: browser input, frame accumulator, phase transitions, persistence and UI controls.
- `src/analysis/worker-client.js`: worker lifecycle and request settlement.
- `src/stats-worker.js`: analysis request adapter.

Keep orchestration this small until a second game system actually needs it. At that point, extract a headless flight session with `start`, `release_zone`, `advance`, `retry`, and `settle` commands. Keep clock accumulation and localStorage outside it. Do not introduce a general event bus to replace straightforward calls.

## Deliberately unresolved product decisions

1. Mood is saturated at zero for large flights; see the design review. Tuning values were centralized but not silently rebalanced.
2. Same-seed retries earn currency repeatedly. Fine for a sandbox; a campaign will need a distinct practice mode or a flight identifier that can be paid once.
3. All planes are immediately selectable. The promised career progression is not implemented.
4. Passenger patience affects mood only; it does not affect walking or boarding decisions.
5. One front door and a shared bridge constrain the wide-body. The front cross-aisle is represented as direct lane entry, not separately occupied travel cells. This is a simplifying model, not airport realism.
6. Most future story/upgrade systems belong in a game/session layer, not in Canvas callbacks or the passenger movement loop.
7. A frozen zone snapshot does not make every public simulation array immutable. Treat those arrays as read-only in production adapters. Tests currently use direct setup for shuffle scenarios.
8. The model still uses array `shift()` and a renderer membership scan. At the current maximum 320 passengers, correctness and clarity take priority over replacing them with elaborate queues or spatial systems.
9. Pattern/refinement searches optimize a scalar mean time. A production analysis tool should retain completion rate, upper-tail time, mood and other objectives independently; DNF's 20,000-tick penalty is not an actual completed flight.

## Verification

`npm test` includes original behavior tests, per-tick occupancy checks across every plane, command/validation tests, cancellation/error tests, save normalization, UI adapter smoke tests, and language-neutral port fixtures. `npm run check` syntax-checks source, tests and tools. CI runs both with Node 20. The project intentionally has no bundler or build step.

A browser visual check could not run in this environment: Chromium was absent and its download returned an invalid archive. DOM/Canvas adapter smoke tests exercise game flow with mocked rendering; they do not verify pixels, touch usability, animation quality, or real browser worker scheduling. Playtesting is still required before merging balance changes.
