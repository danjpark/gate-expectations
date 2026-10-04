# Gate Expectations: game design review

## What the current game is

A deterministic, spatial scheduling puzzle about assigning boarding cohorts to a shared bottleneck. The loop is:

**Paint zones → choose/call their order → observe congestion and seat shuffles → receive time/mood feedback and money → retry or change passengers.**

There is a small incremental layer: purchase auto-call after earning money. There is not yet a shift schedule, campaign, airport management system, story engine, baggage system, staff system or meaningful active-play layer beyond calling zones. Passenger names and patience are the beginnings of characterization.

The fantasy is strong: “I have stood in this line; I could organize it better.” The visible queue makes decisions understandable, the same-passenger retry supports learning, and seated neighbours standing up is an excellent physical/comedic expression of a scheduling mistake. The model does not need realistic boarding values to support that fantasy.

## What currently limits it

The strongest strategy transfers between flights. In this model everyone walks at the same speed, takes the same time to sit, obeys every instruction, and has no baggage or competing boarding priority. Window-first suppresses the largest preventable conflict. A bigger cabin increases painting labor and runtime without necessarily increasing the number of interesting decisions.

Manual calls can be made immediately in any order. The gate queue has no crowding cost or compliance penalty. Under those assumptions, waiting to call a later zone brings no benefit: queue order is the strategic choice. Auto-call removes repeated button presses, but it does not yet transform the strategy. Buying relief from a chore can be satisfying briefly; it cannot carry long-term progression alone.

Mood has little interpretive value at large sizes, and it never affects rewards or passenger actions. Fast boarding and happy passengers therefore are not yet competing objectives. A mood ring turning everyone red gives little explanation of what to improve. Names are charming, but named dots are not yet characters.

## Measured evidence

200 seeds (1–200) per plane/plan, using the game's queue-empty caller in default order. All values are prototype ticks. “Window first” uses aisle-distance groups, with fewer zones where equal-depth groups cannot be split. Rows use an even back-to-front grouping. These are baseline comparisons, not an exhaustive optimizer or human playtest.

| Plane | Target | Standing-line mean | Row-plan mean | Window-plan mean | Window-plan on-time rate | Window-plan final mood |
|---|---:|---:|---:|---:|---:|---:|
| Tier 1, 24 seats | 45 | 46.98 | 42.23 | 46.98 | 25% | 39.30 |
| Tier 2, 48 seats | 90 | 114.26 | 115.52 | 78.73 | 100% | 14.21 |
| Single aisle, 192 seats | 300 | 429.50 | 513.81 | 265.34 | 100% | 0 |
| Wide 3-4-3, 320 seats | 400 | 443.45 | 443.13 | 357.56 | 100% | 0 |
| Wide 3-3-3, 288 seats | 380 | 406.99 | 415.99 | 326.27 | 100% | 0 |

All three tested plans had final average mood zero on each of the three largest planes. Tier 1 has no window/aisle distinction: every seat is an aisle seat, so its window plan is the standing line. That makes it a good tutorial for row ordering but a poor demonstration of the signature seat-shuffle mechanic.

The conclusion is not “make window-first bad.” It is “give the player a reason to sometimes sacrifice throughput.” Preserve the intuitive rule, then put it in tension with another objective.

## Recommended direction: a cozy operations puzzle across a shift

Keep planning as the main skill. Give each flight a visible constraint, a small action budget, and an outcome that changes the next flight. The resulting structure is:

**Read the flight brief → create a plan → intervene a few times → review consequences → spend or repair → take the next flight.**

A compact example: a school group needs to board together, a premium cabin promises early boarding, and the plane is late. Cohesion and premium promises pull against window-first efficiency. Let the player see these demands before committing. The interesting choice is which promise to prioritize and which tool to use, rather than discovering a hidden rule after losing.

| Design layer | Concrete decision | Why it adds depth |
|---|---|---|
| Flight constraint | Board a group together, or keep strict seating cohorts | Creates a conflict with the familiar efficient plan |
| Limited intervention | Spend one of two staff assists on a blockage or a gate issue | Introduces opportunity cost during execution |
| Shift resources | Use a reserve helper now, or save them for a tighter departure | Gives one flight consequences beyond its own score |
| Upgrade choice | Buy information, staffing or automation | Changes available decisions instead of merely reducing timers |
| Relationship | Honor an airline's early-boarding promise or prioritize departure | Makes story emerge from the operational decision |

Do not implement all these together. Start with one constraint and one intervention.

## Useful alternative frameworks

| Framework | How this game would work | Strength | Main risk |
|---|---|---|---|
| Optimization puzzle | Hand-authored flights, explicit constraints, medals and replay comparisons | Best match to the current deterministic simulation | A solved strategy can make procedural flights repetitive |
| Light service game | Plan first, then handle a few visible gate/boarding issues | Makes the player feel like a gate agent while the plan runs | Constant clicking can obscure the planning game and become tedious |
| Shift-based roguelite | Draft tools, choose flights/contracts, carry resources through a short shift | Creates replayable choices and changing combinations | Randomness can undermine causal learning if it is hidden or unbounded |
| Airport tycoon | Route staffing, maintenance and contracts across gates | Supports the gate-agent-to-manager aspiration | Huge scope increase; boarding can become an incidental minigame |
| Narrative workplace comedy | Recurring coworkers/passengers and policy conflicts during flights | Gives consequences personality and warmth | Dialogue that does not affect decisions may feel detached from play |

My recommendation is the optimization puzzle plus a light service layer, framed by workplace comedy. Add a shift structure once individual flights are interesting. Treat airport tycoon as a later expansion decision.

## Active actions worth testing

Use predictable, readable opportunities rather than surprise punishment. Each action should have an automated baseline, a clear benefit, and a future upgrade that replaces the routine while opening a new decision.

- **Help at a seat shuffle:** one limited staff assist reduces the stand/reseat delay for a selected row. It must consume a resource; otherwise players will spam every blockage.
- **Resolve a gate issue:** assign a helper to a visible passenger issue while boarding continues. The helper cannot simultaneously assist inside the plane.
- **Redirect a cohort:** choose between two already-valid boarding priorities when a flight brief makes both costly. This requires an explicit rule explaining why immediate calling is not always best.

Baggage, accessibility assistance and family groups are possible later mechanisms, but model the operational service requirement respectfully. Joke about contradictory policies, broken scanners and management's incentives; avoid making a passenger's disability or family status the punchline.

## Story from the system

Use a recurring cast rather than random names alone: a calm ramp lead, a dispatcher protecting the schedule, a corporate representative selling early-boarding promises, and a few recognizable travelers. Each should stand for a competing goal, not merely deliver flavor text.

A small first arc could have three flights:

1. A coworker teaches the basic plan and helps identify a blockage.
2. A manager introduces a premium-first promise that conflicts with the player's efficient plan.
3. The player decides how to meet a tight departure while dealing with the promise's consequences, then unlocks a tool that makes the compromise easier next time.

After each flight, show a short reaction tied to a real result: “We departed on time, but you broke our priority promise.” That is a better story hook than an unrelated paragraph after a generic time score. Full branching dialogue infrastructure is unnecessary for this first arc.

## Next experiments, in order

1. **Make feedback diagnostic.** Show time lost to seat shuffles and aisle blocking, with a replay/highlight of the worst row. Count distinct experience categories without double-counting shared delays as elapsed flight time. Prefer “6 passengers had to stand” over a single opaque mood score.
2. **Test the small 2-2 cabin.** Use 24–48 seats to teach window/aisle interference without requiring hundreds of paint gestures. If small flights are not interesting, bigger planes will not solve it.
3. **Add one visible promise.** Compare throughput-only flights with a group or premium-priority constraint. Assess whether players now make different plans rather than selecting the same template.
4. **Add one limited assist.** Test whether players wait for a valuable moment and can explain the benefit. Avoid reaction-speed dependence.
5. **Repair mood's scale and purpose.** Distinguish gate wait, aisle blockage and unwanted stand-ups. Choose whether mood is feedback, a contract condition or a reward input before choosing coefficients. Do not simply normalize every large flight to green.
6. **Create a three-flight shift.** Add carryover only after the individual decisions work.

During playtests, ask players to predict the bottleneck before pressing go, explain one change afterward, and choose whether to voluntarily retry. Track strategy diversity, mistaken causal explanations, and idle time. A lower mean boarding time is not evidence of a better game by itself.

These are recommendations, not mechanics silently added by the code cleanup.
