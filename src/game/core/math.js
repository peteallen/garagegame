export const TAU = Math.PI * 2;

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const lerp = (from, to, amount) => from + (to - from) * amount;
export const invLerp = (from, to, value) => clamp((value - from) / (to - from || 1), 0, 1);
export const rand = (min, max) => min + Math.random() * (max - min);
export const chance = (probability) => Math.random() < probability;
export const pick = (items) => items[Math.floor(Math.random() * items.length)];
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

export function damp(value, target, smoothing, dt) {
  return lerp(value, target, 1 - Math.exp(-smoothing * dt));
}

export function easeInOut(t) {
  const p = clamp(t, 0, 1);
  return p * p * (3 - 2 * p);
}

export function easeOutBack(t) {
  const p = clamp(t, 0, 1) - 1;
  return 1 + 2.70158 * p * p * p + 1.70158 * p * p;
}

export function wrapAngle(angle) {
  let result = angle;
  while (result > Math.PI) result -= TAU;
  while (result < -Math.PI) result += TAU;
  return result;
}

export function angleLerp(from, to, amount) {
  return from + wrapAngle(to - from) * amount;
}

export function pointInRect(x, y, rect, padding = 0) {
  return x >= rect.x - padding && x <= rect.x + rect.w + padding &&
    y >= rect.y - padding && y <= rect.y + rect.h + padding;
}

export function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, r);
}
