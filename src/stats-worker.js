// Runs simulations off the main thread so the stats page stays responsive on big planes.
import { PlaneLayout } from "./sim/layout.js";
import { runBatch, meanTicks } from "./sim/stats.js";
import { searchPatterns, refineSeats } from "./sim/patterns.js";

self.onmessage = ({ data: { id, type, rows, blocks, ...args } }) => {
  try {
    const layout = new PlaneLayout(rows, blocks);
    const progress = (text) => self.postMessage({ id, progress: text });
    if (type === "evaluate") {
      self.postMessage({ id, result: args.plans.map((z) => runBatch(layout, z, args.seeds, undefined, args.order)) });
    } else if (type === "search") {
      self.postMessage({ id, result: searchPatterns({ layout, zones: args.zones, trainSeeds: args.trainSeeds, order: args.order, onProgress: progress }) });
    } else if (type === "refine") {
      // Select the starting plan using training seeds, not the held-out evaluation curves.
      const scored = args.candidates.map((c) => ({ ...c,
        score: meanTicks(layout, c.zoneOfSeat, args.trainSeeds, args.order) }));
      const start = scored.sort((a, b) => a.score - b.score)[0];
      if (!start) throw new Error("No candidate plans to refine");
      const result = refineSeats({ layout, zones: args.zones, trainSeeds: args.trainSeeds,
        order: args.order, start: start.zoneOfSeat, budget: args.budget, onProgress: progress });
      self.postMessage({ id, result: { ...result, startName: start.name } });
    } else throw new Error(`Unknown analysis request: ${type}`);
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
