import { clamp, wrapAngle } from './math.js';

const EPSILON = 0.00001;

export function cubicPoint(segment, t) {
  const p = clamp(t, 0, 1);
  const q = 1 - p;
  return {
    x: q * q * q * segment.p0.x + 3 * q * q * p * segment.p1.x + 3 * q * p * p * segment.p2.x + p * p * p * segment.p3.x,
    y: q * q * q * segment.p0.y + 3 * q * q * p * segment.p1.y + 3 * q * p * p * segment.p2.y + p * p * p * segment.p3.y,
  };
}

export function cubicDerivative(segment, t) {
  const p = clamp(t, 0, 1);
  const q = 1 - p;
  return {
    x: 3 * q * q * (segment.p1.x - segment.p0.x) + 6 * q * p * (segment.p2.x - segment.p1.x) + 3 * p * p * (segment.p3.x - segment.p2.x),
    y: 3 * q * q * (segment.p1.y - segment.p0.y) + 6 * q * p * (segment.p2.y - segment.p1.y) + 3 * p * p * (segment.p3.y - segment.p2.y),
  };
}

function cubicSecondDerivative(segment, t) {
  const p = clamp(t, 0, 1);
  const q = 1 - p;
  return {
    x: 6 * q * (segment.p2.x - 2 * segment.p1.x + segment.p0.x) + 6 * p * (segment.p3.x - 2 * segment.p2.x + segment.p1.x),
    y: 6 * q * (segment.p2.y - 2 * segment.p1.y + segment.p0.y) + 6 * p * (segment.p3.y - 2 * segment.p2.y + segment.p1.y),
  };
}

export function cubicHeading(segment, t) {
  const tangent = cubicDerivative(segment, t);
  const travelHeading = Math.atan2(tangent.y, tangent.x);
  return wrapAngle(travelHeading + (segment.direction === -1 ? Math.PI : 0));
}

export function cubicCurvature(segment, t) {
  const first = cubicDerivative(segment, t);
  const second = cubicSecondDerivative(segment, t);
  const speedSquared = first.x * first.x + first.y * first.y;
  if (speedSquared < EPSILON) return Infinity;
  return Math.abs(first.x * second.y - first.y * second.x) / Math.pow(speedSquared, 1.5);
}

export function approximateCubicLength(segment, samples = 24) {
  let length = 0;
  let previous = cubicPoint(segment, 0);
  for (let index = 1; index <= samples; index++) {
    const current = cubicPoint(segment, index / samples);
    length += Math.hypot(current.x - previous.x, current.y - previous.y);
    previous = current;
  }
  return length;
}

/**
 * Adds normalized defaults to a cubic driving segment. A negative direction
 * means the wheels travel along the curve while the vehicle faces opposite
 * the curve tangent, producing genuine reverse motion instead of a sideways
 * translation.
 */
export function prepareSegment(segment, defaultSpeed = 185) {
  const direction = segment.direction === -1 ? -1 : 1;
  const length = approximateCubicLength(segment);
  return {
    ...segment,
    direction,
    length,
    duration: segment.duration || Math.max(0.35, length / (segment.speed || defaultSpeed)),
  };
}

/**
 * Samples a planned path for steering continuity and minimum turn radius.
 * The runtime follows the exact curve tangent, so a path that passes this
 * check cannot visually slide sideways or exceed its configured steering.
 */
export function validateMotionPath(segments, { minTurnRadius = 105, samples = 30 } = {}) {
  const errors = [];
  const prepared = segments.map((segment) => prepareSegment(segment));
  prepared.forEach((segment, segmentIndex) => {
    for (let index = 0; index <= samples; index++) {
      const t = index / samples;
      const curvature = cubicCurvature(segment, t);
      if (!Number.isFinite(curvature)) {
        errors.push(`Segment ${segmentIndex} has a stationary tangent near ${t.toFixed(2)}.`);
        break;
      }
      const radius = curvature < EPSILON ? Infinity : 1 / curvature;
      if (radius < minTurnRadius) {
        errors.push(`Segment ${segmentIndex} turns at radius ${radius.toFixed(1)}, below ${minTurnRadius}.`);
        break;
      }
    }
  });

  for (let index = 1; index < prepared.length; index++) {
    const previous = prepared[index - 1];
    const current = prepared[index];
    const gap = Math.hypot(previous.p3.x - current.p0.x, previous.p3.y - current.p0.y);
    if (gap > 1) errors.push(`Segments ${index - 1} and ${index} have a ${gap.toFixed(1)}px position gap.`);
    const before = cubicHeading(previous, 1);
    const after = cubicHeading(current, 0);
    const headingGap = Math.abs(wrapAngle(after - before));
    if (headingGap > 0.24) errors.push(`Segments ${index - 1} and ${index} jump heading by ${(headingGap * 180 / Math.PI).toFixed(1)}°.`);
  }
  return { ok: errors.length === 0, errors, segments: prepared };
}

export function orientedFootprint(x, y, heading, length, width, padding = 0) {
  const halfLength = length / 2 + padding;
  const halfWidth = width / 2 + padding;
  const cosine = Math.cos(heading);
  const sine = Math.sin(heading);
  return [
    { x: x + cosine * halfLength - sine * halfWidth, y: y + sine * halfLength + cosine * halfWidth },
    { x: x + cosine * halfLength + sine * halfWidth, y: y + sine * halfLength - cosine * halfWidth },
    { x: x - cosine * halfLength + sine * halfWidth, y: y - sine * halfLength - cosine * halfWidth },
    { x: x - cosine * halfLength - sine * halfWidth, y: y - sine * halfLength + cosine * halfWidth },
  ];
}

function axesForPolygon(points) {
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const x = -(next.y - point.y);
    const y = next.x - point.x;
    const length = Math.hypot(x, y) || 1;
    return { x: x / length, y: y / length };
  });
}

function project(points, axis) {
  let min = Infinity;
  let max = -Infinity;
  for (const point of points) {
    const value = point.x * axis.x + point.y * axis.y;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
}

export function polygonsOverlap(first, second) {
  const axes = [...axesForPolygon(first), ...axesForPolygon(second)];
  return axes.every((axis) => {
    const a = project(first, axis);
    const b = project(second, axis);
    return a.max >= b.min && b.max >= a.min;
  });
}

export class VehicleMotion {
  constructor({ x, y, heading = 0, defaultSpeed = 185, minTurnRadius = 105 }) {
    this.x = x;
    this.y = y;
    this.heading = heading;
    this.defaultSpeed = defaultSpeed;
    this.minTurnRadius = minTurnRadius;
    this.speed = 0;
    this.steer = 0;
    this.path = null;
    this.segmentIndex = 0;
    this.segmentTime = 0;
  }

  get moving() {
    return Boolean(this.path);
  }

  get reversing() {
    return this.path?.[this.segmentIndex]?.direction === -1;
  }

  follow(segments, { onSegment, onComplete, validate = true } = {}) {
    if (!Array.isArray(segments) || !segments.length) return false;
    const result = validateMotionPath(segments, { minTurnRadius: this.minTurnRadius });
    if (validate && !result.ok) {
      console.warn('Rejected implausible vehicle path:', result.errors);
      return false;
    }
    this.path = result.segments;
    this.segmentIndex = 0;
    this.segmentTime = 0;
    this.onSegment = onSegment;
    this.onComplete = onComplete;
    this.applyPose(0);
    this.onSegment?.(this.path[0], 0);
    return true;
  }

  stop() {
    this.path = null;
    this.speed = 0;
    this.steer = 0;
    this.onSegment = null;
    this.onComplete = null;
  }

  update(dt) {
    if (!this.path) {
      this.speed = 0;
      this.steer *= Math.exp(-8 * dt);
      return;
    }
    let remaining = dt;
    while (remaining > 0 && this.path) {
      const segment = this.path[this.segmentIndex];
      const available = segment.duration - this.segmentTime;
      const step = Math.min(remaining, available);
      this.segmentTime += step;
      remaining -= step;
      const t = clamp(this.segmentTime / segment.duration, 0, 1);
      this.applyPose(t);
      this.speed = segment.direction * segment.length / segment.duration;
      if (t >= 1 - EPSILON) this.advanceSegment();
    }
  }

  applyPose(t) {
    const segment = this.path[this.segmentIndex];
    const point = cubicPoint(segment, t);
    const heading = cubicHeading(segment, t);
    const lookAhead = cubicHeading(segment, Math.min(1, t + 0.025));
    this.x = point.x;
    this.y = point.y;
    this.heading = heading;
    this.steer = clamp(wrapAngle(lookAhead - heading) * 5.4, -0.58, 0.58);
  }

  advanceSegment() {
    this.segmentIndex += 1;
    this.segmentTime = 0;
    if (this.segmentIndex < this.path.length) {
      this.onSegment?.(this.path[this.segmentIndex], this.segmentIndex);
      this.applyPose(0);
      return;
    }
    const completed = this.onComplete;
    this.stop();
    completed?.();
  }
}
