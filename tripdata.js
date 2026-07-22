/* tripdata.js — shared trip facts (per-day destination, coords, distance, state,
   milestones). Used by stats.js, weather.js and route.js. Load before them. */
window.TRIP_DATA = {
  start: '2026-08-01', end: '2026-08-13', totalDays: 13, totalKm: 5920,
  // date -> { n: day number, dest: [lat, lng, name], km: leg distance, state }
  days: {
    '2026-08-01': { n: 1,  dest: [-31.50, 145.84, 'Cobar'],             km: 710, state: 'NSW' },
    '2026-08-02': { n: 2,  dest: [-31.96, 141.47, 'Broken Hill'],       km: 455, state: 'NSW' },
    '2026-08-03': { n: 3,  dest: [-31.90, 141.22, 'Silverton'],         km: 25,  state: 'NSW' },
    '2026-08-04': { n: 4,  dest: [-31.24, 136.79, 'Pimba'],             km: 510, state: 'SA'  },
    '2026-08-05': { n: 5,  dest: [-29.01, 134.75, 'Coober Pedy'],       km: 370, state: 'SA'  },
    '2026-08-06': { n: 6,  dest: [-24.42, 131.83, 'Kings Creek'],       km: 740, state: 'NT'  },
    '2026-08-07': { n: 7,  dest: [-23.68, 132.92, 'Redbank Gorge'],     km: 200, state: 'NT'  },
    '2026-08-08': { n: 8,  dest: [-23.77, 133.06, 'Ellery Creek'],      km: 100, state: 'NT'  },
    '2026-08-09': { n: 9,  dest: [-23.70, 133.88, 'Alice Springs'],     km: 90,  state: 'NT'  },
    '2026-08-10': { n: 10, dest: [-27.30, 133.62, 'Marla'],             km: 470, state: 'SA'  },
    '2026-08-11': { n: 11, dest: [-32.49, 137.77, 'Port Augusta'],      km: 690, state: 'SA'  },
    '2026-08-12': { n: 12, dest: [-34.51, 144.84, 'Hay'],               km: 830, state: 'NSW' },
    '2026-08-13': { n: 13, dest: [-33.75, 151.29, 'Dee Why'],           km: 730, state: 'NSW' }
  },
  // origin of the whole loop (Dee Why), used to draw the route start
  origin: [-33.75, 151.29, 'Dee Why'],
  // milestones auto-unlock on/after their date
  milestones: [
    { date: '2026-08-04', emoji: '🏜️', en: 'Into South Australia',     it: 'Arrivo in South Australia' },
    { date: '2026-08-06', emoji: '🐪', en: 'Into the Territory',        it: 'Arrivo nel Territory' },
    { date: '2026-08-06', emoji: '⛺', en: 'First camp night',          it: 'Prima notte in tenda' },
    { date: '2026-08-07', emoji: '🎯', en: 'Reached the Red Centre',    it: 'Nel cuore rosso' },
    { date: '2026-08-09', emoji: '🌵', en: 'Alice Springs',             it: 'Alice Springs' },
    { date: '2026-08-11', emoji: '🔄', en: 'Homeward bound',            it: 'Verso casa' },
    { date: '2026-08-13', emoji: '🏁', en: 'Loop closed — home!',       it: 'Giro concluso — a casa!' }
  ]
};
