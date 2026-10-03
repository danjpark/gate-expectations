// Seeded RNG (mulberry32). The only source of randomness in the sim.
export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Inclusive integer range.
  next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  return next;
}
