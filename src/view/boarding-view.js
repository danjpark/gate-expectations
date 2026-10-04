// Canvas adapter. Owns geometry/interpolation only; never advances or mutates the simulation.
import { WALKWAY_CELLS } from "../sim/boarding.js";
import { State } from "../sim/passenger.js";
import { ZONE_COLORS } from "./palette.js";

export function createBoardingView(canvas) {
  const ctx = canvas.getContext("2d");
  const ROOM = { x: 16, y: 30, w: 214, h: 420 };
  const BRIDGE_X0 = ROOM.x + ROOM.w;
  let layout, sim, plan, geo, mouse, planeName;
  let now = 0, tickDuration = 500, from = [], t0 = 0;

  function makeGeo() {
    const slots = layout.cols + layout.aisleCount;
    const planeCells = layout.rows + 2; // door / cross-aisle, rows, rear galley
    const cellW = Math.floor((canvas.width - BRIDGE_X0 - 20) / (WALKWAY_CELLS + 0.5 + planeCells));
    const cellH = Math.floor((canvas.height - 40) / (slots + 1));
    const cell = Math.min(46, cellW, cellH);
    const top = (canvas.height - (slots - 1) * cell) / 2 + 10; // y of slot 0
    const slotY = (i) => top + i * cell;
    const aisleSlot = (a) => layout.blocks.slice(0, a + 1).reduce((x, b) => x + b, 0) + a;
    const aisleYs = Array.from({ length: layout.aisleCount }, (_, a) => slotY(aisleSlot(a)));
    const doorY = (aisleYs[0] + aisleYs[aisleYs.length - 1]) / 2;
    const planeX0 = BRIDGE_X0 + (WALKWAY_CELLS + 0.5) * cell + cell / 2;
    const n = layout.seatCount, rOuter = cell * 0.32;
    const sp = Math.max(2 * rOuter + 1, Math.min(30, Math.floor(Math.sqrt((ROOM.w * (ROOM.h - 30)) / (n * 1.25)))));
    const gridRows = Math.floor((ROOM.h - 30) / sp);
    const gridTop = ROOM.y + 26 + sp / 2;
    const exitRow = Math.max(0, Math.min(gridRows - 1, Math.round((doorY - gridTop) / sp)));
    // Lounge rows ordered by closeness to the exit, so the line forms near the jet bridge.
    const rowOrder = Array.from({ length: gridRows }, (_, i) => i).sort((a, b) => Math.abs(a - exitRow) - Math.abs(b - exitRow) || a - b);
  return { cell, slotY, aisleYs, doorY, planeX0, rOuter, rInner: cell * 0.23, sp, gridRows, gridTop, rowOrder, top, slots };
}

const laneX = (c) => geo.planeX0 + c * geo.cell;
const walkX = (c) => BRIDGE_X0 + geo.cell / 2 + c * geo.cell;
const seatPos = (s) => {
  const col = layout.seatCol(s);
  return { x: laneX(layout.seatRow(s) + 1), y: geo.slotY(col + layout.colInfo[col].block) };
};
const loungePos = (k) => ({
  x: ROOM.x + ROOM.w - 6 - geo.sp / 2 - Math.floor(k / geo.gridRows) * geo.sp,
  y: geo.gridTop + geo.rowOrder[k % geo.gridRows] * geo.sp,
});

// Lounge spots: the called line first (nearest the exit), then everyone else grouped by zone.
function loungeMap() {
  const waiting = sim.passengers.filter((p) => p.state === State.AT_GATE && !sim.gateQueue.includes(p))
    .sort((a, b) => a.zone - b.zone || a.id - b.id);
  const m = new Map();
  [...sim.gateQueue, ...waiting].forEach((p, k) => m.set(p.id, k));
  return m;
}

// Where the sim says the passenger is right now.
function target(p, lm) {
  if (p.state === State.SEATED) return seatPos(p.seat);
  if (p.state === State.AT_GATE) return loungePos(lm.get(p.id));
  if (p.lane === -1) return { x: walkX(p.cell), y: geo.doorY };
  const pos = { x: laneX(p.cell), y: geo.aisleYs[p.lane] };
  if (p.state === State.STANDING) pos.y += (layout.seatAisleDistance(p.seat) - 0.5) * geo.rOuter * 0.9;
  return pos;
}
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const ease = (t) => t * t * (3 - 2 * t);
const tickMs = () => tickDuration;
function drawnPos(p, lm) {
  const t = ease(Math.min(1, Math.max(0, (now - t0) / tickMs())));
  return lerp(from[p.id] ?? target(p, lm), target(p, lm), t);
}
// Record where everyone is drawn now as the blend start (or jump to target if `instant`).
function snapTo(instant) {
  const lm = loungeMap();
  from = sim.passengers.map((p) => (instant ? target(p, lm) : drawnPos(p, lm)));
  t0 = now;
}

function seatAt(pt) {
  const half = geo.cell * 0.45;
  for (let s = 0; s < layout.seatCount; s++) {
    const p = seatPos(s);
    if (Math.abs(pt.x - p.x) < half && Math.abs(pt.y - p.y) < half) return s;
  }
  return -1;
}
function draw() {
  const W = canvas.width, H = canvas.height, { cell } = geo;
  ctx.clearRect(0, 0, W, H);
  ctx.font = "13px system-ui";

  // Gate lounge and jet bridge
  ctx.fillStyle = "#3a4258";
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(ROOM.x, ROOM.y, ROOM.w, ROOM.h, 10) : ctx.rect(ROOM.x, ROOM.y, ROOM.w, ROOM.h); ctx.fill();
  ctx.fillStyle = "#cfd6ea"; ctx.fillText("GATE LOUNGE", ROOM.x + 10, ROOM.y + 18);
  const bridgeEnd = geo.planeX0 - cell / 2;
  ctx.fillStyle = "#6b7390"; ctx.fillRect(BRIDGE_X0, geo.doorY - cell / 2, bridgeEnd - BRIDGE_X0 + 1, cell);
  ctx.fillStyle = "#cfd6ea"; ctx.fillText("JET BRIDGE", BRIDGE_X0 + 6, geo.doorY - cell / 2 - 6);

  // Fuselage, aisles, front cross-aisle
  const fx = bridgeEnd, fw = laneX(layout.rows + 1) + cell / 2 - fx;
  ctx.fillStyle = "#ececf2"; ctx.fillRect(fx, geo.top - cell, fw, (geo.slots + 1) * cell);
  ctx.fillStyle = "#d1d1db";
  for (const y of geo.aisleYs) ctx.fillRect(fx, y - cell / 2, fw, cell);
  ctx.fillRect(fx, geo.aisleYs[0] - cell / 2, cell, geo.aisleYs[geo.aisleYs.length - 1] - geo.aisleYs[0] + cell);
  ctx.fillStyle = "#cfd6ea"; ctx.fillText(planeName, fx, geo.top - cell - 6);

  // Seats
  for (let s = 0; s < layout.seatCount; s++) {
    const p = seatPos(s);
    ctx.fillStyle = ZONE_COLORS[plan.zoneOfSeat[s]];
    ctx.globalAlpha = 0.45;
    ctx.fillRect(p.x - cell * 0.4, p.y - cell * 0.4, cell * 0.8, cell * 0.8);
    ctx.globalAlpha = 1;
  }

  // Passengers
  const lm = loungeMap();
  let hover = null;
  for (const p of sim.passengers) {
    const pos = drawnPos(p, lm);
    ctx.beginPath(); ctx.arc(pos.x, pos.y, geo.rOuter, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${p.mood() * 1.2}, 75%, 45%)`; // mood ring: red .. green
    ctx.fill();
    ctx.beginPath(); ctx.arc(pos.x, pos.y, geo.rInner, 0, Math.PI * 2);
    ctx.fillStyle = ZONE_COLORS[p.zone]; ctx.fill();
    if (p.state === State.STANDING) { ctx.strokeStyle = "#111"; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1; }
    if (mouse && Math.hypot(mouse.x - pos.x, mouse.y - pos.y) < Math.max(geo.rOuter, 6)) hover = p;
  }

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

  return {
    configure(nextLayout) { layout = nextLayout; geo = makeGeo(); },
    capture(nextSim, time, duration, instant) {
      sim = nextSim; now = time; tickDuration = duration; snapTo(instant);
    },
    draw(state) {
      ({ sim, plan, mouse, planeName, now, tickDuration } = state);
      draw();
    },
    seatAt,
    get cellSize() { return geo.cell; },
  };
}
