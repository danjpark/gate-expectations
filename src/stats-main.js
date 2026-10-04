// Stats page: overlay boarding-time distributions for several zone plans, with a map of each plan.
// All simulation runs happen in stats-worker.js.
import { PlaneLayout, PLANES } from "./sim/layout.js";
import { summarize, seedRange } from "./sim/stats.js";
import { evenPattern } from "./sim/patterns.js";
import { ZONE_COLORS } from "./view/palette.js";
import { WorkerClient } from "./analysis/worker-client.js";

const $ = (id) => document.getElementById(id);
const canvas = $("c"), ctx = canvas.getContext("2d");
const SERIES_COLORS = ["#e6d35a", "#5fd0c8", "#f78fb3", "#b0b8ff", "#ff9e7a", "#9be37a", "#ffffff", "#c9a27e"];


// --- worker plumbing -----------------------------------------------------
const client = new WorkerClient(() => new Worker(new URL("./stats-worker.js", import.meta.url), { type: "module" }));
let generation = 0;
const hashArgs = new URLSearchParams(location.hash.slice(1));
const importedOrder = (hashArgs.get("o") || "").split(",").filter(Boolean).map(Number);
const validOrder = importedOrder.length > 0 && importedOrder.every((z, i) =>
  Number.isInteger(z) && z >= 0 && z < importedOrder.length && importedOrder.indexOf(z) === i);
const importedPlanFits = () => hashPlan && hashPlane === $("preset").value &&
  hashPlan.length === layout.seatCount && hashPlan.every((z) => z < ZONE_COLORS.length);
const analysisOrder = () => {
  const count = Math.max(zones, importedPlanFits() ? Math.max(...hashPlan) + 1 : 0);
  return validOrder && hashPlane === $("preset").value && importedOrder.length >= count
    ? importedOrder : Array.from({ length: count }, (_, i) => i);
};
const call = (type, args, onProgress) => client.request(type,
  { rows: layout.rows, blocks: layout.blocks, order: analysisOrder(), ...args }, onProgress);
const withErrors = (action) => async (...args) => {
  try { await action(...args); }
  catch (error) {
    if (error.name !== "AbortError") setBusy(false, `Analysis failed: ${error.message}`);
  }
};

// --- state ---------------------------------------------------------------
let layout = new PlaneLayout(12, 1);
let zones = 2;
let series = [];
const big = () => layout.seatCount > 60;
const trainSeeds = () => seedRange(1, big() ? 30 : 100);
const evalSeeds = () => seedRange(10001, Math.max(100, Math.min(20000, Number($("n").value) | 0))); // separate from training seeds

const hashPlan = (() => {
  const m = /z=([0-9]+)/.exec(location.hash);
  return m ? [...m[1]].map(Number) : null;
})();

function resetSeries() {
  series = [];
  if (importedPlanFits()) series.push({ name: "Your plan (from the game)", zoneOfSeat: hashPlan });
  series.push({ name: "Standing line (1 zone)", zoneOfSeat: Array(layout.seatCount).fill(0) });
  series.push({ name: "Rows, back to front · even zones", zoneOfSeat: evenPattern(layout, 0, zones) });
  if (layout.maxDistance > 0) series.push({ name: "Window to aisle · even zones", zoneOfSeat: evenPattern(layout, 90, zones) });
}

async function evaluateMissing() {
  const gen = generation;
  $("n").value = evalSeeds().length;
  const todo = series.filter((s) => !s.sum);
  if (!todo.length) return render();
  setBusy(true, `Running ${todo.length * evalSeeds().length} simulation flights...`);
  const ticks = await call("evaluate", { plans: todo.map((s) => s.zoneOfSeat), seeds: evalSeeds() });
  if (gen !== generation) return;
  todo.forEach((s, i) => { s.ticks = ticks[i]; s.sum = summarize(ticks[i]); });
  setBusy(false, "");
  render();
}

function setBusy(on, msg) {
  $("search").disabled = $("refine").disabled = on;
  if (msg !== undefined) $("note").textContent = msg;
}

// Any change to the plane or zone count starts over.
function restart() {
  generation++;
  client.stop();
  const blocks = $("blocks").value.split(/[^0-9]+/).map(Number).filter((n) => n > 0).map((n) => Math.min(n, 6));
  layout = new PlaneLayout(Math.max(2, Math.min(80, Number($("rows").value) | 0)), blocks.length >= 2 ? blocks : [1, 1]);
  $("blocks").value = layout.label;
  zones = Number($("zones").value);
  $("policy").textContent = `Queue-empty auto-call · order ${analysisOrder().map((z) => z + 1).join(" → ")}`;
  resetSeries();
  render();
  setBusy(false, "");
  withErrors(evaluateMissing)();
}

$("preset").innerHTML = Object.entries(PLANES).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join("") +
  `<option value="custom">Custom</option>`;
$("preset").onchange = () => {
  const p = PLANES[$("preset").value];
  if (p) {
    $("rows").value = p.rows; $("blocks").value = p.blocks.join("-");
    $("zones").value = p.maxZones;
    $("n").value = p.rows * p.blocks.reduce((a, b) => a + b, 0) > 60 ? 300 : 2000;
  }
  restart();
};
$("rows").onchange = $("blocks").onchange = () => { $("preset").value = "custom"; restart(); };
$("zones").onchange = restart;
$("n").onchange = () => {
  generation++;
  client.stop();
  for (const s of series) { s.sum = null; s.ticks = []; }
  render();
  withErrors(evaluateMissing)();
};

$("search").onclick = withErrors(async () => {
  const gen = generation;
  setBusy(true, "Searching...");
  const found = await call("search", { zones, trainSeeds: trainSeeds() }, (t) => { $("note").textContent = `Searching: ${t}`; });
  if (gen !== generation) return;
  series = series.filter((s) => !s.name.startsWith("Pattern #"));
  found.slice(0, 3).forEach((r, i) => series.push({ name: `Pattern #${i + 1}: ${r.label}`, zoneOfSeat: r.zoneOfSeat }));
  await evaluateMissing();
  if (gen !== generation) return;
  $("note").textContent = `Patterns tuned on ${trainSeeds().length} training seeds; curves use ${evalSeeds().length} different seeds.`;
});

$("refine").onclick = withErrors(async () => {
  const gen = generation;
  if (!series.length) return;
  setBusy(true, "Refining...");
  const r = await call("refine", { zones, trainSeeds: trainSeeds(), candidates: series.map((s) => ({name:s.name, zoneOfSeat:s.zoneOfSeat})), budget: big() ? 300 : 400 },
    (t) => { $("note").textContent = `Refining: ${t}`; });
  if (gen !== generation) return;
  series = series.filter((s) => !s.name.startsWith("Refined"));
  series.push({ name: `${r.label}, from "${r.startName.split(":")[0]}"`, zoneOfSeat: r.zoneOfSeat });
  await evaluateMissing();
  if (gen !== generation) return;
  $("note").textContent = "Refinement tries single-seat zone changes and keeps those that help on the training seeds.";
});

// --- drawing -------------------------------------------------------------
function render() {
  const shown = series.filter((s) => s.sum);
  if (!shown.length) { ctx.clearRect(0, 0, canvas.width, canvas.height); $("t").innerHTML = ""; return; }
  const lo = Math.min(...shown.map((s) => s.sum.min)), hi = Math.max(...shown.map((s) => s.sum.max)) + 1;
  const bin = Math.max(1, Math.ceil((hi - lo) / 60));
  const hists = shown.map((s) => {
    const h = new Map();
    for (const t of s.ticks) { const b = lo + Math.floor((t - lo) / bin) * bin; h.set(b, (h.get(b) ?? 0) + 1 / s.sum.n); }
    return h;
  });
  const peak = Math.max(...hists.flatMap((h) => [...h.values()]));
  const W = canvas.width, H = canvas.height, L = 50, B = 36, T = 18, R = 16;
  const x = (t) => L + ((t - lo) / (hi - lo)) * (W - L - R);
  const y = (p) => H - B - (p / peak) * (H - B - T);
  ctx.clearRect(0, 0, W, H);
  ctx.font = "12px system-ui"; ctx.fillStyle = "#a9b2cc"; ctx.strokeStyle = "#3a4258";
  const tickStep = niceStep((hi - lo) / 12);
  for (let t = Math.ceil(lo / tickStep) * tickStep; t <= hi; t += tickStep) {
    ctx.fillText(t, x(t) - 8, H - B + 16);
    ctx.beginPath(); ctx.moveTo(x(t), T); ctx.lineTo(x(t), H - B); ctx.stroke();
  }
  ctx.fillText("boarding time (ticks)", W / 2 - 50, H - 6);
  ctx.fillText(`share of simulation flights${bin > 1 ? ` (bins of ${bin} ticks)` : ""}`, 4, 13);
  shown.forEach((s, i) => {
    const color = SERIES_COLORS[series.indexOf(s) % SERIES_COLORS.length];
    ctx.fillStyle = color; ctx.globalAlpha = 0.4;
    for (const [b, p] of hists[i]) ctx.fillRect(x(b), y(p), x(b + bin) - x(b) - 1, H - B - y(p));
    ctx.globalAlpha = 1;
    if (s.sum.sd === 0) return; // a point mass has no finite normal density
    // Normal curve with the same mean and spread, scaled to the bin width.
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
    for (let t = lo; t <= hi; t += (hi - lo) / 300) {
      const p = bin * Math.exp(-0.5 * ((t - s.sum.mean) / s.sum.sd) ** 2) / (s.sum.sd * Math.sqrt(2 * Math.PI));
      t === lo ? ctx.moveTo(x(t), y(p)) : ctx.lineTo(x(t), y(p));
    }
    ctx.stroke(); ctx.lineWidth = 1;
  });

  $("legend").innerHTML = "Zone maps: front of the plane on the left, window seats on the top and bottom edges." +
    ZONE_COLORS.slice(0, Math.max(zones, ...series.map((s) => Math.max(...s.zoneOfSeat) + 1)))
      .map((c, i) => `<span style="background:${c}"></span>zone ${i + 1}`).join("");
  const f = (v) => v.toFixed(1);
  const table = $("t");
  table.innerHTML = "<tr><th class='l'>Zone map</th><th class='l'>Plan</th><th>Mean</th><th>Std dev</th><th>P10</th><th>Median</th><th>P90</th></tr>";
  for (const s of series) {
    const tr = table.insertRow();
    const map = tr.insertCell(); map.className = "map"; map.appendChild(zoneMap(s.zoneOfSeat));
    const name = tr.insertCell(); name.className = "l";
    name.innerHTML = `<span class="sw" style="background:${SERIES_COLORS[series.indexOf(s) % SERIES_COLORS.length]}"></span>`;
    name.append(s.name);
    for (const v of s.sum ? [f(s.sum.mean), f(s.sum.sd), s.sum.p10, s.sum.median, s.sum.p90] : ["...", "", "", "", ""]) tr.insertCell().textContent = v;
  }
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? 10 * p;
}

// Seat map: rows left (front) to right (back); seat columns top to bottom with a gap for each aisle.
function zoneMap(zoneOfSeat) {
  const cell = Math.max(3, Math.min(10, Math.floor(240 / layout.rows)));
  const c = document.createElement("canvas");
  c.width = layout.rows * cell; c.height = (layout.cols + layout.aisleCount) * cell;
  const g = c.getContext("2d");
  for (let s = 0; s < layout.seatCount; s++) {
    const col = layout.seatCol(s), yCell = col + layout.colInfo[col].block;
    g.fillStyle = ZONE_COLORS[zoneOfSeat[s] % ZONE_COLORS.length];
    g.fillRect(layout.seatRow(s) * cell, yCell * cell, cell - 1, cell - 1);
  }
  return c;
}

window.addEventListener("resize", render);
const hashPlane = /p=(\w+)/.exec(location.hash)?.[1];
if (PLANES[hashPlane]) $("preset").value = hashPlane;
$("preset").onchange();
