// Browser controller: input, flight flow, persistence and fixed-tick scheduling.
// Rendering and interpolation live in view/; boarding rules live in sim/.
import { PlaneLayout, PLANES } from "./sim/layout.js";
import { BoardingPlan } from "./sim/plan.js";
import { BoardingSim } from "./sim/boarding.js";
import { createBoardingView } from "./view/boarding-view.js";
import { ZONE_COLORS } from "./view/palette.js";
import { normalizeSave, flightReward, AUTO_CALL_COST } from "./game/progress.js";

const BASE_TICK_MS = 500;
const canvas = document.getElementById("c");
const view = createBoardingView(canvas);
const $ = (id) => document.getElementById(id);

let planeKey, layout, plan, sim, phase;
let seed = 1, acc = 0, last = 0, now = 0;
let brush = 1, paintZone = 1, painting = false, mouse = null;
let callOrder = [], lastEarned = 0;
const save = loadSave();
let autoOn = save.autoOn;

// --- save (per-browser convenience; safe to lose) ---------------------------
function loadSave() {
  try { return normalizeSave(JSON.parse(localStorage.getItem("ge-save") || "{}")); }
  catch { return normalizeSave(null); }
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
  view.configure(layout);
  renderBrushes();
  reset();
}

const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const tickMs = () => BASE_TICK_MS / Number($("speed").value);
const snapTo = (instant) => view.capture(sim, now, tickMs(), instant);

// --- flow --------------------------------------------------------------------
function reset() {
  sim = new BoardingSim(layout, plan, seed);
  phase = "plan";
  painting = false;
  acc = 0;
  lastEarned = 0;
  snapTo(true);
  refresh();
}
function start() {
  sim = new BoardingSim(layout, plan, seed);
  snapTo(true);
  phase = "running";
  painting = false;
  acc = 0;
}
function finish() {
  phase = "done";
  lastEarned = flightReward(sim.tick, PLANES[planeKey].target);
  save.money += lastEarned;
  persist();
  refresh();
}

function ensureOrder() {
  const n = plan.zoneCount;
  if (callOrder.length !== n || callOrder.some((z) => z >= n)) callOrder = Array.from({ length: n }, (_, i) => i);
}

function refresh() {
  ensureOrder();
  const manual = !(save.autoCall && autoOn);
  $("go").style.display = manual ? "none" : "";
  $("go").disabled = phase !== "plan";
  $("retry").disabled = phase === "plan";
  $("money").textContent = `$${save.money}`;
  $("analyze").href = `stats.html#p=${planeKey}&z=${plan.zoneOfSeat.join("")}&o=${callOrder.join(",")}`;
  for (const b of $("brushBar").querySelectorAll("button")) b.disabled = phase !== "plan";

  // Manual calling: any zone, in any order; the first call starts the flight.
  const callBar = $("callBar");
  callBar.innerHTML = "";
  if (manual && phase !== "done") {
    for (let z = 0; z < plan.zoneCount; z++) {
      const b = document.createElement("button");
      b.className = "zone";
      b.style.background = ZONE_COLORS[z];
      b.textContent = `Call zone ${z + 1}`;
      b.disabled = sim.isReleased(z);
      b.onclick = () => {
        if (phase === "plan") start();
        snapTo(false);
        sim.releaseZone(z);
        refresh();
      };
      callBar.appendChild(b);
    }
  }
  renderAutoBar();
}

function renderAutoBar() {
  const bar = $("autoBar");
  bar.innerHTML = "";
  if (!save.autoCall) {
    const b = document.createElement("button");
    b.textContent = `Upgrade: auto-call zones ($${AUTO_CALL_COST})`;
    b.disabled = save.money < AUTO_CALL_COST || phase !== "plan";
    b.onclick = () => { save.money -= AUTO_CALL_COST; save.autoCall = true; autoOn = save.autoOn = true; persist(); refresh(); };
    bar.append(b, Object.assign(document.createElement("span"), { className: "label",
      textContent: " Calls the next zone as soon as the lounge line clears. Earn $ by finishing flights, more if on time." }));
    return;
  }
  const label = document.createElement("label");
  const box = Object.assign(document.createElement("input"), { type: "checkbox", checked: autoOn, disabled: phase !== "plan" });
  box.onchange = () => { autoOn = save.autoOn = box.checked; persist(); refresh(); };
  label.append(box, " Auto-call zones");
  bar.appendChild(label);
  if (!autoOn) return;
  bar.append(Object.assign(document.createElement("span"), { className: "label", textContent: "Order:" }));
  callOrder.forEach((z, i) => {
    const chip = Object.assign(document.createElement("span"), { className: "chip" });
    chip.style.background = ZONE_COLORS[z];
    const move = (d) => { [callOrder[i], callOrder[i + d]] = [callOrder[i + d], callOrder[i]]; refresh(); };
    const left = Object.assign(document.createElement("button"), { className: "small", textContent: "◀", disabled: i === 0 || phase !== "plan" });
    const right = Object.assign(document.createElement("button"), { className: "small", textContent: "▶", disabled: i === callOrder.length - 1 || phase !== "plan" });
    left.onclick = () => move(-1);
    right.onclick = () => move(1);
    chip.append(left, `Zone ${z + 1}`, right);
    bar.appendChild(chip);
  });
}

function renderBrushes() {
  const bar = $("brushBar");
  bar.innerHTML = "<span class='label'>Paint zone</span>";
  for (let z = 0; z < plan.maxZones; z++) {
    const b = document.createElement("button");
    b.className = "zone" + (z === brush ? " active" : "");
    b.style.background = ZONE_COLORS[z];
    b.textContent = z + 1;
    b.onclick = () => { brush = z; renderBrushes(); };
    bar.appendChild(b);
  }
  bar.append(Object.assign(document.createElement("span"), { className: "label",
    textContent: ` Drag across seats. Up to ${plan.maxZones} zones on this plane.` }));
}

$("plane").innerHTML = Object.entries(PLANES).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join("");
$("plane").onchange = () => setPlane($("plane").value);
$("go").onclick = () => { start(); refresh(); };
$("retry").onclick = reset;
$("new").onclick = () => { seed++; reset(); };

// --- painting ------------------------------------------------------------------
function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) * canvas.width) / r.width, y: ((e.clientY - r.top) * canvas.height) / r.height };
}
function paint(s) {
  if (plan.zoneOfSeat[s] === paintZone) return;
  plan.paint(s, paintZone);
  sim = new BoardingSim(layout, plan, seed); // the sim reads zones at construction
  snapTo(true);
  refresh();
}
canvas.addEventListener("pointerdown", (e) => {
  mouse = canvasPoint(e);
  if (phase !== "plan") return;
  const s = view.seatAt(mouse);
  if (s < 0) return;
  painting = true;
  paintZone = plan.zoneOfSeat[s] === brush ? 0 : brush; // clicking a seat already in the brush zone clears it
  paint(s);
  canvas.setPointerCapture?.(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  const prev = mouse;
  mouse = canvasPoint(e);
  if (!painting || phase !== "plan") return;
  // Sample along the drag so fast moves don't skip seats.
  const steps = prev ? Math.ceil(Math.hypot(mouse.x - prev.x, mouse.y - prev.y) / (view.cellSize / 3)) : 0;
  for (let i = 0; i <= steps; i++) {
    const s = view.seatAt(prev && steps ? lerp(prev, mouse, i / steps) : mouse);
    if (s >= 0) paint(s);
  }
});
const stopPainting = () => { painting = false; };
canvas.addEventListener("pointerup", stopPainting);
canvas.addEventListener("pointercancel", stopPainting);
canvas.addEventListener("lostpointercapture", stopPainting);
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
      const before = sim.zonesReleased;
      if (save.autoCall && autoOn) sim.autoCall(callOrder);
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
  view.draw({ sim, plan, mouse, planeName: PLANES[planeKey].name, now, tickDuration: tickMs() });
  // Status
  const target = PLANES[planeKey].target;
  $("status").textContent = phase === "done"
    ? `${sim.tick <= target ? "ON TIME" : "LATE"}: ${sim.tick} ticks (target ${target}). Average mood ${Math.round(sim.averageMood())}. Earned $${lastEarned}.`
    : phase === "plan"
      ? `Paint zones, then ${save.autoCall && autoOn ? "press Go" : "call a zone to start boarding"}. Target ${target} ticks. Seed ${seed}.`
      : `Tick ${sim.tick} / target ${target}. Zones called ${sim.zonesReleased}/${sim.zoneCount}. Seated ${sim.seatedCount}/${sim.passengers.length}.`;

}

setPlane("tier1");
requestAnimationFrame(frame);
