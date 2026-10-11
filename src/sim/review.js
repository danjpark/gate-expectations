import { State } from "./passenger.js";

// Pure, read-only review. Thresholds and wording are placeholders for playtesting.
// Wording cycles deterministically from flight seed/passenger/category; it consumes no RNG.
const PHRASES = {
  gate: ["I could have knitted a jet bridge while waiting at the gate.", "My boarding pass and I grew old together in that lounge."],
  blocked: ["We barely moved on the way to my seat.", "I learned everyone's luggage brand while we stood still."],
  seated: ["I sat on the plane forever before we left.", "I got seated early. Apparently that was the whole day's activity."],
  meltdown: ["I needed a moment. The entire airport got one too.", "My patience departed before the flight did."],
  clean: ["I knew exactly when it was my turn.", "Straight to my seat. A suspiciously competent airport."],
  quick: ["That was quick! My airport sandwich is still warm.", "Boarding finished before I could complain about boarding."],
  calm: ["I arrived at my seat still smiling.", "My patience survived. Please give the gate agent a biscuit."],
};

export function jamLocation(jam) {
  if (jam.kind === "jet bridge") return `jet bridge, cell ${jam.cell + 1}`;
  return `aisle ${jam.lane + 1}, ${jam.cell === 0 ? "entrance" : `row ${jam.cell}`} (${jam.kind})`;
}

export function buildReview(sim, { target, money = 0, previous = null } = {}) {
  const complaints = [], compliments = [];
  const add = (list, p, category, severity, evidence) => list.push({
    passengerId: p.id, name: p.name, category, severity, evidence,
    text: PHRASES[category][((sim.seed >>> 0) + p.id + Object.keys(PHRASES).indexOf(category)) % PHRASES[category].length],
  });
  for (const p of sim.passengers) {
    const tolerance = p.moodTicks * (1 + 0.5 * p.patience);
    if (p.gateWait >= Math.max(12, tolerance * 0.45)) add(complaints, p, "gate", p.gateWait / tolerance, `${p.gateWait} ticks at gate`);
    if (p.blocked >= Math.max(6, tolerance * 0.15)) add(complaints, p, "blocked", 2 * p.blocked / tolerance, `${p.blocked} blocked ticks`);
    if (p.seatedWait >= Math.max(12, tolerance * 0.35)) add(complaints, p, "seated", p.seatedWait / tolerance, `${p.seatedWait} ticks after sitting`);
    if (sim.meltdown?.passengerId === p.id) add(complaints, p, "meltdown", 2, `${sim.meltdown.penalty} disruption ticks`);
    if (p.state === State.SEATED && p.blocked === 0 && p.gateWait <= p.moodTicks * 0.25) add(compliments, p, "clean", 1, "No blockage; short gate wait");
    if (sim.done && sim.tick <= target && p.mood() >= 60) add(compliments, p, "quick", 0.8, `${sim.tick} ticks; target ${target}`);
    if (p.state === State.SEATED && p.mood() >= 80) add(compliments, p, "calm", p.mood() / 100, `Mood ${p.mood()}/100`);
  }
  // One comment per category and passenger, at most three. No invented filler.
  const select = (items) => {
    const categories = new Set(), passengers = new Set(), chosen = [];
    items.sort((a, b) => b.severity - a.severity || a.passengerId - b.passengerId);
    for (const item of items) {
      if (categories.has(item.category) || passengers.has(item.passengerId)) continue;
      chosen.push(item); categories.add(item.category); passengers.add(item.passengerId);
      if (chosen.length === 3) break;
    }
    return chosen;
  };
  const mood = sim.averageMood();
  return {
    ticks: sim.tick, target, onTime: sim.tick <= target, mood, money,
    complaints: select(complaints), compliments: select(compliments),
    worstJam: sim.worstJam ? { ...sim.worstJam, name: sim.passengers[sim.worstJam.passengerId].name, location: jamLocation(sim.worstJam) } : null,
    meltdown: sim.meltdown ? { ...sim.meltdown, name: sim.passengers[sim.meltdown.passengerId].name } : null,
    assistance: sim.shuffleAssist ? { ...sim.shuffleAssist, name: sim.passengers[sim.shuffleAssist.passengerId].name } : null,
    comparison: previous ? { previous: { ...previous }, ticks: sim.tick - previous.ticks, mood: mood - previous.mood } : null,
  };
}
