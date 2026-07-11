import { damp, roundRect, TAU } from '../core/math.js';
import { Vehicle } from './Vehicle.js';
import { TOW_TRUCK_CONFIG } from './vehicleCatalog.js';

export class TowTruck extends Vehicle {
  constructor(game, data = {}) {
    super(game, {
      id: 'tow-truck',
      type: 'tow',
      config: TOW_TRUCK_CONFIG,
      status: 'home',
      x: data.x ?? 1370,
      y: data.y ?? 728,
      heading: data.heading ?? Math.PI,
      care: { washed: true, charged: true, tires: true },
    });
    this.home = { x: this.x, y: this.y, heading: this.heading };
    this.beacon = 0;
    this.hook = 0;
    this.hookTarget = 0;
    this.towing = null;
    this.problemTarget = null;
  }

  get available() {
    return !this.moving && !this.towing && this.status === 'home';
  }

  contains(x, y, padding = 48) {
    return super.contains(x, y, padding);
  }

  summon(target) {
    this.problemTarget = target;
    this.beacon = 1;
    this.expression = 'excited';
  }

  attach(vehicle) {
    if (!vehicle) return false;
    this.towing = vehicle;
    vehicle.status = 'towed';
    vehicle.motion.stop();
    vehicle.selected = false;
    this.hookTarget = 1;
    this.game?.sound?.towClunk?.();
    return true;
  }

  detach() {
    const vehicle = this.towing;
    this.towing = null;
    this.hookTarget = 0;
    if (vehicle) vehicle.status = 'service';
    return vehicle;
  }

  update(dt) {
    super.update(dt);
    this.beacon = damp(this.beacon, this.status === 'home' ? 0 : 1, 4, dt);
    this.hook = damp(this.hook, this.hookTarget, 7, dt);
    if (this.towing) {
      const gap = (this.config.length + this.towing.config.length) * 0.49 + 26;
      this.towing.x = this.x - Math.cos(this.heading) * gap;
      this.towing.y = this.y - Math.sin(this.heading) * gap;
      this.towing.heading = this.heading;
      this.towing.flash = 0.4 + Math.sin(this.t * 4) * 0.35;
    }
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
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(12, -width * 0.52, 10, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
}
