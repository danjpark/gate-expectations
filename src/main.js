// Visual layer. Reads sim state and draws it; owns no sim logic.
// The sim moves in discrete ticks; here each passenger is blended from where they were
// last drawn to where the sim now says they are, over one tick, so movement looks smooth.
import { PlaneLayout } from "./sim/layout.js";
import { BoardingPlan } from "./sim/plan.js";
import { BoardingSim, WALKWAY_CELLS } from "./sim/boarding.js";
import { State } from "./sim/passenger.js";

const CELL = 46;
const CELL0_X = 262;            // x of aisle cell 0 (start of the jet bridge)
const AISLE_Y = 210;
const ROOM = { x: 16, y: 40, w: 214, h: 340 };
const TICK_MS = 500;
const TARGET_TICKS = 45;        // prototype target; tune by playtesting
const ZONE_COLORS = ["#4f9dde", "#f2a03d"];
const R_OUTER = 14, R_INNER = 10;

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
const $ = (id) => document.getElementById(id);

const layout = new PlaneLayout();
const plan = new BoardingPlan(layout);
let sim, phase, seed = 1, acc = 0, last = 0, now = 0;
let paintZone = 1, painting = false, mouse = null;
let from = [], t0 = 0;          // per-passenger blend start position and time

const cellX = (c) => CELL0_X + c * CELL;

function reset() {
  sim = new BoardingSim(layout, plan, seed);
  phase = "plan";
  acc = 0;
  snapTo(true);
  refresh();
}
function refresh() {
  $("analyze").href = `stats.html#z=${plan.zoneOfSeat.join("")}`;
  $("go").disabled = phase !== "plan";
  $("release").disabled = phase !== "running" || !sim.canRelease;
  $("retry").disabled = phase === "plan";
  $("hint").textContent = phase === "plan"
    ? `Drag across seats to paint zone 2 (orange). Zone 1 boards first. Seed ${seed}.`
    : `Seed ${seed}. Call the next zone when the aisle clears.`;
}

$("go").onclick = () => {
  sim = new BoardingSim(layout, plan, seed);
  snapTo(true);
  sim.releaseNextZone();
  snapTo(false);
  phase = "running";
  refresh();
};
$("release").onclick = () => { snapTo(false); sim.releaseNextZone(); refresh(); };
$("retry").onclick = reset;
$("new").onclick = () => { seed++; reset(); };

// --- positions ---------------------------------------------------------

const seatPos = (s) => ({
  x: cellX(WALKWAY_CELLS + layout.seatRow(s) + 1),
  y: layout.seatCol(s) === 0 ? AISLE_Y - CELL : AISLE_Y + CELL,
});

// Waiting-room spot for a passenger whose zone has not been called: grouped by zone.
function roomSpot(p) {
  let rank = 0;
  for (const q of sim.passengers) { if (q.id === p.id) break; if (q.zone === p.zone) rank++; }
  const col = rank % 6, row = Math.floor(rank / 6);
  return { x: ROOM.x + 26 + col * 30, y: ROOM.y + 50 + p.zone * 180 + row * 30 };
}
// Called passengers line up by the door of the walkway, snaking back into the room.
function queueSpot(i) {
  return { x: ROOM.x + ROOM.w - 20 - Math.floor(i / 3) * 26, y: AISLE_Y + ((i % 3) - 1) * 26 };
}
// Where the sim says the passenger is right now.
function target(p) {
  if (p.state === State.IN_AISLE) return { x: cellX(p.cell), y: AISLE_Y };
  if (p.state === State.SEATED) return seatPos(p.seat);
  const q = sim.gateQueue.indexOf(p);
  return q >= 0 ? queueSpot(q) : roomSpot(p);
}
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const ease = (t) => t * t * (3 - 2 * t);
function drawnPos(p) {
  const t = ease(Math.min(1, Math.max(0, (now - t0) / TICK_MS)));
  return lerp(from[p.id], target(p), t);
}
// Record where everyone is drawn now as the blend start (or jump to target if `instant`).
function snapTo(instant) {
  const next = sim.passengers.map((p) => (instant ? target(p) : drawnPos(p)));
  from = next;
  t0 = now;
}

function seatAt(pt) {
  for (let s = 0; s < layout.seatCount; s++) {
    const p = seatPos(s);
    if (Math.abs(pt.x - p.x) < CELL * 0.45 && Math.abs(pt.y - p.y) < CELL * 0.45) return s;
  }
  return -1;
}
function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) * canvas.width) / r.width, y: ((e.clientY - r.top) * canvas.height) / r.height };
}

canvas.addEventListener("pointerdown", (e) => {
  mouse = canvasPoint(e);
  if (phase !== "plan") return;
  const s = seatAt(mouse);
  if (s < 0) return;
  painting = true;
  paintZone = 1 - plan.zoneOfSeat[s];
  plan.paint(s, paintZone);
  rebuildPlanSim(); // sim reads zones at construction
  canvas.setPointerCapture?.(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  mouse = canvasPoint(e);
  if (!painting) return;
  const s = seatAt(mouse);
  if (s >= 0 && plan.zoneOfSeat[s] !== paintZone) { plan.paint(s, paintZone); rebuildPlanSim(); }
});
canvas.addEventListener("pointerup", () => { painting = false; });
canvas.addEventListener("pointerleave", () => { mouse = null; });

// While planning, keep a fresh sim so the waiting room shows the zones as painted.
function rebuildPlanSim() {
  refresh();
  sim = new BoardingSim(layout, plan, seed);
  snapTo(true);
}

// --- loop --------------------------------------------------------------
// The sim advances in fixed ticks; frame time only drives the tick accumulator and the blend.
function frame(t) {
  now = t;
  const dt = last ? t - last : 0;
  last = t;
  if (phase === "running") {
    acc += dt;
    while (acc >= TICK_MS && !sim.done) {
      acc -= TICK_MS;
      snapTo(false);
      sim.step();
    }
    if (sim.done) { phase = "done"; refresh(); }
  }
  draw();
  requestAnimationFrame(frame);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

function draw() {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.font = "13px system-ui";

  // Gate room
  ctx.fillStyle = "#3a4258"; roundRect(ROOM.x, ROOM.y, ROOM.w, ROOM.h, 10); ctx.fill();
  ctx.fillStyle = "#cfd6ea"; ctx.fillText("GATE LOUNGE", ROOM.x + 10, ROOM.y - 10);
  ctx.fillStyle = "#8d97b5";
  ctx.fillText("Zone 1", ROOM.x + 10, ROOM.y + 26);
  ctx.fillText("Zone 2", ROOM.x + 10, ROOM.y + 206);
  // Jet bridge, then cabin
  const bridgeX = ROOM.x + ROOM.w, bridgeEnd = cellX(WALKWAY_CELLS) - CELL / 2;
  ctx.fillStyle = "#6b7390"; ctx.fillRect(bridgeX, AISLE_Y - CELL / 2, bridgeEnd - bridgeX + 2, CELL);
  ctx.fillStyle = "#cfd6ea"; ctx.fillText("JET BRIDGE", bridgeX + 18, AISLE_Y - CELL / 2 - 8);
  const cabinX = bridgeEnd, cabinW = CELL * (layout.rows + 1);
  ctx.fillStyle = "#ececf2"; ctx.fillRect(cabinX, AISLE_Y - CELL * 2, cabinW, CELL * 4);
  ctx.fillStyle = "#d1d1db"; ctx.fillRect(cabinX, AISLE_Y - CELL / 2, cabinW, CELL);
  ctx.fillStyle = "#222"; ctx.fillText("PLANE", cabinX, AISLE_Y - CELL * 2 - 8);

  // Seats
  for (let s = 0; s < layout.seatCount; s++) {
    const p = seatPos(s);
    ctx.fillStyle = ZONE_COLORS[plan.zoneOfSeat[s]];
    ctx.globalAlpha = 0.45;
    ctx.fillRect(p.x - CELL * 0.4, p.y - CELL * 0.4, CELL * 0.8, CELL * 0.8);
    ctx.globalAlpha = 1;
  }

  // Passengers
  let hover = null;
  for (const p of sim.passengers) {
    const pos = drawnPos(p);
    ctx.beginPath(); ctx.arc(pos.x, pos.y, R_OUTER, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${p.mood() * 1.2}, 75%, 45%)`; // mood ring: red .. green
    ctx.fill();
    ctx.beginPath(); ctx.arc(pos.x, pos.y, R_INNER, 0, Math.PI * 2);
    ctx.fillStyle = ZONE_COLORS[p.zone]; ctx.fill();
    if (mouse && Math.hypot(mouse.x - pos.x, mouse.y - pos.y) < R_OUTER) hover = p;
  }

  // Status
  $("status").textContent = phase === "done"
    ? `${sim.tick <= TARGET_TICKS ? "ON TIME" : "LATE"}: ${sim.tick} ticks (target ${TARGET_TICKS}). Average mood ${Math.round(sim.averageMood())}.`
    : `Tick ${sim.tick} / target ${TARGET_TICKS}. Zones called ${sim.zonesReleased}/${plan.zoneCount}. Seated ${sim.seatedCount}/${sim.passengers.length}.`;

  // Name card
  if (hover) {
    const x = Math.min(mouse.x + 14, W - 200), y = Math.min(mouse.y + 14, H - 70);
    ctx.fillStyle = "rgba(255,255,255,0.96)"; ctx.fillRect(x, y, 190, 58);
    ctx.strokeStyle = "#000"; ctx.strokeRect(x, y, 190, 58);
    ctx.fillStyle = "#000"; ctx.font = "bold 14px system-ui";
    ctx.fillText(hover.name, x + 6, y + 18);
    ctx.font = "13px system-ui";
    ctx.fillText(`Patience ${hover.patience}/5   Mood ${hover.mood()}`, x + 6, y + 35);
    ctx.fillText(`Waited ${hover.gateWait}  Blocked ${hover.blocked}`, x + 6, y + 51);
  }
}

reset();
requestAnimationFrame(frame);
