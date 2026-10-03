// Stats page: overlay boarding-time distributions for several plans over many seeded flights.
import { PlaneLayout } from "./sim/layout.js";
import { runBatch, summarize, bestGap, optimizePlan, seedRange } from "./sim/stats.js";

const layout = new PlaneLayout();
const $ = (id) => document.getElementById(id);
const canvas = $("c"), ctx = canvas.getContext("2d");
const COLORS = ["#f2a03d", "#4f9dde", "#7fd17f", "#e0645c", "#c28cf0"];

const rows = (f) => Array.from({ length: layout.seatCount }, (_, s) => (f(layout.seatRow(s)) ? 0 : 1));
const series = [];
function addSeries(name, zoneOfSeat, gap) {
  const i = series.findIndex((s) => s.name === name);
  if (i >= 0) series.splice(i, 1);
  series.push({ name, zoneOfSeat, gap });
}

// "Your plan" arrives from the game as a hash like #z=0011...
const m = /z=([01]+)/.exec(location.hash);
if (m && m[1].length === layout.seatCount) addSeries("Your plan", [...m[1]].map(Number), null);
addSeries("Standing line", rows(() => true), null);
addSeries("Back half first", rows((r) => r >= layout.rows / 2), null);

function recompute() {
  const n = Math.max(100, Number($("n").value) | 0), target = Number($("target").value) || Infinity;
  const seeds = seedRange(10001, n); // fixed seeds: same plan => same curve every time
  const tune = seedRange(1, 100);
  for (const s of series) {
    s.gap ??= bestGap(layout, s.zoneOfSeat, tune).gap; // best release gap, picked on separate seeds
    s.ticks = runBatch(layout, s.zoneOfSeat, s.gap, seeds);
    s.sum = summarize(s.ticks, target);
  }
  render(target);
}

function render(target) {
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
  ctx.fillText("share of flights", 4, 14);
  const bw = (W - L - R) / (hi - lo);
  series.forEach((s, i) => {
    ctx.fillStyle = COLORS[i % COLORS.length]; ctx.globalAlpha = 0.45;
    for (const [t, c] of s.sum.hist) ctx.fillRect(x(t) - bw / 2, y(c / s.sum.n), bw, H - B - y(c / s.sum.n));
    ctx.globalAlpha = 1;
    // Matching normal curve, to eyeball how bell-shaped it is.
    ctx.strokeStyle = COLORS[i % COLORS.length]; ctx.lineWidth = 2; ctx.beginPath();
    for (let t = lo; t <= hi; t += 0.1) {
      const p = Math.exp(-0.5 * ((t - s.sum.mean) / s.sum.sd) ** 2) / (s.sum.sd * Math.sqrt(2 * Math.PI));
      t === lo ? ctx.moveTo(x(t), y(p)) : ctx.lineTo(x(t), y(p));
    }
    ctx.stroke(); ctx.lineWidth = 1;
  });
  if (Number.isFinite(target)) {
    ctx.strokeStyle = "#fff"; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(x(target + 0.5), T); ctx.lineTo(x(target + 0.5), H - B); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "#fff"; ctx.fillText("target", x(target + 0.5) + 4, T + 10);
  }
  const f = (v) => v.toFixed(2);
  $("t").innerHTML = "<tr><th>Plan</th><th>Gap</th><th>Mean</th><th>Std dev</th><th>P10</th><th>Median</th><th>P90</th><th>On time</th></tr>" +
    series.map((s, i) => `<tr><td><span class="sw" style="background:${COLORS[i % COLORS.length]}"></span>${s.name}</td><td>${s.gap}</td><td>${f(s.sum.mean)}</td><td>${f(s.sum.sd)}</td><td>${s.sum.p10}</td><td>${s.sum.median}</td><td>${s.sum.p90}</td><td>${(s.sum.onTime * 100).toFixed(0)}%</td></tr>`).join("");
}

$("opt").onclick = () => {
  $("opt").disabled = true; $("note").textContent = "Searching (a few seconds)...";
  setTimeout(() => {
    const starts = series.map((s) => s.zoneOfSeat);
    const best = optimizePlan({ layout, trainSeeds: seedRange(1, 100), starts, restarts: 6 });
    addSeries("Searched best", best.zoneOfSeat, best.gap);
    recompute();
    $("note").textContent = "Search picks the plan on seeds 1-100, but the curve above uses 2000 different seeds, so it is not flattered by overfitting.";
    $("opt").disabled = false;
  }, 30);
};
$("n").onchange = $("target").onchange = recompute;
recompute();
