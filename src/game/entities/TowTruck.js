import { damp, roundRect, TAU } from '../core/math.js';
import { Vehicle } from './Vehicle.js';
import { TOW_TRUCK_CONFIG } from './vehicleCatalog.js';

export class TowTruck extends Vehicle {
  constructor(game, data = {}) {
    const home = game?.garage?.anchors?.towHome || { x: 1470, y: 870, heading: Math.PI };
    super(game, {
      id: 'tow-truck',
      type: 'tow',
      config: TOW_TRUCK_CONFIG,
      status: 'home',
      x: data.x ?? home.x,
      y: data.y ?? home.y,
      heading: data.heading ?? home.heading,
      care: { washed: true, charged: true, tires: true },
    });
    this.home = { ...home };
    this.armed = false;
    this.beacon = 0;
    this.hook = 0;
    this.hookTarget = 0;
    this.towing = null;
    this.rescueTarget = null;
  }

  get available() {
    return !this.moving && !this.towing && !this.rescueTarget && this.status === 'home';
  }

  get busy() {
    return !['home', 'armed'].includes(this.status);
  }

  get engaged() {
    return this.armed || this.busy || Boolean(this.rescueTarget);
  }

  contains(x, y, padding = 28) {
    return super.contains(x, y, padding);
  }

  arm() {
    if (!this.available) return false;
    this.armed = true;
    this.status = 'armed';
    this.selected = true;
    this.expression = 'excited';
    this.expressionTime = 1.2;
    this.bounce = Math.max(this.bounce, 0.7);
    this.game?.sound?.ack?.();
    this.game?.particles?.sparkle?.(this.x, this.y - 42, 8);
    return true;
  }

  cancelArm() {
    if (!this.armed || this.moving) return false;
    this.armed = false;
    this.status = 'home';
    this.selected = false;
    this.rescueTarget = null;
    this.hookTarget = 0;
    this.game?.sound?.pop?.();
    return true;
  }

  queueRescue(target) {
    if (!this.armed || this.moving || this.rescueTarget || target?.status !== 'parked') return false;
    this.armed = false;
    this.selected = false;
    this.status = 'tow-queued';
    this.rescueTarget = target;
    this.expression = 'excited';
    this.expressionTime = 2;
    this.hookTarget = 1;
    this.game?.particles?.sparkle?.(target.x, target.y - 38, 10);
    return true;
  }

  attach(vehicle) {
    if (!vehicle || vehicle !== this.rescueTarget || vehicle.moving) return false;
    this.towing = vehicle;
    vehicle.status = 'towed';
    vehicle.selected = false;
    this.hookTarget = 1;
    this.game?.playSfx?.('tow_clunk', () => this.game.sound.towClunk());
    this.game?.particles?.sparkle?.(vehicle.x, vehicle.y + vehicle.config.length * 0.48, 9);
    return true;
  }

  releaseTarget() {
    const vehicle = this.towing || this.rescueTarget;
    this.towing = null;
    this.rescueTarget = null;
    this.hookTarget = 0;
    return vehicle;
  }

  finishHome() {
    this.releaseTarget();
    this.armed = false;
    this.selected = false;
    this.status = 'home';
    this.movementKind = null;
    this.expression = 'happy';
    this.bounce = 0.7;
  }

  update(dt) {
    super.update(dt);
    const active = this.armed || this.busy || Boolean(this.rescueTarget);
    this.beacon = damp(this.beacon, active ? 1 : 0, active ? 8 : 4, dt);
    this.hook = damp(this.hook, this.hookTarget, 7, dt);
  }

  // The boom base and stripe belong to the painted body; the cable, hook and
  // beacon animate, so they always draw procedurally on top.
  drawBodyExtras(ctx, { sprite }) {
    const { length, width } = this.config;
    ctx.save();
    if (!sprite) {
      ctx.strokeStyle = '#4c5961';
      ctx.lineWidth = 13;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-length * 0.15, 0);
      ctx.lineTo(-length * 0.37, 0);
      ctx.stroke();
    }
    ctx.lineCap = 'round';
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#f3c85c';
    ctx.beginPath();
    ctx.moveTo(-length * 0.12, 0);
    ctx.lineTo(-length * (0.48 + this.hook * 0.18), 0);
    ctx.stroke();
    ctx.fillStyle = '#4b5960';
    ctx.beginPath();
    ctx.arc(-length * (0.48 + this.hook * 0.18), 0, 10, 0, TAU);
    ctx.fill();

    if (!sprite) {
      ctx.fillStyle = '#ffd85f';
      roundRect(ctx, -14, -width * 0.48, 28, width * 0.96, 7);
      ctx.fill();
    }
    ctx.restore();

    if (this.beacon > 0.05) {
      const blink = Math.sin(this.t * 13) > 0;
      ctx.save();
      ctx.globalAlpha = 0.45 + this.beacon * 0.5;
      ctx.fillStyle = blink ? '#ffbf3e' : '#ff6b43';
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = this.game?.reducedCanvasEffects ? 0 : 20;
      ctx.beginPath();
      ctx.arc(12, -width * 0.52, 10, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
}
