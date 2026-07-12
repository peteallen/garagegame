import { Garage, WORLD_H, WORLD_W } from './world/Garage.js';
import { Vehicle } from './entities/Vehicle.js';
import { TowTruck } from './entities/TowTruck.js';
import { Pet } from './entities/Pet.js';
import { VEHICLE_TYPES } from './entities/vehicleCatalog.js';
import { Particles } from './fx/Particles.js';
import { Hud } from './ui/Hud.js';
import { loadGarageState, saveGarageState } from './core/GarageState.js';
import { SoundEngine } from './core/SoundEngine.js';
import { Sfx } from './core/Sfx.js';
import { Voice } from './core/Voice.js';
import { cubicPoint, polygonsOverlap } from './core/VehicleMotion.js';
import { clamp, dist, pick, rand, roundRect, TAU } from './core/math.js';
import { idleSafeSurprise, triggerVehicleSurprise } from './actions/vehicleSurprises.js';

const SPLASH_DURATION = 4.2;
const IDLE_CHARM_MIN = 45;
const IDLE_CHARM_MAX = 60;

export class Game {
  constructor(canvas, assets = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.assets = assets;
    // Firefox's canvas backend makes large blurred shadows and full-screen
    // radial gradients dramatically more expensive than the game itself.
    this.reducedCanvasEffects = /Firefox\//.test(navigator.userAgent);
    this.time = 0;
    this.splashTime = SPLASH_DURATION;
    this.moveCounter = 0;
    this.movementQueue = [];
    this.isNight = false;
    this.selectedVehicle = null;
    this.pickupRequest = null;
    this.dragVehicle = null;
    this.dragBay = null;
    this.pointer = null;
    this.lastArrivalTypes = [];
    this.nextVehicleId = 1;
    this.sound = new SoundEngine();
    this.sfx = new Sfx(this.sound);
    this.voice = new Voice(this.sound);
    this.welcomed = false;
    this.idleCharmTime = rand(IDLE_CHARM_MIN, IDLE_CHARM_MAX);
    this.idleCharmArmed = true;
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
    // Adopt the whole audio stack — copying just the AudioContext onto a
    // fresh SoundEngine would leave it without its master/compressor graph.
    if (previous.sound?.master !== undefined) {
      this.sound = previous.sound;
      if (previous.sfx) this.sfx = previous.sfx;
      if (previous.voice) this.voice = previous.voice;
    }
    this.welcomed = Boolean(previous.welcomed);
    if (Number.isFinite(previous.idleCharmTime)) this.idleCharmTime = previous.idleCharmTime;
    if (typeof previous.idleCharmArmed === 'boolean') this.idleCharmArmed = previous.idleCharmArmed;
    this.splashTime = 0; // no splash replay on hot swaps mid-session
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const nativeDpr = Math.min(window.devicePixelRatio || 1, 2);
    const firefoxPixelBudget = 2_400_000;
    const budgetDpr = this.reducedCanvasEffects
      ? Math.sqrt(firefoxPixelBudget / Math.max(1, width * height))
      : 2;
    const dpr = Math.max(1, Math.min(nativeDpr, this.reducedCanvasEffects ? 1.5 : 2, budgetDpr));
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

  ownsPointer(pointerId) {
    return Boolean(this.pointer) && pointerId === this.pointer.id;
  }

  onPointerDown(clientX, clientY, pointerId = null) {
    if (this.pointer) return false;
    this.notePlayerActivity();
    this.sound.unlock();
    this.splashTime = Math.min(this.splashTime, 0.45);
    const point = this.toWorld(clientX, clientY);
    const vehicle = this.vehicleAt(point.x, point.y);
    this.pointer = { id: pointerId, start: point, point, time: performance.now(), vehicle };
    return true;
  }

  onPointerMove(clientX, clientY, pointerId = null) {
    if (!this.ownsPointer(pointerId)) return false;
    this.notePlayerActivity();
    const point = this.toWorld(clientX, clientY);
    this.pointer.point = point;
    if (['waiting', 'parked'].includes(this.pointer.vehicle?.status) && dist(point.x, point.y, this.pointer.start.x, this.pointer.start.y) > 24) {
      this.dragVehicle = this.pointer.vehicle;
      this.dragBay = this.garage.hitBay(point.x, point.y);
    }
    return true;
  }

  onPointerUp(clientX, clientY, pointerId = null) {
    if (!this.ownsPointer(pointerId)) return false;
    this.notePlayerActivity();
    const point = this.toWorld(clientX, clientY);
    const moved = dist(point.x, point.y, this.pointer.start.x, this.pointer.start.y);
    if (this.dragVehicle) {
      const vehicle = this.dragVehicle;
      const bay = this.dragBay || this.garage.hitBay(point.x, point.y);
      const station = bay ? null : this.garage.hitStation(point.x, point.y);
      this.dragVehicle = null;
      this.dragBay = null;
      this.pointer = null;
      if (bay && vehicle.status === 'waiting') this.parkVehicle(vehicle, bay);
      else if (bay && vehicle.status === 'parked' && vehicle.bayId !== bay.id) this.reparkVehicle(vehicle, bay);
      else if (station && vehicle.status === 'parked') {
        if (this.selectedVehicle && this.selectedVehicle !== vehicle) this.selectedVehicle.deselect();
        this.selectedVehicle = vehicle;
        vehicle.select();
        this.tapStation(station);
      } else if (!bay && vehicle.status === 'parked' && this.garage.containsRoad(point.x, point.y)) {
        this.sendVehicleOut(vehicle);
      } else {
        vehicle.select();
        this.selectedVehicle = vehicle;
        this.particles.sparkle(vehicle.x, vehicle.y - 20, 5);
      }
      return true;
    }
    this.pointer = null;
    if (moved < 32) this.tap(point.x, point.y);
    return true;
  }

  onPointerCancel(pointerId = null) {
    if (!this.ownsPointer(pointerId)) return false;
    this.dragVehicle = null;
    this.dragBay = null;
    this.pointer = null;
    return true;
  }

  tap(x, y) {
    if (this.hud.onTap(x, y)) return;

    const vehicle = this.vehicleAt(x, y);
    if (vehicle) {
      this.tapVehicle(vehicle);
      return;
    }

    if (this.towTruck.contains(x, y)) {
      // The tow truck's touch target overlaps the edge of the road. A road
      // tap still sends the selected parked vehicle out; otherwise the tow
      // truck performs its own playful interaction.
      if (this.selectedVehicle?.status === 'parked' && this.garage.containsRoad(x, y)) {
        this.sendVehicleOut(this.selectedVehicle);
        return;
      }
      this.towTruck.onTap();
      return;
    }

    if (this.pet.contains(x, y)) {
      this.pet.onTap();
      return;
    }

    // Booth before stations: its hit zone overlaps the wash pad's padding and
    // a pickup tap must never be eaten by a station.
    if (this.garage.containsBooth(x, y)) {
      this.requestPickup();
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
      else if (this.selectedVehicle?.status === 'parked' && this.selectedVehicle.bayId !== bay.id) {
        this.reparkVehicle(this.selectedVehicle, bay);
      } else {
        this.sound.pop();
        this.particles.sparkle(bay.park.x, bay.park.y, 5);
      }
      return;
    }

    // A selected parked car + a tap on the road = "you can go now!" This is
    // the direct way out; the booth pickup game stays as a bonus flow.
    if (this.selectedVehicle?.status === 'parked' && this.garage.containsRoad(x, y)) {
      this.sendVehicleOut(this.selectedVehicle);
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

  scheduleMovement(key, kind, vehicle, start) {
    const existing = this.movementQueue.find((entry) => entry.key === key);
    if (existing) {
      existing.kind = kind;
      existing.vehicle = vehicle;
      existing.start = start;
    } else {
      this.movementQueue.push({ key, kind, vehicle, start });
    }
    if (vehicle) vehicle.bounce = Math.max(vehicle.bounce, 0.45);
    this.pet.clearForTraffic();
    this.flushMovementQueue();
    return true;
  }

  hasActiveMovement() {
    return this.vehicles.some((vehicle) => vehicle.moving) || this.towTruck.moving;
  }

  canStartMovement(kind) {
    const active = [...this.vehicles, this.towTruck].filter((vehicle) => vehicle.moving);
    return active.every((vehicle) => {
      const activeKind = vehicle.movementKind;
      if (!activeKind) return false;
      return !(
        (kind === 'parking' && activeKind === 'exit') ||
        (kind === 'exit' && activeKind === 'parking')
      );
    });
  }

  flushMovementQueue() {
    if (!this.movementQueue.length) {
      if (!this.hasActiveMovement()) this.pet.releaseTraffic();
      return;
    }
    this.pet.clearForTraffic();
    if (!this.pet.trafficSafe) return;
    for (let index = 0; index < this.movementQueue.length;) {
      const next = this.movementQueue[index];
      if (!this.canStartMovement(next.kind)) {
        index += 1;
        continue;
      }
      this.movementQueue.splice(index, 1);
      next.start();
    }
    if (!this.hasActiveMovement() && !this.movementQueue.length) this.pet.releaseTraffic();
  }

  spawnArrival(forcedType = null, scheduled = false) {
    if (this.vehicles.some((vehicle) => ['arriving', 'waiting', 'parking'].includes(vehicle.status))) {
      const waiting = this.vehicles.find((vehicle) => vehicle.status === 'waiting');
      if (waiting) {
        waiting.bounce = 1;
        this.playVehicleHorn(waiting);
      } else this.sound.pop();
      return false;
    }
    if (!scheduled) {
      return this.scheduleMovement('arrival', 'arrival', null, () => this.spawnArrival(forcedType, true));
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
    this.playSfx('doorbell', () => this.sound.pickupBell());
    this.playSfx('garage_door_open', () => this.sound.door());
    if (!this.welcomed) {
      this.welcomed = true;
      this.say('garage_welcome');
    }
    vehicle.movementKind = 'arrival';
    vehicle.drive(this.garage.arrivalPath(vehicle), {
      status: 'arriving',
      onComplete: () => {
        vehicle.status = 'waiting';
        vehicle.expression = 'excited';
        vehicle.expressionTime = 2;
        vehicle.bounce = 1;
        this.garage.closeDoor();
        this.playSfx('garage_door_close', () => this.sound.door());
        this.playVehicleHorn(vehicle);
        this.say('hello_park', vehicle);
        this.selectVehicle(vehicle);
        this.save();
      },
    });
    return true;
  }

  parkVehicle(vehicle, requestedBay, scheduled = false) {
    if (!vehicle || vehicle.status !== 'waiting') return false;
    if (!scheduled) {
      return this.scheduleMovement(
        `vehicle:${vehicle.id}`,
        'parking',
        vehicle,
        () => this.parkVehicle(vehicle, requestedBay, true),
      );
    }
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
    vehicle.targetBayId = bay.id;
    vehicle.movementKind = 'parking';
    const started = vehicle.drive(this.garage.parkingPath(vehicle, bay), {
      status: 'parking',
      onComplete: () => {
        this.parkVehicleInstant(vehicle, bay);
        this.sound.happy();
        this.particles.sparkle(vehicle.x, vehicle.y - 30, 12);
        this.save();
      },
    });
    if (!started) vehicle.targetBayId = null;
    return started;
  }

  parkVehicleInstant(vehicle, bay) {
    vehicle.motion.stop();
    vehicle.x = bay.park.x;
    vehicle.y = bay.park.y;
    vehicle.heading = bay.park.heading;
    vehicle.status = 'parked';
    vehicle.bayId = bay.id;
    vehicle.targetBayId = null;
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
    this.playSfx('pickup_bell', () => this.sound.pickupBell());
  }

  pickupVehicle(vehicle, scheduled = false) {
    if (!vehicle || vehicle.status !== 'parked') return false;
    if (!scheduled) {
      return this.scheduleMovement(
        `vehicle:${vehicle.id}`,
        'exit',
        vehicle,
        () => this.pickupVehicle(vehicle, true),
      );
    }
    const bay = this.garage.bayById(vehicle.bayId);
    if (!bay) return false;
    this.pickupRequest = null;
    vehicle.bayId = null;
    vehicle.deselect();
    this.say('thats_me', vehicle);
    vehicle.movementKind = 'exit';
    vehicle.drive(this.garage.exitPath(vehicle, bay), {
      status: 'exiting',
      onComplete: () => {
        this.removeVehicle(vehicle);
        this.playSfx('party_horns', () => this.sound.fanfare());
        this.playSfx('confetti_pop', null);
        this.particles.confetti(800, 310, 55);
        this.pet.dance(4);
        for (const parked of this.vehicles.filter((item) => item.status === 'parked')) {
          parked.beginSurprise('headlights');
          this.playVehicleHorn(parked);
        }
        this.save();
      },
    });
    return true;
  }

  sendVehicleOut(vehicle, scheduled = false) {
    if (!vehicle || vehicle.status !== 'parked') return false;
    if (!scheduled) {
      return this.scheduleMovement(
        `vehicle:${vehicle.id}`,
        'exit',
        vehicle,
        () => this.sendVehicleOut(vehicle, true),
      );
    }
    const bay = this.garage.bayById(vehicle.bayId);
    if (!bay) return false;
    if (this.pickupRequest === vehicle) this.pickupRequest = null;
    vehicle.deselect();
    if (this.selectedVehicle === vehicle) this.selectedVehicle = null;
    vehicle.bayId = null;
    vehicle.expression = 'excited';
    vehicle.expressionTime = 2;
    vehicle.movementKind = 'exit';
    const started = vehicle.drive(this.garage.exitPath(vehicle, bay), {
      status: 'exiting',
      onComplete: () => {
        this.removeVehicle(vehicle);
        this.save();
      },
    });
    if (!started) {
      vehicle.status = 'parked';
      vehicle.bayId = bay.id;
      return false;
    }
    this.say('thats_me', vehicle);
    this.playVehicleHorn(vehicle);
    this.playVehicleEngine(vehicle);
    this.particles.sparkle(vehicle.x, vehicle.y - 30, 10);
    this.save();
    return true;
  }

  tapStation(station) {
    // Service trips are not playable yet. If the hidden station art is enabled
    // for layout work, it only gives neutral feedback instead of pretending a
    // remote repair took place.
    this.sound.pop();
    this.particles.sparkle(station.x, station.y, 7);
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
    if (this.isNight) this.say('good_night');
    this.particles.sparkle(1498, 100, 14);
    this.save();
  }

  // Recorded clip first, synth recipe as the always-there fallback.
  playSfx(name, fallback, opts) {
    if (!this.sfx?.play?.(name, opts)) fallback?.();
  }

  playVehicleHorn(vehicle) {
    const pitches = { sports: 480, pickup: 315, taxi: 410, police: 540, fire: 185, icecream: 620, ev: 570, bus: 155 };
    this.playSfx(vehicle.config.horn, () => this.sound.horn(pitches[vehicle.type] || 350));
  }

  playVehicleEngine(vehicle) {
    this.playSfx(vehicle.config.engine, () => this.sound.rev(vehicle.config.electric ? 560 : vehicle.large ? 75 : 120), { vol: 0.55 });
  }

  // Solid-vehicle yielding: a mover holds when its ahead-probe touches anyone.
  // A car already ahead always keeps moving, even if it started later; this
  // makes the road act like a polite single-file lane instead of letting a
  // faster, earlier mover drive through its rear bumper. Only when both cars'
  // probes see each other does move order break the tie. Stationary blockers
  // always win.
  motionBlocked(vehicle) {
    // Any direct or future movement call that did not come through the queue
    // still waits at its validated start pose until the cat reaches refuge.
    if (!this.pet?.trafficSafe) {
      this.pet?.clearForTraffic();
      return true;
    }
    const probe = vehicle.aheadFootprint();
    // The tow truck stays a friendly prop (not solid) until the rescue arc
    // lands — its home pad sits inside the bay backing sweep, so treating it
    // as an obstacle would deadlock parking maneuvers.
    for (const other of this.vehicles) {
      if (other === vehicle) continue;
      if (!polygonsOverlap(probe, other.footprint(4))) continue;
      if (other.moving) {
        const mutualConflict = polygonsOverlap(other.aheadFootprint(), vehicle.footprint(4));
        if (!mutualConflict || other.moveSeq < vehicle.moveSeq) return true;
        continue;
      }
      return true;
    }
    return false;
  }

  reparkVehicle(vehicle, requestedBay, scheduled = false) {
    if (!vehicle || vehicle.status !== 'parked') return false;
    if (!scheduled) {
      return this.scheduleMovement(
        `vehicle:${vehicle.id}`,
        'repark',
        vehicle,
        () => this.reparkVehicle(vehicle, requestedBay, true),
      );
    }
    const fromBay = this.garage.bayById(vehicle.bayId);
    if (!fromBay) return false;
    const occupied = this.garage.occupiedBayIds(vehicle);
    let bay = requestedBay;
    if (!bay || occupied.has(bay.id) || (vehicle.large && !bay.large)) {
      bay = this.garage.nearestOpenBay(vehicle, occupied);
    }
    if (!bay || bay.id === fromBay.id) {
      vehicle.bounce = 1;
      this.sound.squeak();
      return false;
    }
    vehicle.deselect();
    if (this.selectedVehicle === vehicle) this.selectedVehicle = null;
    vehicle.bayId = null;
    vehicle.targetBayId = bay.id;
    vehicle.movementKind = 'repark';
    const started = vehicle.drive(this.garage.reparkPath(vehicle, fromBay, bay), {
      status: 'parking',
      onComplete: () => {
        this.parkVehicleInstant(vehicle, bay);
        this.sound.happy();
        this.particles.sparkle(vehicle.x, vehicle.y - 30, 12);
        this.save();
      },
    });
    if (!started) {
      vehicle.status = 'parked';
      vehicle.bayId = fromBay.id;
      vehicle.targetBayId = null;
      return false;
    }
    this.playVehicleEngine(vehicle);
    this.save();
    return true;
  }

  onMotionCue(vehicle, cue) {
    if (cue === 'hello') this.playVehicleHorn(vehicle);
  }

  say(key, vehicle = null, options = {}) {
    const spoken = this.voice?.say?.(key, { vehicleType: vehicle?.type, ...options });
    if (!spoken) this.sound.chime?.();
    return spoken;
  }

  save() {
    saveGarageState(this);
  }

  notePlayerActivity() {
    this.idleCharmTime = rand(IDLE_CHARM_MIN, IDLE_CHARM_MAX);
    this.idleCharmArmed = true;
  }

  runIdleCharm() {
    const candidates = this.vehicles.filter((vehicle) =>
      vehicle.status === 'parked' && !vehicle.moving && !vehicle.problem && !vehicle.surprise
    );
    while (candidates.length) {
      const [vehicle] = candidates.splice(Math.floor(Math.random() * candidates.length), 1);
      if (idleSafeSurprise(vehicle)) return;
    }
    this.pet.idleCharm();
  }

  update(dt) {
    this.time += dt;
    this.splashTime = Math.max(0, this.splashTime - dt);
    if (this.idleCharmArmed) {
      this.idleCharmTime -= dt;
      if (this.idleCharmTime <= 0) {
        this.idleCharmArmed = false;
        this.runIdleCharm();
      }
    }
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
    this.flushMovementQueue();
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
    if (!this.reducedCanvasEffects) this.drawVignette(ctx);
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
    if (this.garage.serviceStationsEnabled) {
      for (const station of this.garage.stations) ctx.strokeRect(station.hit.x, station.hit.y, station.hit.w, station.hit.h);
    }
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
    const beauty = this.assets?.get?.(`portrait_${vehicle.type}`);
    if (beauty) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, 92, 0, TAU);
      ctx.clip();
      ctx.drawImage(beauty, -92, -92, 184, 184);
      ctx.restore();
    } else {
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
    }
    ctx.restore();
  }

  drawTitle(ctx) {
    // The painted building carries the branding; the logo appears as a brief
    // startup splash instead of floating text.
    if (this.assets?.get?.('building')) {
      this.drawSplash(ctx);
      return;
    }
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

  drawSplash(ctx) {
    if (this.splashTime <= 0) return;
    const logo = this.assets?.get?.('title_logo');
    if (!logo) return;
    const appear = clamp((SPLASH_DURATION - this.splashTime) / 0.45, 0, 1);
    const fade = clamp(this.splashTime / 0.6, 0, 1);
    const alpha = Math.min(appear, fade);
    if (alpha <= 0.01) return;
    const width = 660 + Math.sin(this.time * 1.9) * 8;
    const height = width * (logo.height / logo.width);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(16,32,48,.45)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 10;
    ctx.drawImage(logo, 800 - width / 2, 300 - height / 2 - (1 - appear) * 40, width, height);
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
