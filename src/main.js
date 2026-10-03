// Visual layer. Reads sim state and draws it; owns no sim logic.
import { PlaneLayout } from "./sim/layout.js";
import { BoardingPlan } from "./sim/plan.js";
import { BoardingSim } from "./sim/boarding.js";
import { State } from "./sim/passenger.js";

const CELL = 64, X0 = 130, AISLE_Y = 230;
const TICK_MS = 500;
const TARGET_TICKS = 40; // prototype target; tune by playtesting
const ZONE_COLORS = ["#4f9dde", "#f2a03d"];

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
const $ = (id) => document.getElementById(id);

const layout = new PlaneLayout();
const plan = new BoardingPlan(layout);
let sim, phase, seed = 1, acc = 0, last = 0, paintZone = 1, painting = false, mouse = null;

function reset() {
  sim = new BoardingSim(layout, plan, seed);
  phase = "plan";
  acc = 0;
  refresh();
}
function refresh() {
  $("go").disabled = phase !== "plan";
  $("release").disabled = phase !== "running" || !sim.canRelease;
  $("retry").disabled = phase === "plan";
  $("hint").textContent = phase === "plan"
    ? `Drag across seats to paint zone 2 (orange). Zone 1 boards first. Seed ${seed}.`
    : `Seed ${seed}. Call the next zone when the aisle clears.`;
}

$("go").onclick = () => { sim = new BoardingSim(layout, plan, seed); sim.releaseNextZone(); phase = "running"; refresh(); };
$("release").onclick = () => { sim.releaseNextZone(); refresh(); };
$("retry").onclick = reset;
$("new").onclick = () => { seed++; reset(); };

// Geometry helpers
const seatPos = (s) => ({
  x: X0 + (layout.seatRow(s) + 1) * CELL,
  y: layout.seatCol(s) === 0 ? AISLE_Y - CELL : AISLE_Y + CELL,
});
function seatAt(pt) {
  for (let s = 0; s < layout.seatCount; s++) {
    const p = seatPos(s);
    if (Math.abs(pt.x - p.x) < CELL * 0.45 && Math.abs(pt.y - p.y) < CELL * 0.45) return s;
  }
  return -1;
}
function passengerPos(p) {
  if (p.state === State.IN_AISLE) return { x: X0 + p.cell * CELL, y: AISLE_Y };
  if (p.state === State.SEATED) return seatPos(p.seat);
  return { x: 40 + (p.id % 3) * 28, y: 40 + Math.floor(p.id / 3) * 34 };
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
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  mouse = canvasPoint(e);
  if (!painting) return;
  const s = seatAt(mouse);
  if (s >= 0) plan.paint(s, paintZone);
});
canvas.addEventListener("pointerup", () => { painting = false; });
canvas.addEventListener("pointerleave", () => { mouse = null; });

// Loop: sim advances in fixed ticks; frame time only drives the tick accumulator.
function frame(t) {
  const dt = last ? t - last : 0;
  last = t;
  if (phase === "running") {
    acc += dt;
    while (acc >= TICK_MS && !sim.done) { acc -= TICK_MS; sim.step(); }
    if (sim.done) { phase = "done"; refresh(); }
  }
  draw();
  requestAnimationFrame(frame);
}

function draw() {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  // Cabin
  ctx.fillStyle = "#ececf2";
  ctx.fillRect(X0 - CELL / 2, AISLE_Y - CELL * 2, CELL * (layout.rows + 1), CELL * 4);
  ctx.fillStyle = "#d1d1db";
  ctx.fillRect(X0 - CELL / 2, AISLE_Y - CELL / 2, CELL * (layout.rows + 1), CELL);
  ctx.fillStyle = "#222";
  ctx.font = "13px system-ui";
  ctx.fillText("DOOR", X0 - 24, AISLE_Y - CELL * 2 - 6);
  ctx.fillText("GATE", 30, 22);
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
    const pos = passengerPos(p);
    ctx.beginPath(); ctx.arc(pos.x, pos.y, 18, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${p.mood() * 1.2}, 75%, 45%)`; // mood ring: red .. green
    ctx.fill();
    ctx.beginPath(); ctx.arc(pos.x, pos.y, 13, 0, Math.PI * 2);
    ctx.fillStyle = ZONE_COLORS[p.zone]; ctx.fill();
    if (mouse && Math.hypot(mouse.x - pos.x, mouse.y - pos.y) < 18) hover = p;
  }
  // Status
  const status = $("status");
  status.textContent = phase === "done"
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
