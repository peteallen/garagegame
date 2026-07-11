import { clamp, damp, easeOutBack, rand, roundRect, TAU, wrapAngle } from '../core/math.js';
import { orientedFootprint, VehicleMotion } from '../core/VehicleMotion.js';
import { vehicleConfig } from './vehicleCatalog.js';

const SURPRISE_DURATIONS = {
  horn: 1.05,
  headlights: 1.6,
  boogie: 2.8,
  rev: 1.9,
  wipers: 2.1,
  trunk: 3,
  alarm: 2.4,
  exhaust: 1.8,
  hop: 1.7,
};

export class Vehicle {
  constructor(game, data) {
    this.game = game;
    this.id = String(data.id);
    this.type = data.type;
    this.config = data.config || vehicleConfig(data.type);
    this.status = data.status || 'waiting';
    this.bayId = data.bayId ?? null;
    this.stationId = null;
    this.care = {
      washed: Boolean(data.care?.washed),
      charged: data.care?.charged !== false,
      tires: data.care?.tires !== false,
    };
    this.problem = data.problem || null;
    this.selected = false;
    this.sleepy = rand(0, TAU);
    this.expression = 'happy';
    this.expressionTime = 0;
    this.bounce = 0;
    this.shake = 0;
    this.glow = 0;
    this.flash = 0;
    this.surprise = null;
    this.recentSurprises = [];
    this.reverseBeepTime = 0;
    this.exhaustTime = 0;
    this.t = rand(0, 50);
    this.motion = new VehicleMotion({
      x: data.x,
      y: data.y,
      heading: data.heading ?? 0,
      defaultSpeed: this.config.speed,
      minTurnRadius: this.config.minTurnRadius,
    });
  }

  get x() { return this.motion.x; }
  set x(value) { this.motion.x = value; }
  get y() { return this.motion.y; }
  set y(value) { this.motion.y = value; }
  get heading() { return this.motion.heading; }
  set heading(value) { this.motion.heading = value; }
  get moving() { return this.motion.moving; }
  get reversing() { return this.motion.reversing; }
  get large() { return Boolean(this.config.large); }

  get baseline() {
    return Math.max(...this.footprint().map((point) => point.y));
  }

  footprint(padding = 0) {
    return orientedFootprint(this.x, this.y, this.heading, this.config.length, this.config.width, padding);
  }

  contains(x, y, padding = 38) {
    const dx = x - this.x;
    const dy = y - this.y;
    const cosine = Math.cos(-this.heading);
    const sine = Math.sin(-this.heading);
    const localX = dx * cosine - dy * sine;
    const localY = dx * sine + dy * cosine;
    return Math.abs(localX) <= this.config.length / 2 + padding &&
      Math.abs(localY) <= this.config.width / 2 + padding;
  }

  drive(segments, { status = 'driving', onComplete } = {}) {
    this.status = status;
    const started = this.motion.follow(segments, {
      onSegment: (segment) => {
        this.reverseBeepTime = segment.direction === -1 ? 0.01 : 0;
        if (segment.cue) this.game?.onMotionCue?.(this, segment.cue);
      },
      onComplete: () => {
        this.reverseBeepTime = 0;
        onComplete?.();
      },
    });
    if (!started) this.status = 'waiting';
    return started;
  }

  select() {
    this.selected = true;
    this.expression = 'excited';
    this.expressionTime = 1.2;
    this.bounce = Math.max(this.bounce, 1);
  }

  deselect() {
    this.selected = false;
  }

  reactNotMe() {
    this.expression = 'silly';
    this.expressionTime = 1.4;
    this.shake = 1;
    this.game?.sound?.tinyHorn?.(this.type);
  }

  setProblem(problem) {
    this.problem = problem;
    this.expression = 'worried';
    this.flash = 1;
  }

  clearProblem() {
    this.problem = null;
    this.expression = 'love';
    this.expressionTime = 2;
    this.flash = 0;
    this.bounce = 1;
  }

  beginSurprise(name) {
    if (!SURPRISE_DURATIONS[name] || this.moving || this.problem) return false;
    this.surprise = { name, elapsed: 0, duration: SURPRISE_DURATIONS[name], fired: false };
    this.recentSurprises.unshift(name);
    this.recentSurprises = this.recentSurprises.slice(0, 2);
    this.expression = 'excited';
    this.expressionTime = SURPRISE_DURATIONS[name];
    return true;
  }

  update(dt) {
    this.t += dt;
    this.motion.update(dt);
    this.expressionTime = Math.max(0, this.expressionTime - dt);
    if (this.expressionTime <= 0) this.expression = this.problem ? 'worried' : 'happy';
    this.bounce = damp(this.bounce, 0, 6.5, dt);
    this.shake = damp(this.shake, 0, 7.5, dt);
    this.glow = damp(this.glow, this.selected ? 1 : 0, 7, dt);
    this.flash = this.problem ? 0.45 + Math.sin(this.t * 5.2) * 0.45 : damp(this.flash, 0, 8, dt);

    if (this.reversing) {
      this.reverseBeepTime -= dt;
      if (this.reverseBeepTime <= 0) {
        this.reverseBeepTime = 0.62;
        this.game?.sound?.backupBeep?.();
      }
    }

    if (this.motion.moving && !this.config.electric) {
      this.exhaustTime -= dt;
      if (this.exhaustTime <= 0) {
        this.exhaustTime = rand(0.7, 1.4);
        this.game?.particles?.exhaust?.(this.rearPoint(), this.heading);
      }
    }

    if (this.surprise) this.updateSurprise(dt);
  }

  updateSurprise(dt) {
    const action = this.surprise;
    action.elapsed += dt;
    const progress = action.elapsed / action.duration;
    if (!action.fired) {
      action.fired = true;
      if (action.name === 'horn') this.game?.playVehicleHorn?.(this);
      if (action.name === 'rev') this.game?.playVehicleEngine?.(this, { rev: true });
      if (action.name === 'alarm') this.game?.sound?.alarmChirp?.();
      if (action.name === 'trunk') this.game?.sound?.pop?.();
      if (action.name === 'hop') this.game?.sound?.boing?.();
    }
    if (action.name === 'boogie') this.bounce = Math.max(this.bounce, 0.5 + Math.sin(action.elapsed * 10) * 0.4);
    if (action.name === 'hop') this.bounce = Math.max(this.bounce, Math.sin(clamp(progress, 0, 1) * Math.PI));
    if (action.name === 'alarm' && Math.floor(action.elapsed * 5) !== Math.floor((action.elapsed - dt) * 5)) {
      this.game?.sound?.alarmChirp?.();
    }
    if (action.name === 'exhaust' && Math.floor(action.elapsed * 7) !== Math.floor((action.elapsed - dt) * 7)) {
      this.game?.particles?.exhaust?.(this.rearPoint(), this.heading, 2);
    }
    if (action.elapsed >= action.duration) this.surprise = null;
  }

  rearPoint() {
    return {
      x: this.x - Math.cos(this.heading) * this.config.length * 0.48,
      y: this.y - Math.sin(this.heading) * this.config.length * 0.48,
    };
  }

  serialize() {
    return {
      id: this.id,
      type: this.type,
      status: this.status === 'parked' ? 'parked' : 'waiting',
      bayId: this.status === 'parked' ? this.bayId : null,
      x: this.x,
      y: this.y,
      heading: this.heading,
      care: { ...this.care },
      problem: this.status === 'parked' ? this.problem : null,
    };
  }

  draw(ctx, assets, { portrait = false, scale = 1 } = {}) {
    const config = this.config;
    const action = this.surprise;
    const boogie = action?.name === 'boogie' ? Math.sin(action.elapsed * 12) * 0.08 : 0;
    const hop = this.bounce * 18 + (action?.name === 'hop' ? Math.max(0, Math.sin(action.elapsed * 5)) * 26 : 0);
    const shake = this.shake * Math.sin(this.t * 36) * 7;

    ctx.save();
    ctx.translate(this.x + shake, this.y - hop);
    ctx.rotate(this.heading + boogie);
    ctx.scale(scale, scale);

    if (!portrait) {
      ctx.fillStyle = 'rgba(15,36,44,.22)';
      ctx.beginPath();
      ctx.ellipse(-2, hop + 9, config.length * 0.5, config.width * 0.45, 0, 0, TAU);
      ctx.fill();
    }

    if (this.selected || this.glow > 0.05) this.drawSelection(ctx);
    this.drawFallbackVehicle(ctx);
    this.drawCare(ctx);
    this.drawProblem(ctx);
    ctx.restore();
  }

  drawSelection(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.35 + this.glow * 0.35;
    ctx.strokeStyle = '#ffe56e';
    ctx.lineWidth = 8;
    ctx.setLineDash([18, 12]);
    ctx.lineDashOffset = -this.t * 30;
    ctx.beginPath();
    ctx.ellipse(0, 0, this.config.length * 0.62, this.config.width * 0.73, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  drawFallbackVehicle(ctx) {
    const { length, width, color, accent } = this.config;
    const action = this.surprise;
    const trunkOpen = action?.name === 'trunk' ? Math.sin(clamp(action.elapsed / 0.6, 0, 1) * Math.PI / 2) : 0;
    const lightsOn = this.motion.moving || this.problem || action?.name === 'headlights';
    const flashOn = this.problem ? this.flash > 0.45 : action?.name === 'headlights' && Math.sin(action.elapsed * 10) > 0;

    this.drawWheels(ctx);

    ctx.save();
    ctx.shadowColor = 'rgba(28,47,52,.35)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    roundRect(ctx, -length * 0.5, -width * 0.48, length, width * 0.96, width * 0.32);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = accent;
    roundRect(ctx, -length * 0.08, -width * 0.4, length * 0.43, width * 0.8, width * 0.25);
    ctx.fill();

    const windshield = ctx.createLinearGradient(-8, -width * 0.32, 20, width * 0.32);
    windshield.addColorStop(0, '#bce6e7');
    windshield.addColorStop(1, '#6ea6b6');
    ctx.fillStyle = windshield;
    roundRect(ctx, 1, -width * 0.32, length * 0.27, width * 0.64, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(length * 0.08, -width * 0.25);
    ctx.lineTo(length * 0.16, width * 0.25);
    ctx.stroke();

    if (action?.name === 'wipers') this.drawWipers(ctx, action.elapsed);
    if (this.type === 'pickup') this.drawPickupBed(ctx);
    if (this.type === 'taxi') this.drawRoofBadge(ctx, '#263d4d');
    if (this.type === 'police') this.drawLightBar(ctx);
    if (this.type === 'fire') this.drawFireGear(ctx);
    if (this.type === 'icecream') this.drawIceCreamTop(ctx);
    if (this.type === 'bus') this.drawBusWindows(ctx);

    if (trunkOpen > 0.02) this.drawOpenTrunk(ctx, trunkOpen);
    this.drawFace(ctx, { lightsOn, flashOn });
  }

  drawWheels(ctx) {
    const { length, width } = this.config;
    for (const side of [-1, 1]) {
      for (const front of [-1, 1]) {
        ctx.save();
        ctx.translate(front * length * 0.32, side * width * 0.5);
        if (front > 0) ctx.rotate(this.motion.steer);
        ctx.fillStyle = '#20333b';
        roundRect(ctx, -15, -8, 30, 16, 6);
        ctx.fill();
        ctx.fillStyle = '#91a5aa';
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  drawFace(ctx, { lightsOn, flashOn }) {
    const { length, width } = this.config;
    const front = length * 0.44;
    const eyeColor = lightsOn && (!this.problem || flashOn) ? '#fff2a6' : '#d8f3ee';
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(front, side * width * 0.27);
      ctx.fillStyle = eyeColor;
      ctx.shadowColor = lightsOn ? '#fff2a6' : 'transparent';
      ctx.shadowBlur = lightsOn ? 15 : 0;
      ctx.beginPath();
      const droop = this.expression === 'worried' ? side * 0.2 : 0;
      ctx.ellipse(0, 0, 9, 13, droop, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#24404b';
      ctx.beginPath();
      ctx.arc(2, 0, 4, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    ctx.strokeStyle = '#29434b';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (this.expression === 'worried') {
      ctx.arc(front + 4, 0, 11, Math.PI * 1.18, Math.PI * 1.82);
    } else if (this.expression === 'silly') {
      ctx.moveTo(front - 2, -12);
      ctx.quadraticCurveTo(front + 13, 0, front - 2, 12);
    } else {
      ctx.arc(front - 4, 0, 15, -Math.PI * 0.42, Math.PI * 0.42);
    }
    ctx.stroke();
  }

  drawWipers(ctx, elapsed) {
    const { length, width } = this.config;
    const swing = Math.sin(elapsed * 12) * 0.8;
    ctx.strokeStyle = '#314951';
    ctx.lineWidth = 4;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(length * 0.08, side * width * 0.18);
      ctx.rotate(swing * side);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(length * 0.15, 0);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawPickupBed(ctx) {
    const { length, width } = this.config;
    ctx.fillStyle = '#1f7778';
    roundRect(ctx, -length * 0.45, -width * 0.37, length * 0.31, width * 0.74, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  drawRoofBadge(ctx, color) {
    ctx.fillStyle = color;
    roundRect(ctx, -8, -23, 34, 46, 8);
    ctx.fill();
  }

  drawLightBar(ctx) {
    ctx.fillStyle = Math.sin(this.t * 11) > 0 ? '#f05252' : '#4c8de7';
    roundRect(ctx, -9, -27, 30, 54, 7);
    ctx.fill();
  }

  drawFireGear(ctx) {
    const { length } = this.config;
    ctx.strokeStyle = '#f8dd8d';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(-length * 0.35, -20);
    ctx.lineTo(8, -20);
    ctx.moveTo(-length * 0.35, 20);
    ctx.lineTo(8, 20);
    ctx.stroke();
  }

  drawIceCreamTop(ctx) {
    ctx.fillStyle = '#fff0e0';
    ctx.beginPath();
    ctx.arc(-6, 0, 18, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ff87a8';
    ctx.beginPath();
    ctx.moveTo(-22, 0);
    ctx.lineTo(10, -13);
    ctx.lineTo(10, 13);
    ctx.closePath();
    ctx.fill();
  }

  drawBusWindows(ctx) {
    const { length, width } = this.config;
    ctx.fillStyle = '#426878';
    for (let x = -length * 0.32; x < length * 0.15; x += 34) {
      for (const side of [-1, 1]) {
        roundRect(ctx, x, side * width * 0.29 - 8, 23, 16, 5);
        ctx.fill();
      }
    }
  }

  drawOpenTrunk(ctx, amount) {
    const { length, width } = this.config;
    ctx.save();
    ctx.translate(-length * 0.46, 0);
    ctx.rotate(-amount * 0.75);
    ctx.fillStyle = this.config.color;
    roundRect(ctx, -8, -width * 0.4, 18, width * 0.8, 7);
    ctx.fill();
    ctx.fillStyle = '#ffe56e';
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', -14, 0);
    ctx.restore();
  }

  drawCare(ctx) {
    if (this.care.washed) {
      ctx.fillStyle = '#fff8b2';
      for (let index = 0; index < 3; index++) {
        const phase = this.t * 1.8 + index * 2.1;
        const x = Math.cos(phase) * this.config.length * 0.35;
        const y = Math.sin(phase * 1.3) * this.config.width * 0.42;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(phase);
        ctx.fillRect(-2, -8, 4, 16);
        ctx.fillRect(-8, -2, 16, 4);
        ctx.restore();
      }
    }
    if (this.config.electric && this.care.charged) {
      ctx.fillStyle = '#8df0b3';
      ctx.beginPath();
      ctx.moveTo(-12, -8);
      ctx.lineTo(3, -8);
      ctx.lineTo(-4, 3);
      ctx.lineTo(9, 3);
      ctx.lineTo(-10, 19);
      ctx.lineTo(-3, 7);
      ctx.lineTo(-15, 7);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawProblem(ctx) {
    if (!this.problem) return;
    const { length, width } = this.config;
    if (this.problem === 'flat') {
      ctx.save();
      ctx.translate(-length * 0.31, width * 0.52);
      ctx.scale(1.25, 0.45);
      ctx.fillStyle = '#1e3037';
      ctx.beginPath();
      ctx.arc(0, 0, 17, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = 0.25 + this.flash * 0.45;
    ctx.fillStyle = '#ff8a50';
    ctx.shadowColor = '#ff6a44';
    ctx.shadowBlur = 24;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(-length * 0.39, side * width * 0.28, 12, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawPortrait(ctx, x, y, size = 170) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-this.heading);
    const scale = size / Math.max(this.config.length, this.config.width * 1.8);
    const originalX = this.x;
    const originalY = this.y;
    const originalHeading = this.heading;
    this.x = 0;
    this.y = 0;
    this.heading = 0;
    this.draw(ctx, this.game?.assets, { portrait: true, scale });
    this.x = originalX;
    this.y = originalY;
    this.heading = originalHeading;
    ctx.restore();
  }
}
