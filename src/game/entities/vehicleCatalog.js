export const VEHICLE_CATALOG = Object.freeze({
  sports: Object.freeze({
    name: 'sports car', color: '#ef5b54', accent: '#ffe1a8', length: 156, width: 80,
    speed: 220, minTurnRadius: 102, weight: 1.1, horn: 'horn_sports', engine: 'engine_sports',
  }),
  pickup: Object.freeze({
    name: 'pickup truck', color: '#2da6a4', accent: '#e8fbef', length: 174, width: 90,
    speed: 184, minTurnRadius: 112, weight: 1, horn: 'horn_pickup', engine: 'engine_pickup',
  }),
  taxi: Object.freeze({
    name: 'taxi', color: '#f3bd38', accent: '#243f54', length: 164, width: 85,
    speed: 190, minTurnRadius: 108, weight: 1, horn: 'horn_taxi', engine: 'engine_small',
  }),
  police: Object.freeze({
    name: 'police car', color: '#f5f2df', accent: '#3767a6', length: 166, width: 100,
    speed: 205, minTurnRadius: 108, weight: 0.85, horn: 'horn_police', engine: 'engine_small', special: 'siren',
  }),
  fire: Object.freeze({
    name: 'fire truck', color: '#db453e', accent: '#ffe296', length: 196, width: 95,
    speed: 160, minTurnRadius: 132, weight: 0.7, horn: 'horn_fire', engine: 'engine_heavy', large: true,
  }),
  icecream: Object.freeze({
    name: 'ice cream truck', color: '#8fdad0', accent: '#ff9eb5', length: 184, width: 102,
    speed: 168, minTurnRadius: 120, weight: 0.8, horn: 'horn_icecream', engine: 'engine_small', special: 'jingle',
  }),
  ev: Object.freeze({
    name: 'little electric car', color: '#9a74ce', accent: '#cbf4ed', length: 146, width: 81,
    speed: 198, minTurnRadius: 94, weight: 1, horn: 'horn_ev', engine: 'engine_ev', electric: true,
  }),
  bus: Object.freeze({
    name: 'school bus', color: '#efb936', accent: '#3b4d52', length: 226, width: 114,
    speed: 148, minTurnRadius: 152, weight: 0.75, horn: 'horn_bus', engine: 'engine_heavy', large: true,
  }),
});

export const VEHICLE_TYPES = Object.freeze(Object.keys(VEHICLE_CATALOG));

export const TOW_TRUCK_CONFIG = Object.freeze({
  name: 'tow truck', color: '#ee8a38', accent: '#fff0a5', length: 190, width: 89,
  speed: 172, minTurnRadius: 125, horn: 'horn_tow', engine: 'engine_heavy',
});

export function vehicleConfig(type) {
  return VEHICLE_CATALOG[type] || VEHICLE_CATALOG.ev;
}
