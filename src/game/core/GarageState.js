import { VEHICLE_CATALOG } from '../entities/vehicleCatalog.js';

const STORAGE_KEY = 'beep_beep_garage_state';
const SCHEMA_VERSION = 1;
const MAX_VEHICLES = 6;

export function loadGarageState(garage) {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!parsed || parsed.version !== SCHEMA_VERSION || !Array.isArray(parsed.vehicles)) return freshState();
    const usedIds = new Set();
    const usedBays = new Set();
    const vehicles = [];
    for (const item of parsed.vehicles.slice(0, MAX_VEHICLES)) {
      const normalized = normalizeVehicle(item, garage, usedIds, usedBays);
      if (normalized) vehicles.push(normalized);
    }
    return {
      version: SCHEMA_VERSION,
      isNight: Boolean(parsed.isNight),
      nextVehicleId: Number.isInteger(parsed.nextVehicleId) ? Math.max(1, parsed.nextVehicleId) : vehicles.length + 1,
      vehicles,
    };
  } catch {
    return freshState();
  }
}

function normalizeVehicle(item, garage, usedIds, usedBays) {
  if (!item || typeof item !== 'object' || !VEHICLE_CATALOG[item.type]) return null;
  const id = typeof item.id === 'string' || Number.isInteger(item.id) ? String(item.id) : null;
  if (!id || usedIds.has(id)) return null;
  usedIds.add(id);

  const preferredBay = typeof garage?.bayById === 'function' ? garage.bayById(item.bayId) : null;
  const canUsePreferred = preferredBay && !usedBays.has(preferredBay.id) &&
    (!VEHICLE_CATALOG[item.type].large || preferredBay.large);
  const fallbackBay = !canUsePreferred && typeof garage?.nearestOpenBay === 'function'
    ? garage.nearestOpenBay({ large: Boolean(VEHICLE_CATALOG[item.type].large) }, usedBays)
    : null;
  const bay = canUsePreferred ? preferredBay : fallbackBay;

  if (item.status === 'parked' && bay) {
    usedBays.add(bay.id);
    const parked = bay.park ?? bay.center ?? { x: bay.x, y: bay.y };
    return {
      id,
      type: item.type,
      status: 'parked',
      bayId: bay.id,
      x: parked.x,
      y: parked.y,
      heading: parked.heading ?? Math.PI / 2,
      care: normalizeCare(item.care),
      problem: item.problem === 'flat' || item.problem === 'battery' ? item.problem : null,
    };
  }

  const waiting = garage?.anchors?.waiting ?? garage?.waiting ?? { x: 205, y: 705, heading: 0 };
  return {
    id,
    type: item.type,
    status: 'waiting',
    bayId: null,
    x: waiting.x,
    y: waiting.y,
    heading: waiting.heading ?? 0,
    care: normalizeCare(item.care),
    problem: null,
  };
}

function normalizeCare(care) {
  return {
    washed: Boolean(care?.washed),
    charged: care?.charged !== false,
    tires: care?.tires !== false,
  };
}

export function saveGarageState(game) {
  try {
    const payload = {
      version: SCHEMA_VERSION,
      isNight: Boolean(game.isNight),
      nextVehicleId: game.nextVehicleId,
      vehicles: game.vehicles
        .filter((vehicle) => !['exiting', 'towed'].includes(vehicle.status))
        .slice(0, MAX_VEHICLES)
        .map((vehicle) => vehicle.serialize()),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function clearGarageState() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* session-only storage */ }
}

function freshState() {
  return { version: SCHEMA_VERSION, isNight: false, nextVehicleId: 1, vehicles: [] };
}
