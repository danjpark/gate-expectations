import { makeRng } from "./rng.js";
import { Passenger } from "./passenger.js";

const FIRST = ["Dave", "Priya", "Mo", "Ingrid", "Tomas", "Aiko", "Bea", "Carlos", "Dot", "Esme",
  "Farid", "Gus", "Hana", "Ivo", "June", "Kofi", "Lena", "Milo", "Nia", "Otto", "Pam", "Quinn", "Rosa", "Sven"];
const LAST = ["Bagley", "Okafor", "Lindqvist", "Tanaka", "Moreau", "Patel", "Kowalski", "Reyes",
  "Dubois", "Haddad", "Nakamura", "Fitch"];

// Every seat gets exactly one passenger. Randomness only from `seed`.
export function generateManifest(layout, seed) {
  const rng = makeRng(seed);
  const seats = Array.from({ length: layout.seatCount }, (_, i) => i);
  for (let i = seats.length - 1; i > 0; i--) { // Fisher-Yates
    const j = rng.int(0, i);
    [seats[i], seats[j]] = [seats[j], seats[i]];
  }
  return seats.map((seat, i) => new Passenger({
    id: i,
    seat,
    row: layout.seatRow(seat),
    patience: rng.int(1, 5),
    name: `${FIRST[i % FIRST.length]} ${LAST[rng.int(0, LAST.length - 1)]}`,
  }));
}
