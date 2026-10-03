// Runs simulations off the main thread so the stats page stays responsive on big planes.
import { PlaneLayout } from "./sim/layout.js";
import { runBatch } from "./sim/stats.js";
import { searchPatterns, refineSeats } from "./sim/patterns.js";

self.onmessage = ({ data: { id, type, rows, blocks, ...args } }) => {
  const layout = new PlaneLayout(rows, blocks);
  const progress = (text) => self.postMessage({ id, progress: text });
  if (type === "evaluate") {
    self.postMessage({ id, result: args.plans.map((z) => runBatch(layout, z, args.seeds)) });
  } else if (type === "search") {
    self.postMessage({ id, result: searchPatterns({ layout, zones: args.zones, trainSeeds: args.trainSeeds, onProgress: progress }) });
  } else if (type === "refine") {
    self.postMessage({ id, result: refineSeats({ layout, zones: args.zones, trainSeeds: args.trainSeeds, start: args.start, budget: args.budget, onProgress: progress }) });
  }
};
