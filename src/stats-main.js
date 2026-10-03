// Stats page: overlay boarding-time distributions for several plans over many seeded flights.
import { PlaneLayout } from "./sim/layout.js";
import { runBatch, summarize, bestGap, optimizePlan, searchRowBands, evenBands, seedRange } from "./sim/stats.js";

const layout = new PlaneLayout();
const $ = (id) => document.getElementById(id);
const canvas = $("c"), ctx = canvas.getContext("2d");
const COLORS = ["#f2a03d", "#4f9dde", "#7fd17f", "#e0645c", "#c28cf0", "#5fd0c8", "#e6d35a"];
const EVAL_MAX_ZONES = 3; // evaluation never clamps zones; the cap only matters when painting

let zones = 2;
let series = [];
const yourPlan = (() => {
  const m = /z=([0-2]+)/.exec(location.hash);
  return m && m[1].length === layout.seatCount ? [...m[1]].map(Number) : null;
})();

function resetSeries() {
  series = [];
  if (yourPlan) series.push({ name: "Your plan", zoneOfSeat: yourPlan, gap: null });
  series.push({ name: "Standing line", zoneOfSeat: Array(layout.seatCount).fill(0), gap: null });
  series.push({ name: `Even bands (${zones}), rear first`, zoneOfSeat: evenBands(layout, zones), gap: null });
}
function setSeries(prefix, items) {
  series = series.filter((s) => !s.name.startsWith(prefix));
  series.push(...items);
}

function recompute() {
  const n = Math.max(100, Number($("n").value) | 0);
  const seeds = seedRange(10001, n); // fixed seeds: same plan => same curve every time
  const tune = seedRange(1, 100);
  for (const s of series) {
    s.gap ??= bestGap(layout, s.zoneOfSeat, tune, 12, EVAL_MAX_ZONES).gap; // best release gap, picked on separate seeds
    s.ticks = runBatch(layout, s.zoneOfSeat, s.gap, seeds, EVAL_MAX_ZONES);
    s.sum = summarize(s.ticks);
  }
  render();
}

function render() {
  const lo = Math.min(...series.map((s) => s.sum.min)) - 1, hi = Math.max(...series.map((s) => s.sum.max)) + 1;
  const peak = Math.max(...series.flatMap((s) => [...s.sum.hist.values()].map((c) => c / s.sum.n)));
  const W = canvas.width, H = canvas.height, L = 50, B = 36, T = 16, R = 16;
  const x = (t) => L + ((t - lo) / (hi - lo)) * (W - L - R);
  const y = (p) => H - B - (p / peak) * (H - B - T);
  ctx.clearRect(0, 0, W, H);
  ctx.font = "12px system-ui"; ctx.fillStyle = "#a9b2cc"; ctx.strokeStyle = "#3a4258";
  for (let t = Math.ceil(lo); t <= hi; t++) {
    if (t % 2) continue;
    ctx.fillText(t, x(t) - 6, H - B + 16);
    ctx.beginPath(); ctx.moveTo(x(t), T); ctx.lineTo(x(t), H - B); ctx.stroke();
  }
  ctx.fillText("boarding time (ticks)", W / 2 - 50, H - 6);
  ctx.fillText("share of simulation flights", 4, 14);
  const bw = (W - L - R) / (hi - lo);
  series.forEach((s, i) => {
    const color = COLORS[i % COLORS.length];
    ctx.fillStyle = color; ctx.globalAlpha = 0.4;
    for (const [t, c] of s.sum.hist) ctx.fillRect(x(t) - bw / 2, y(c / s.sum.n), bw, H - B - y(c / s.sum.n));
    ctx.globalAlpha = 1;
    // Matching normal curve, to eyeball how bell-shaped it is.
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
    for (let t = lo; t <= hi; t += 0.1) {
      const p = Math.exp(-0.5 * ((t - s.sum.mean) / s.sum.sd) ** 2) / (s.sum.sd * Math.sqrt(2 * Math.PI));
      t === lo ? ctx.moveTo(x(t), y(p)) : ctx.lineTo(x(t), y(p));
    }
    ctx.stroke(); ctx.lineWidth = 1;
  });
  const f = (v) => v.toFixed(2);
  $("t").innerHTML = "<tr><th>Plan</th><th>Gap</th><th>Mean</th><th>Std dev</th><th>P10</th><th>Median</th><th>P90</th></tr>" +
    series.map((s, i) => `<tr><td><span class="sw" style="background:${COLORS[i % COLORS.length]}"></span>${s.name}</td><td>${s.gap}</td><td>${f(s.sum.mean)}</td><td>${f(s.sum.sd)}</td><td>${s.sum.p10}</td><td>${s.sum.median}</td><td>${s.sum.p90}</td></tr>`).join("");
}

function busy(msg, work) {
  $("bands").disabled = $("opt").disabled = true; $("note").textContent = msg;
  setTimeout(() => { work(); $("bands").disabled = $("opt").disabled = false; }, 30);
}

$("bands").onclick = () => busy("Trying every row-band layout...", () => {
  const top = searchRowBands({ layout, zones, trainSeeds: seedRange(1, 100), top: 3 });
  setSeries("Band #", top.map((r, i) => ({ name: `Band #${i + 1}: ${r.label}`, zoneOfSeat: r.zoneOfSeat, gap: r.gap })));
  recompute();
  $("note").textContent = "Every contiguous row-band layout was tried on seeds 1-100; the top 3 are shown, scored on separate seeds.";
});
$("opt").onclick = () => busy("Local search (a few seconds)...", () => {
  const best = optimizePlan({ layout, trainSeeds: seedRange(1, 100), maxZones: zones, starts: series.map((s) => s.zoneOfSeat), restarts: 6 });
  setSeries("Local search", [{ name: "Local search best", zoneOfSeat: best.zoneOfSeat, gap: best.gap }]);
  recompute();
  $("note").textContent = "Local search tuned on seeds 1-100; the curves use different seeds, so they are not flattered by overfitting.";
});
$("zones").onchange = () => { zones = Number($("zones").value); resetSeries(); $("note").textContent = ""; recompute(); };
$("n").onchange = recompute;
resetSeries();
recompute();
