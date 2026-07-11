import { Garage, WORLD_H, WORLD_W } from './world/Garage.js';
import { Vehicle } from './entities/Vehicle.js';
import { TowTruck } from './entities/TowTruck.js';
import { Pet } from './entities/Pet.js';
import { VEHICLE_TYPES } from './entities/vehicleCatalog.js';
import { Particles } from './fx/Particles.js';
import { Hud } from './ui/Hud.js';
import { loadGarageState, saveGarageState } from './core/GarageState.js';
import { cubicPoint } from './core/VehicleMotion.js';
import { clamp, dist, pick, roundRect, TAU } from './core/math.js';
import { triggerVehicleSurprise } from './actions/vehicleSurprises.js';

export class Game {
  constructor(canvas, assets = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.assets = assets;
    this.time = 0;
    this.isNight = false;
    this.selectedVehicle = null;
    this.pickupRequest = null;
    this.dragVehicle = null;
    this.dragBay = null;
    this.pointer = null;
    this.lastArrivalTypes = [];
    this.nextVehicleId = 1;
    this.sound = createWorkbenchSound();
    this.particles = new Particles();
    this.garage = new Garage(this);
    const saved = loadGarageState(this.garage);
    this.isNight = saved.isNight;
    this.nextVehicleId = saved.nextVehicleId;
    this.vehicles = saved.vehicles.map((data) => new Vehicle(this, data));
    const towHome = this.garage.anchors.towHome;
    this.towTruck = new TowTruck(this, towHome);
    this.pet = new Pet(this);
    this.hud = new Hud(this);
    this.debug = new URLSearchParams(location.search).has('debug');

    this.resize();
    this._last = performance.now();
    this._loop = (now) => {
      const dt = Math.min(0.05, (now - this._last) / 1000);
      this._last = now;
      this.update(dt);
      this.draw();
      this._raf = requestAnimationFrame(this._loop);
    };
    this._raf = requestAnimationFrame(this._loop);
    window.__garageGame = this;
  }

  adoptRuntime(previous) {
    if (!previous) return;
    if (previous.sound?.ctx) this.sound.ctx = previous.sound.ctx;
    if (previous.sound) this.sound.muted = previous.sound.muted;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.dpr = dpr;
    this.scale = Math.min(width / WORLD_W, height / WORLD_H);
    this.offsetX = (width - WORLD_W * this.scale) / 2;
    this.offsetY = (height - WORLD_H * this.scale) / 2;
  }

  toWorld(clientX, clientY) {
    return {
      x: (clientX - this.offsetX) / this.scale,
      y: (clientY - this.offsetY) / this.scale,
    };
  }

  onPointerDown(clientX, clientY) {
    this.sound.unlock();
    const point = this.toWorld(clientX, clientY);
    const vehicle = this.vehicleAt(point.x, point.y);
    this.pointer = { start: point, point, time: performance.now(), vehicle };
  }

  onPointerMove(clientX, clientY) {
    if (!this.pointer) return;
    const point = this.toWorld(clientX, clientY);
    this.pointer.point = point;
    if (this.pointer.vehicle?.status === 'waiting' && dist(point.x, point.y, this.pointer.start.x, this.pointer.start.y) > 24) {
      this.dragVehicle = this.pointer.vehicle;
      this.dragBay = this.garage.hitBay(point.x, point.y);
    }
  }

  onPointerUp(clientX, clientY) {
    if (!this.pointer) return;
    const point = this.toWorld(clientX, clientY);
    const moved = dist(point.x, point.y, this.pointer.start.x, this.pointer.start.y);
    if (this.dragVehicle) {
      const vehicle = this.dragVehicle;
      const bay = this.dragBay || this.garage.hitBay(point.x, point.y);
      this.dragVehicle = null;
      this.dragBay = null;
      this.pointer = null;
      if (bay) this.parkVehicle(vehicle, bay);
      else {
        vehicle.select();
        this.selectedVehicle = vehicle;
        this.particles.sparkle(vehicle.x, vehicle.y - 20, 5);
      }
      return;
    }
    this.pointer = null;
    if (moved < 32) this.tap(point.x, point.y);
  }

  tap(x, y) {
    if (this.hud.onTap(x, y)) return;

    const vehicle = this.vehicleAt(x, y);
    if (vehicle) {
      this.tapVehicle(vehicle);
      return;
    }

    if (this.towTruck.contains(x, y)) {
      this.towTruck.bounce = 1;
      this.towTruck.beacon = 1;
      this.sound.horn(105);
      this.particles.hearts(this.towTruck.x, this.towTruck.y - 45, 3);
      return;
    }

    if (this.pet.contains(x, y)) {
      this.pet.onTap();
      return;
    }

    const station = this.garage.hitStation(x, y);
    if (station) {
      this.tapStation(station);
      return;
    }

    const bay = this.garage.hitBay(x, y);
    if (bay) {
      const waiting = this.selectedVehicle?.status === 'waiting'
        ? this.selectedVehicle
        : this.vehicles.find((item) => item.status === 'waiting');
      if (waiting) this.parkVehicle(waiting, bay);
      else {
        this.sound.pop();
        this.particles.sparkle(bay.park.x, bay.park.y, 5);
      }
      return;
    }

    if (this.garage.containsBooth(x, y)) {
      this.requestPickup();
      return;
    }

    if (this.garage.containsEntrance(x, y)) {
      this.spawnArrival();
      return;
    }

    this.sound.pop();
    this.particles.sparkle(x, y, 4);
  }

  tapVehicle(vehicle) {
    if (this.pickupRequest) {
      if (vehicle === this.pickupRequest) this.pickupVehicle(vehicle);
      else vehicle.reactNotMe();
      return;
    }
    if (vehicle.status === 'waiting') {
      this.selectVehicle(vehicle);
      return;
    }
    if (vehicle.status === 'parked') {
      this.selectVehicle(vehicle);
      if (!triggerVehicleSurprise(vehicle)) {
        vehicle.bounce = 1;
        this.sound.pop();
      } else if (vehicle.surprise?.name === 'horn') {
        this.playVehicleHorn(vehicle);
      }
      this.save();
    }
  }

  selectVehicle(vehicle) {
    if (this.selectedVehicle && this.selectedVehicle !== vehicle) this.selectedVehicle.deselect();
    this.selectedVehicle = vehicle;
    vehicle.select();
    this.sound.ack();
    this.particles.sparkle(vehicle.x, vehicle.y - 30, 5);
  }

  spawnArrival(forcedType = null) {
    if (this.vehicles.some((vehicle) => ['arriving', 'waiting', 'parking'].includes(vehicle.status))) {
      const waiting = this.vehicles.find((vehicle) => vehicle.status === 'waiting');
      if (waiting) {
        waiting.bounce = 1;
        this.playVehicleHorn(waiting);
      } else this.sound.pop();
      return false;
    }
    const occupied = this.garage.occupiedBayIds();
    const possible = VEHICLE_TYPES.filter((type) => {
      const probe = { large: type === 'bus' || type === 'fire', x: this.garage.anchors.waiting.x };
      return this.garage.nearestOpenBay(probe, occupied) && !this.lastArrivalTypes.includes(type);
    });
    if (!possible.length) {
      this.sound.squeak();
      this.garage.flickerSign();
      return false;
    }
    const type = forcedType && possible.includes(forcedType) ? forcedType : pick(possible);
    this.lastArrivalTypes.unshift(type);
    this.lastArrivalTypes = this.lastArrivalTypes.slice(0, 2);
    const start = this.garage.anchors.arrivalStart;
    const vehicle = new Vehicle(this, {
      id: `car-${this.nextVehicleId++}`,
      type,
      status: 'arriving',
      x: start.x,
      y: start.y,
      heading: start.heading,
      care: { washed: false, charged: true, tires: true },
    });
    this.vehicles.push(vehicle);
    this.garage.openDoor();
    this.sound.door();
    vehicle.drive(this.garage.arrivalPath(vehicle), {
      status: 'arriving',
      onComplete: () => {
        vehicle.status = 'waiting';
        vehicle.expression = 'excited';
        vehicle.expressionTime = 2;
        vehicle.bounce = 1;
        this.garage.closeDoor();
        this.playVehicleHorn(vehicle);
        this.selectVehicle(vehicle);
        this.save();
      },
    });
    return true;
  }

  parkVehicle(vehicle, requestedBay) {
    if (!vehicle || vehicle.status !== 'waiting') return false;
    const occupied = this.garage.occupiedBayIds(vehicle);
    let bay = requestedBay;
    if (!bay || occupied.has(bay.id) || (vehicle.large && !bay.large)) {
      bay = this.garage.nearestOpenBay(vehicle, occupied);
    }
    if (!bay) {
      vehicle.bounce = 1;
      this.sound.squeak();
      return false;
    }
    vehicle.deselect();
    if (this.selectedVehicle === vehicle) this.selectedVehicle = null;
    const started = vehicle.drive(this.garage.parkingPath(vehicle, bay), {
      status: 'parking',
      onComplete: () => {
        this.parkVehicleInstant(vehicle, bay);
        this.sound.happy();
        this.particles.sparkle(vehicle.x, vehicle.y - 30, 12);
        this.save();
      },
    });
    return started;
  }

  parkVehicleInstant(vehicle, bay) {
    vehicle.motion.stop();
    vehicle.x = bay.park.x;
    vehicle.y = bay.park.y;
    vehicle.heading = bay.park.heading;
    vehicle.status = 'parked';
    vehicle.bayId = bay.id;
    vehicle.deselect();
  }

  requestPickup() {
    const parked = this.vehicles.filter((vehicle) => vehicle.status === 'parked' && !vehicle.problem);
    if (!parked.length) {
      this.sound.squeak();
      this.particles.sparkle(this.garage.pickupBooth.x, this.garage.pickupBooth.y - 80, 5);
      return;
    }
    this.pickupRequest = pick(parked);
    this.pickupRequest.bounce = 0.5;
    this.sound.pickupBell();
  }

  pickupVehicle(vehicle) {
    const bay = this.garage.bayById(vehicle.bayId);
    if (!bay) return;
    this.pickupRequest = null;
    vehicle.bayId = null;
    vehicle.deselect();
    vehicle.drive(this.garage.exitPath(vehicle, bay), {
      status: 'exiting',
      onComplete: () => {
        this.removeVehicle(vehicle);
        this.sound.fanfare();
        this.particles.confetti(800, 310, 55);
        this.pet.dance(4);
        for (const parked of this.vehicles.filter((item) => item.status === 'parked')) {
          parked.beginSurprise('headlights');
          this.playVehicleHorn(parked);
        }
        this.save();
      },
    });
  }

  tapStation(station) {
    const vehicle = this.selectedVehicle;
    if (!vehicle || vehicle.status !== 'parked') {
      this.sound.pop();
      this.particles.sparkle(station.x, station.y, 7);
      return;
    }
    if (station.id === 'wash') vehicle.care.washed = true;
    if (station.id === 'charge') vehicle.care.charged = true;
    if (station.id === 'air') vehicle.care.tires = true;
    vehicle.bounce = 1;
    station.active = vehicle.id;
    window.setTimeout(() => { if (station.active === vehicle.id) station.active = null; }, 1800);
    if (station.id === 'wash') this.particles.foam(vehicle.x, vehicle.y, 18);
    else this.particles.sparkle(vehicle.x, vehicle.y - 25, 12);
    this.sound.happy();
    this.save();
  }

  removeVehicle(vehicle) {
    const index = this.vehicles.indexOf(vehicle);
    if (index >= 0) this.vehicles.splice(index, 1);
    if (this.selectedVehicle === vehicle) this.selectedVehicle = null;
    if (this.pickupRequest === vehicle) this.pickupRequest = null;
  }

  vehicleAt(x, y) {
    return [...this.vehicles]
      .sort((a, b) => b.baseline - a.baseline)
      .find((vehicle) => vehicle.status !== 'exiting' && vehicle.contains(x, y)) || null;
  }

  toggleNight() {
    this.isNight = !this.isNight;
    this.sound.magic();
    this.particles.sparkle(1498, 100, 14);
    this.save();
  }

  playVehicleHorn(vehicle) {
    const pitches = { sports: 480, pickup: 315, taxi: 410, police: 540, fire: 185, icecream: 620, ev: 570, bus: 155 };
    this.sound.horn(pitches[vehicle.type] || 350);
  }

  playVehicleEngine(vehicle) {
    this.sound.rev(vehicle.config.electric ? 560 : vehicle.large ? 75 : 120);
  }

  onMotionCue(vehicle, cue) {
    if (cue === 'reverse' || cue === 'tow-reverse') this.sound.backupBeep();
    if (cue === 'hello') this.playVehicleHorn(vehicle);
  }

  say() {
    // The generated voice pack is wired in by the media pipeline; synth feedback
    // keeps this live workbench playful before those clips land.
  }

  save() {
    saveGarageState(this);
  }

  update(dt) {
    this.time += dt;
    if (window.innerWidth !== this._lastW || window.innerHeight !== this._lastH) {
      this._lastW = window.innerWidth;
      this._lastH = window.innerHeight;
      this.resize();
    }
    this.garage.update(dt);
    for (const vehicle of this.vehicles) vehicle.update(dt);
    this.towTruck.update(dt);
    this.pet.update(dt);
    this.particles.update(dt);
  }

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#10283a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, this.offsetX * this.dpr, this.offsetY * this.dpr);
    this.garage.drawBase(ctx);

    const entries = [
      ...this.vehicles.map((vehicle) => ({ baseline: vehicle.baseline, draw: () => vehicle.draw(ctx, this.assets) })),
      { baseline: this.towTruck.baseline, draw: () => this.towTruck.draw(ctx, this.assets) },
      { baseline: this.pet.baseline, draw: () => this.pet.draw(ctx) },
    ];
    entries.sort((a, b) => a.baseline - b.baseline);
    for (const entry of entries) entry.draw();
    this.garage.drawForeground(ctx);
    this.particles.draw(ctx);
    this.drawPickupBubble(ctx);
    this.drawTitle(ctx);
    this.drawVignette(ctx);
    if (this.debug) this.drawDebug(ctx);
    this.hud.draw(ctx);
  }

  // ?debug — registration truth: collision box (lime), tap zone (yellow),
  // wheels/heading, active motion paths, and every static hit zone.
  drawDebug(ctx) {
    ctx.save();
    ctx.lineWidth = 2;
    const poly = (points) => {
      ctx.beginPath();
      points.forEach((point, index) => (index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)));
      ctx.closePath();
      ctx.stroke();
    };
    for (const vehicle of [...this.vehicles, this.towTruck]) {
      ctx.strokeStyle = '#3dff6e';
      ctx.setLineDash([]);
      poly(vehicle.footprint());
      ctx.strokeStyle = '#ffe14d';
      ctx.setLineDash([6, 6]);
      poly(vehicle.footprint(38));
      ctx.setLineDash([]);
      ctx.fillStyle = '#ff4dc4';
      ctx.beginPath();
      ctx.arc(vehicle.x, vehicle.y, 4, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#ff4dc4';
      ctx.beginPath();
      ctx.moveTo(vehicle.x, vehicle.y);
      ctx.lineTo(vehicle.x + Math.cos(vehicle.heading) * 46, vehicle.y + Math.sin(vehicle.heading) * 46);
      ctx.stroke();
      const path = vehicle.motion.path;
      if (path) {
        ctx.strokeStyle = '#53e0ff';
        ctx.beginPath();
        for (const segment of path) {
          for (let index = 0; index <= 16; index++) {
            const point = cubicPoint(segment, index / 16);
            if (index === 0) ctx.moveTo(point.x, point.y);
            else ctx.lineTo(point.x, point.y);
          }
        }
        ctx.stroke();
      }
    }
    ctx.strokeStyle = '#ff4dc4';
    ctx.setLineDash([8, 6]);
    for (const bay of this.garage.bays) ctx.strokeRect(bay.hit.x, bay.hit.y, bay.hit.w, bay.hit.h);
    for (const station of this.garage.stations) ctx.strokeRect(station.hit.x, station.hit.y, station.hit.w, station.hit.h);
    const booth = this.garage.pickupBooth.hit;
    ctx.strokeRect(booth.x, booth.y, booth.w, booth.h);
    const road = this.garage.entrance.roadZone;
    ctx.strokeRect(road.x, road.y, road.w, road.h);
    const bell = this.garage.entrance.bell;
    ctx.beginPath();
    ctx.arc(bell.x, bell.y, bell.r + 28, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  drawPickupBubble(ctx) {
    if (!this.pickupRequest) return;
    const booth = this.garage.pickupBooth;
    const bob = Math.sin(this.time * 4) * 6;
    ctx.save();
    ctx.translate(booth.x - 92, booth.y - 170 + bob);
    ctx.shadowColor = 'rgba(15,35,45,.3)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#fff9df';
    ctx.beginPath();
    ctx.arc(0, 0, 105, 0, TAU);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#ffd75e';
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(58, 76);
    ctx.lineTo(92, 112);
    ctx.lineTo(42, 96);
    ctx.closePath();
    ctx.fill();
    const vehicle = this.pickupRequest;
    ctx.save();
    ctx.rotate(-vehicle.heading);
    const oldX = vehicle.x;
    const oldY = vehicle.y;
    const oldHeading = vehicle.heading;
    vehicle.x = 0;
    vehicle.y = 0;
    vehicle.heading = 0;
    vehicle.draw(ctx, this.assets, { portrait: true, scale: 0.85 });
    vehicle.x = oldX;
    vehicle.y = oldY;
    vehicle.heading = oldHeading;
    ctx.restore();
    ctx.restore();
  }

  drawTitle(ctx) {
    ctx.save();
    ctx.translate(760, 95 + Math.sin(this.time * 1.7) * 3);
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.font = '900 60px ui-rounded, "Arial Rounded MT Bold", sans-serif';
    ctx.strokeStyle = '#173e55';
    ctx.lineWidth = 15;
    ctx.strokeText('BEEP BEEP GARAGE!', 0, 0);
    ctx.fillStyle = '#fff1a8';
    ctx.fillText('BEEP BEEP GARAGE!', 0, 0);
    ctx.restore();
  }

  drawVignette(ctx) {
    const gradient = ctx.createRadialGradient(800, 450, 380, 800, 450, 920);
    gradient.addColorStop(0.72, 'rgba(10,25,35,0)');
    gradient.addColorStop(1, 'rgba(10,25,35,.24)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    if (window.__garageGame === this) delete window.__garageGame;
  }
}

function createWorkbenchSound() {
  const sound = {
    ctx: null,
    muted: false,
    unlock() {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.ctx.resume?.();
    },
    toggleMute() { this.muted = !this.muted; if (!this.muted) this.ack(); },
    tone(frequency, duration = 0.12, type = 'sine', volume = 0.09, delay = 0) {
      if (!this.ctx || this.muted) return;
      const start = this.ctx.currentTime + delay;
      const oscillator = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain).connect(this.ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.03);
    },
    pop() { this.tone(520, 0.08, 'sine', 0.07); },
    ack() { this.tone(620, 0.08, 'sine', 0.06); this.tone(850, 0.1, 'sine', 0.06, 0.08); },
    happy() { [540, 680, 850].forEach((frequency, index) => this.tone(frequency, 0.13, 'triangle', 0.065, index * 0.09)); },
    horn(frequency = 320) { this.tone(frequency, 0.24, 'square', 0.075); this.tone(frequency * 1.02, 0.19, 'sawtooth', 0.035, 0.05); },
    backupBeep() { this.tone(980, 0.11, 'square', 0.05); },
    squeak() { this.tone(760, 0.08, 'triangle', 0.05); this.tone(510, 0.1, 'triangle', 0.04, 0.07); },
    door() { [115, 105, 92].forEach((frequency, index) => this.tone(frequency, 0.3, 'sawtooth', 0.025, index * 0.13)); },
    pickupBell() { this.tone(920, 0.32, 'sine', 0.08); this.tone(1380, 0.38, 'sine', 0.045, 0.04); },
    rev(frequency = 110) { this.tone(frequency, 0.7, 'sawtooth', 0.04); this.tone(frequency * 2, 0.55, 'square', 0.018); },
    magic() { [420, 620, 840, 1120].forEach((frequency, index) => this.tone(frequency, 0.25, 'sine', 0.045, index * 0.08)); },
    fanfare() { [392, 523, 659, 784].forEach((frequency, index) => this.tone(frequency, 0.28, 'triangle', 0.055, index * 0.12)); },
    boing() { this.tone(240, 0.24, 'sine', 0.07); },
    alarmChirp() { this.tone(760, 0.08, 'square', 0.04); this.tone(620, 0.08, 'square', 0.04, 0.09); },
    tinyHorn() { this.horn(460); },
    catChirp() { this.tone(680, 0.15, 'triangle', 0.045); this.tone(880, 0.12, 'triangle', 0.035, 0.12); },
  };
  return sound;
}
