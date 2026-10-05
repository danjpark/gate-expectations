// Visual layer. Reads sim state and draws it; owns no sim logic.
// The sim moves in discrete ticks; each passenger is blended from where they were last drawn to where
// the sim now says they are, over one tick, so movement looks smooth.
import { PlaneLayout, PLANES } from "./sim/layout.js";
import { BoardingPlan } from "./sim/plan.js";
import { BoardingSim, WALKWAY_CELLS } from "./sim/boarding.js";
import { State } from "./sim/passenger.js";

const BASE_TICK_MS = 500;
const ZONE_COLORS = ["#4f9dde", "#f2a03d", "#7fd17f", "#e0645c", "#c28cf0"];
const ROOM = { x: 16, y: 30, w: 214, h: 420 };
const BRIDGE_X0 = ROOM.x + ROOM.w;
// Economy placeholders (currency not decided yet): tune by playtesting.
const PAY_FINISH = 10, PAY_ON_TIME = 10, AUTO_CALL_COST = 30;

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
const $ = (id) => document.getElementById(id);

let planeKey, layout, plan, sim, geo, phase;
let seed = 1, acc = 0, last = 0, now = 0;
let brush = 1, paintZone = 1, painting = false, mouse = null;
let from = [], t0 = 0;
let callOrder = [], lastEarned = 0;
const save = loadSave();
let autoOn = !!save.autoOn;

// --- save (per-browser convenience; safe to lose) ---------------------------
function loadSave() {
  try { return { money: 0, autoCall: false, ...JSON.parse(localStorage.getItem("ge-save") || "{}") }; }
  catch { return { money: 0, autoCall: false }; }
}
function persist() { try { localStorage.setItem("ge-save", JSON.stringify(save)); } catch { /* storage unavailable */ } }

// --- plane setup -------------------------------------------------------------
function setPlane(key) {
  planeKey = key;
  const p = PLANES[key];
  layout = new PlaneLayout(p.rows, p.blocks);
  plan = new BoardingPlan(layout, p.maxZones);
  brush = Math.min(1, p.maxZones - 1);
  $("speed").value = layout.seatCount <= 24 ? "1" : layout.seatCount <= 60 ? "2" : "10";
  geo = makeGeo();
  reset();
}

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
const tickMs = () => BASE_TICK_MS / Number($("speed").value);
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

function makeSim() {
  return new BoardingSim(layout, plan, seed, { moodTicks: PLANES[planeKey].target });
}

// --- flow --------------------------------------------------------------------
function reset() {
  sim = makeSim();
  phase = "plan";
  acc = 0;
  lastEarned = 0;
  snapTo(true);
  refresh();
}
function start() {
  sim = makeSim();
  snapTo(true);
  phase = "running";
}
function finish() {
  phase = "done";
  lastEarned = PAY_FINISH + (sim.tick <= PLANES[planeKey].target ? PAY_ON_TIME : 0);
  save.money += lastEarned;
  persist();
  refresh();
}

function ensureOrder() {
  const n = plan.zoneCount;
  if (callOrder.length !== n || callOrder.some((z) => z >= n)) callOrder = Array.from({ length: n }, (_, i) => i);
}

const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};

function refresh() {
  ensureOrder();
  const auto = save.autoCall && autoOn;
  const planning = phase === "plan";
  $("go").hidden = !auto;
  $("go").disabled = !planning;
  $("retry").disabled = planning;
  $("money").textContent = `$${save.money}`;
  $("analyze").href = `stats.html#p=${planeKey}&z=${plan.zoneOfSeat.join("")}`;
  renderZones(auto, planning);
  renderUpgrade();
}

// One row per zone: swatch, name, Paint (choose the brush) and Call (send that zone to the gate).
function renderZones(auto, planning) {
  const counts = Array(plan.maxZones).fill(0);
  for (const z of plan.zoneOfSeat) counts[z]++;

  const calling = $("calling");
  calling.hidden = !save.autoCall;
  calling.innerHTML = "";
  if (save.autoCall) {
    for (const [value, text] of [[false, "Manual"], [true, "Auto"]]) {
      const radio = el("input", { type: "radio", name: "calling", checked: auto === value, disabled: !planning });
      radio.onchange = () => { autoOn = save.autoOn = value; persist(); refresh(); };
      calling.append(el("label", {}, radio, ` ${text}`));
    }
  }

  $("callHead").style.visibility = auto ? "hidden" : "visible";
  const rows = $("zoneRows");
  rows.innerHTML = "";
  for (let z = 0; z < plan.maxZones; z++) {
    const paintBtn = el("button", { className: "paint" + (z === brush ? " active" : ""), textContent: "Paint", disabled: !planning });
    paintBtn.onclick = () => { brush = z; renderZones(auto, planning); };
    const callBtn = el("button", { className: "call", textContent: `Call ${z + 1}`,
      disabled: sim.isReleased(z) || z >= sim.zoneCount || counts[z] === 0 || phase === "done" });
    callBtn.style.background = ZONE_COLORS[z];
    callBtn.style.visibility = auto ? "hidden" : "visible";
    callBtn.onclick = () => {
      if (phase === "plan") start();
      snapTo(false);
      sim.releaseZone(z);
      refresh();
    };
    const swatch = el("span", { className: "swatch" });
    swatch.style.background = ZONE_COLORS[z];
    rows.append(el("div", { className: "zone-row" }, swatch,
      el("span", { className: "zone-name" }, `Zone ${z + 1}`, el("span", { className: "zone-count", textContent: `${counts[z]} seats` })),
      paintBtn, callBtn));
  }

  const order = $("order");
  order.innerHTML = "";
  if (auto) {
    order.append(el("span", { className: "proto", textContent: "Auto-call order:" }));
    callOrder.forEach((z, i) => {
      const move = (d) => { [callOrder[i], callOrder[i + d]] = [callOrder[i + d], callOrder[i]]; refresh(); };
      const left = el("button", { className: "tiny", textContent: "◀", disabled: i === 0 || !planning });
      const right = el("button", { className: "tiny", textContent: "▶", disabled: i === callOrder.length - 1 || !planning });
      left.onclick = () => move(-1);
      right.onclick = () => move(1);
      const chip = el("span", { className: "chip" }, left, `Zone ${z + 1}`, right);
      chip.style.background = ZONE_COLORS[z];
      order.append(chip);
    });
  }
  $("zoneHint").textContent = auto
    ? "Drag across seats to paint, then press Go. Zones are called in the order above."
    : `Pick a zone's Paint button, then drag across seats (up to ${plan.maxZones} zones here). Call zones in any order; the first call starts boarding.`;
}

function renderUpgrade() {
  const box = $("upgradeBox");
  box.innerHTML = "";
  if (save.autoCall) {
    box.append(el("div", { className: "proto", textContent: "✓ Auto-call zones (owned)" }));
    return;
  }
  const buy = el("button", { className: "upgrade", textContent: `Auto-call zones: $${AUTO_CALL_COST}`, disabled: save.money < AUTO_CALL_COST });
  buy.onclick = () => { save.money -= AUTO_CALL_COST; save.autoCall = true; autoOn = save.autoOn = true; persist(); refresh(); };
  box.append(buy, el("div", { className: "proto", textContent: "Calls the next zone as soon as the lounge line clears." }));
}

$("plane").innerHTML = Object.entries(PLANES).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join("");
$("plane").onchange = () => setPlane($("plane").value);
$("go").onclick = () => { start(); refresh(); };
$("retry").onclick = reset;
$("new").onclick = () => { seed++; reset(); };
// --- painting ------------------------------------------------------------------
function seatAt(pt) {
  const half = geo.cell * 0.45;
  for (let s = 0; s < layout.seatCount; s++) {
    const p = seatPos(s);
    if (Math.abs(pt.x - p.x) < half && Math.abs(pt.y - p.y) < half) return s;
  }
  return -1;
}
function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) * canvas.width) / r.width, y: ((e.clientY - r.top) * canvas.height) / r.height };
}
function paint(s) {
  if (plan.zoneOfSeat[s] === paintZone) return;
  plan.paint(s, paintZone);
  sim = makeSim(); // the sim reads zones at construction
  snapTo(true);
  refresh();
}
canvas.addEventListener("pointerdown", (e) => {
  mouse = canvasPoint(e);
  if (phase !== "plan") return;
  const s = seatAt(mouse);
  if (s < 0) return;
  painting = true;
  paintZone = plan.zoneOfSeat[s] === brush ? 0 : brush; // clicking a seat already in the brush zone clears it
  paint(s);
  canvas.setPointerCapture?.(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  const prev = mouse;
  mouse = canvasPoint(e);
  if (!painting) return;
  // Sample along the drag so fast moves don't skip seats.
  const steps = prev ? Math.ceil(Math.hypot(mouse.x - prev.x, mouse.y - prev.y) / (geo.cell / 3)) : 0;
  for (let i = 0; i <= steps; i++) {
    const s = seatAt(prev && steps ? lerp(prev, mouse, i / steps) : mouse);
    if (s >= 0) paint(s);
  }
});
canvas.addEventListener("pointerup", () => { painting = false; });
canvas.addEventListener("pointerleave", () => { mouse = null; });

// --- loop ----------------------------------------------------------------------
// The sim advances in fixed ticks; frame time only drives the tick accumulator and the blend.
function frame(t) {
  now = t;
  const dt = last ? t - last : 0;
  last = t;
  if (phase === "running") {
    acc += dt;
    let guard = 0;
    while (acc >= tickMs() && !sim.done && guard++ < 50) {
      acc -= tickMs();
      snapTo(false);
      if (save.autoCall && autoOn) sim.autoCall(callOrder);
      const before = sim.zonesReleased;
      sim.step();
      if (sim.zonesReleased !== before) refresh();
    }
    if (guard >= 50) acc = 0;
    if (sim.done) finish();
  }
  draw();
  requestAnimationFrame(frame);
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
  ctx.fillStyle = "#cfd6ea"; ctx.fillText(PLANES[planeKey].name, fx, geo.top - cell - 6);

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

  // Status
  const target = PLANES[planeKey].target;
  $("status").textContent = phase === "done"
    ? `${sim.tick <= target ? "ON TIME" : "LATE"}: ${sim.tick} ticks (target ${target}). Average mood ${Math.round(sim.averageMood())}. Earned $${lastEarned}.`
    : phase === "plan"
      ? `Paint zones, then ${save.autoCall && autoOn ? "press Go" : "call a zone to start boarding"}. Target ${target} ticks. Seed ${seed}.`
      : `Tick ${sim.tick} / target ${target}. Zones called ${sim.zonesReleased}/${sim.zoneCount}. Seated ${sim.seatedCount}/${sim.passengers.length}.`;

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

setPlane("tier1");
requestAnimationFrame(frame);
