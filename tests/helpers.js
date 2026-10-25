import { newState } from "../src/planner.js";
import { sectionFor } from "../src/sections.js";

export function fullState(date) {
  const state = newState(date);
  return {
    ...state,
    limits: Object.fromEntries(Object.keys(state.limits).map((id) => [id, 1])),
    prayersEnabled: {
      fajr: true,
      duha: false,
      "avant-dhuhr": false,
      "apres-dhuhr": false,
      "apres-maghrib": false,
      "apres-isha": false,
      chafaa: true,
      witr: true,
      qiyam: false,
    },
  };
}

// La règle de plafond : strict, sauf si le passage finit son thème, auquel
// cas on tolère jusqu'à 50 % de dépassement.
export function passageWithinRule(p, limit) {
  if (p.size <= limit + 1e-9) return true;
  const block = sectionFor(p.surah, p.to);
  return Boolean(block) && p.to === block.to && p.size <= limit * 1.5 + 1e-9;
}
