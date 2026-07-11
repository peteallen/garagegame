const SURPRISES = Object.freeze([
  { name: 'horn', weight: 1.3 },
  { name: 'headlights', weight: 1.1 },
  { name: 'boogie', weight: 0.9 },
  { name: 'rev', weight: 0.9, canRun: (vehicle) => !vehicle.config.electric },
  { name: 'wipers', weight: 1 },
  { name: 'trunk', weight: 0.7, canRun: (vehicle) => !['bus', 'fire'].includes(vehicle.type) },
  { name: 'alarm', weight: 0.75 },
  { name: 'exhaust', weight: 0.8, canRun: (vehicle) => !vehicle.config.electric },
  { name: 'hop', weight: 0.85 },
]);

export function triggerVehicleSurprise(vehicle) {
  const candidates = SURPRISES.filter((surprise) =>
    !vehicle.recentSurprises.includes(surprise.name) &&
    (!surprise.canRun || surprise.canRun(vehicle))
  );
  if (!candidates.length) return false;
  const total = candidates.reduce((sum, surprise) => sum + surprise.weight, 0);
  let cursor = Math.random() * total;
  const selected = candidates.find((surprise) => (cursor -= surprise.weight) <= 0) || candidates.at(-1);
  return vehicle.beginSurprise(selected.name);
}

export function idleSafeSurprise(vehicle) {
  const safe = ['headlights', 'wipers', 'boogie'].filter((name) => !vehicle.recentSurprises.includes(name));
  if (!safe.length) return false;
  return vehicle.beginSurprise(safe[Math.floor(Math.random() * safe.length)]);
}
