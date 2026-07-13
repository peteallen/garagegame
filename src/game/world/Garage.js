import { clamp, pointInRect, roundRect, TAU } from '../core/math.js';

export const WORLD_W = 1600;
export const WORLD_H = 900;

const point = (x, y) => ({ x, y });

export class Garage {
  constructor(game) {
    this.game = game;
    this.cloudOffset = 0;
    this.petBounds = { minX: 280, maxX: 1180, minY: 585, maxY: 705 };
    this.anchors = {
      arrivalStart: { x: -170, y: 760, heading: 0 },
      waiting: { x: 175, y: 760, heading: 0 },
      // The tow truck lives below the moving road lane, clear of even the
      // school bus's body sweep, while remaining mostly visible and tappable.
      towHome: { x: 1470, y: 870, heading: Math.PI },
      exit: { x: 1760, y: 760, heading: 0 },
    };
    this.pickupBooth = { x: 1490, y: 600, w: 105, h: 160, hit: { x: 1430, y: 530, w: 170, h: 250 } };
    // Keep service equipment off the playfield until its validated driving
    // arcs and interactions are ready to ship together.
    this.serviceStationsEnabled = false;
    // Bay geometry is measured from the painted building sprite (stall
    // openings at these centers/widths when drawn at rect 198,41,1070,561);
    // the procedural fallback draws at the same coordinates.
    this.bays = [
      makeBay('bay-a', 368, 174, false),
      makeBay('bay-b', 597, 174, false),
      makeBay('bay-c', 823, 174, false),
      makeBay('big-bay', 1075, 219, true),
    ];
    this.stations = [
      makeStation('wash', 1360, 600, 250, 174, '#64c9dc', 4.4),
      makeStation('charge', 1205, 715, 150, 118, '#66d49b', 3.8),
      makeStation('air', 1400, 715, 150, 118, '#f2bd4b', 3.6),
      makeStation('lift', 1288, 828, 270, 104, '#da8066', 4.8),
    ];
    this.obstacles = [
      { id: 'building-left', x: 198, y: 223, w: 83, h: 380 },
      { id: 'building-right', x: 1185, y: 223, w: 83, h: 380 },
      { id: 'wash-wall', x: 1228, y: 210, w: 12, h: 380 },
      ...this.bays.slice(0, -1).map((bay, index) => {
        const next = this.bays[index + 1];
        const left = bay.x + bay.w / 2;
        return { id: `divider-${bay.id}`, x: left, y: 223, w: next.x - next.w / 2 - left, h: 380 };
      }),
    ];
  }

  update(dt) {
    this.cloudOffset = (this.cloudOffset + dt * 7) % (WORLD_W + 400);
  }

  bayById(id) {
    return this.bays.find((bay) => bay.id === id) || null;
  }

  stationById(id) {
    return this.stations.find((station) => station.id === id) || null;
  }

  occupiedBayIds(excludeVehicle = null) {
    // targetBayId reserves a bay while a car is still driving toward it, so
    // two movers can never be sent to the same stall.
    return new Set(this.game.vehicles
      .filter((vehicle) => vehicle !== excludeVehicle && vehicle.status !== 'exiting')
      .flatMap((vehicle) => [vehicle.bayId, vehicle.targetBayId])
      .filter(Boolean));
  }

  nearestOpenBay(vehicle, excluded = this.occupiedBayIds(vehicle)) {
    const occupied = excluded instanceof Set ? excluded : new Set(excluded || []);
    const open = this.bays.filter((bay) => !occupied.has(bay.id));
    if (!open.length) return null;
    if (vehicle?.large || vehicle?.config?.large) {
      return open.find((bay) => bay.large) || null;
    }
    const regular = open.filter((bay) => !bay.large);
    const candidates = regular.length ? regular : open;
    const x = vehicle?.x ?? this.anchors.waiting.x;
    return candidates.sort((first, second) => Math.abs(first.park.x - x) - Math.abs(second.park.x - x))[0];
  }

  hitBay(x, y) {
    return this.bays.find((bay) => pointInRect(x, y, bay.hit, 18)) || null;
  }

  hitStation(x, y) {
    if (!this.serviceStationsEnabled) return null;
    return this.stations.find((station) => pointInRect(x, y, station.hit, 22)) || null;
  }

  containsBooth(x, y) {
    return pointInRect(x, y, this.pickupBooth.hit, 16);
  }

  // The full road strip — dropping or aiming a parked car here means
  // "drive out please".
  containsRoad(x, y) {
    return y >= 688 && y <= 838;
  }

  arrivalPath(vehicle) {
    const start = { x: vehicle.x, y: vehicle.y };
    const wait = this.anchors.waiting;
    return [straight(start, point(wait.x, wait.y), 150, { cue: 'hello' })];
  }

  parkingPath(vehicle, bay, start = { x: vehicle.x, y: vehicle.y }) {
    const offset = vehicle.large ? 112 : 88;
    const radius = vehicle.config.minTurnRadius + 22;
    const backing = point(bay.park.x + offset, 760 + radius);
    const approachX = backing.x - radius;
    const kappa = 0.5522848;
    const first = straight(start, point(approachX, 760), vehicle.config.speed);
    const turn = {
      p0: first.p3,
      p1: point(approachX + radius * kappa, 760),
      p2: point(backing.x, backing.y - radius * kappa),
      p3: backing,
      direction: 1,
      speed: vehicle.config.speed * 0.72,
      cue: 'turn-to-bay',
    };
    const reverse = {
      p0: backing,
      p1: point(backing.x, backing.y - 125),
      p2: point(bay.park.x, 580),
      p3: point(bay.park.x, bay.park.y),
      direction: -1,
      speed: vehicle.large ? 76 : 88,
      cue: 'reverse',
    };
    return [first, turn, reverse];
  }

  exitPath(vehicle, bay) {
    const lane = this.pathOutOfBay(vehicle, bay);
    const start = lane.at(-1).p3;
    lane.push(straight(start, point(this.anchors.exit.x, this.anchors.exit.y), vehicle.config.speed * 1.05, { cue: 'exit' }));
    return lane;
  }

  servicePath(vehicle, bay, station) {
    const lane = this.pathOutOfBay(vehicle, bay);
    let start = lane.at(-1).p3;
    const entryX = station.pose.x - 500;
    if (entryX <= start.x + 30) {
      lane.push(...this.offscreenRoadLoop(start, vehicle.config.speed));
      start = lane.at(-1).p3;
    }
    if (entryX > start.x + 4) lane.push(straight(start, point(entryX, 760), vehicle.config.speed));
    const p0 = lane.at(-1).p3;
    lane.push({
      p0,
      p1: point(p0.x + 200, p0.y),
      p2: point(station.pose.x - 200, station.pose.y),
      p3: point(station.pose.x, station.pose.y),
      direction: 1,
      speed: vehicle.config.speed * 0.7,
      cue: `enter-${station.id}`,
    });
    return lane;
  }

  serviceReturnPath(vehicle, station, bay) {
    return this.offscreenLoopToBay(vehicle, point(station.pose.x, station.pose.y), bay);
  }

  towApproachPath(tow, vehicle, bay) {
    const radius = tow.config.minTurnRadius + 25;
    const kappa = 0.5522848;
    const laneY = 810;
    const start = point(tow.x, tow.y);
    const turnStart = point(bay.park.x + radius, laneY);
    const horizontalRun = Math.max(1, start.x - turnStart.x);
    const control = clamp(horizontalRun * 0.3, 72, 190);
    const backing = point(bay.park.x, laneY + radius);
    const hook = this.towHookPose(tow, vehicle, bay);
    return [{
      p0: start,
      p1: point(start.x - control, start.y),
      p2: point(turnStart.x + control, turnStart.y),
      p3: turnStart,
      direction: 1,
      speed: 300,
      cue: 'tow-dispatch',
    }, {
      p0: turnStart,
      p1: point(turnStart.x - radius * kappa, turnStart.y),
      p2: point(backing.x, backing.y - radius * kappa),
      p3: backing,
      direction: 1,
      speed: 270,
    }, {
      p0: backing,
      p1: point(backing.x, backing.y - 100),
      p2: point(hook.x, hook.y + 100),
      p3: hook,
      direction: -1,
      speed: 125,
      cue: 'tow-reverse',
    }];
  }

  towHookPose(tow, vehicle, bay) {
    const gap = vehicle.config.length / 2 + tow.config.length / 2 + 20;
    return point(bay.park.x, bay.park.y + gap);
  }

  towAwayPaths(tow, vehicle) {
    // Both actors cover exactly the same displacement in exactly the same
    // time. They remain visibly coupled while each independently follows a
    // validated motion path; no frame-by-frame pose copying is involved.
    const targetEndY = 1120;
    const displacement = targetEndY - vehicle.y;
    const duration = displacement / 190;
    const targetEnd = point(vehicle.x, targetEndY);
    const towEnd = point(tow.x, tow.y + displacement);
    return {
      target: [straight(point(vehicle.x, vehicle.y), targetEnd, 190, { duration, cue: 'tow-away' })],
      tow: [straight(point(tow.x, tow.y), towEnd, 190, { duration, cue: 'tow-away' })],
    };
  }

  towHomePath(tow) {
    const start = point(tow.x, tow.y);
    const radius = 180;
    const kappa = 0.5522848;
    const bottom = point(start.x, 1450);
    const lowerRight = point(start.x + radius, 1450 + radius);
    const farRight = point(1850, lowerRight.y);
    const upperRight = point(2030, 1450);
    const rightEntry = point(2030, 950);
    const leftEntry = point(1850, 770);
    const home = this.anchors.towHome;
    return [
      straight(start, bottom, 520),
      {
        p0: bottom,
        p1: point(bottom.x, bottom.y + radius * kappa),
        p2: point(lowerRight.x - radius * kappa, lowerRight.y),
        p3: lowerRight,
        direction: 1,
        speed: 520,
      },
      straight(lowerRight, farRight, 540),
      {
        p0: farRight,
        p1: point(farRight.x + radius * kappa, farRight.y),
        p2: point(upperRight.x, upperRight.y + radius * kappa),
        p3: upperRight,
        direction: 1,
        speed: 520,
      },
      straight(upperRight, rightEntry, 540),
      {
        p0: rightEntry,
        p1: point(rightEntry.x, rightEntry.y - radius * kappa),
        p2: point(leftEntry.x + radius * kappa, leftEntry.y),
        p3: leftEntry,
        direction: 1,
        speed: 520,
      },
      {
        p0: leftEntry,
        p1: point(leftEntry.x - 130, leftEntry.y),
        p2: point(home.x + 130, home.y),
        p3: point(home.x, home.y),
        direction: 1,
        speed: 520,
        cue: 'tow-home',
      },
    ];
  }

  pathOutOfBay(vehicle, bay) {
    const start = point(vehicle.x, vehicle.y);
    const radius = vehicle.config.minTurnRadius + 22;
    const kappa = 0.5522848;
    const turnStart = point(bay.park.x, 760 - radius);
    const laneEnd = point(bay.park.x + radius, 760);
    return [
      straight(start, turnStart, vehicle.config.speed * 0.68, { cue: 'leave-bay' }),
      {
        p0: turnStart,
        p1: point(turnStart.x, turnStart.y + radius * kappa),
        p2: point(laneEnd.x - radius * kappa, laneEnd.y),
        p3: laneEnd,
        direction: 1,
        speed: vehicle.config.speed * 0.78,
      },
    ];
  }

  // Bay-to-bay move: pull out onto the lane, then either continue right into
  // the reverse-in maneuver, or — when the target is behind the pull-out
  // point — drive around the block (offscreen loop) and come back in from
  // the left. Real driving the whole way; the validator checks every join.
  reparkPath(vehicle, fromBay, bay) {
    const lane = this.pathOutOfBay(vehicle, fromBay);
    const start = lane.at(-1).p3;
    const offset = vehicle.large ? 112 : 88;
    const radius = vehicle.config.minTurnRadius + 22;
    const approachX = bay.park.x + offset - radius;
    if (approachX > start.x + 40) {
      return [...lane, ...this.parkingPath(vehicle, bay, start)];
    }
    return [...lane, ...this.offscreenLoopToBay(vehicle, start, bay)];
  }

  offscreenLoopToBay(vehicle, start, bay, { towing = false } = {}) {
    const speed = towing ? 105 : vehicle.config.speed;
    const path = this.offscreenRoadLoop(start, speed);
    const entry = path.at(-1).p3;
    return [...path, ...this.parkingPath(vehicle, bay, entry)];
  }

  offscreenRoadLoop(start, speed) {
    const right = point(1740, start.y);
    const lowerRight = point(1740, 1110);
    const lowerLeft = point(-240, 1110);
    const entry = point(-240, 760);
    const path = [straight(start, right, speed)];
    path.push({
      p0: right,
      p1: point(2050, right.y),
      p2: point(2050, lowerRight.y),
      p3: lowerRight,
      direction: 1,
      speed,
    });
    path.push(straight(lowerRight, lowerLeft, speed * 1.25));
    path.push({
      p0: lowerLeft,
      p1: point(-550, lowerLeft.y),
      p2: point(-550, entry.y),
      p3: entry,
      direction: 1,
      speed,
    });
    return path;
  }

  sprite(name) {
    return this.game.assets?.get?.(name) || null;
  }

  drawBase(ctx) {
    const night = this.game.isNight;
    const ground = this.sprite('ground');
    if (ground) {
      ctx.drawImage(ground, 0, 0, WORLD_W, WORLD_H);
      // Stars belong to the sky layer. Drawing them here keeps the garage,
      // booth, and every other foreground prop in front of them.
      if (night) this.drawStars(ctx);
      this.drawClouds(ctx, night);
    } else {
      this.drawSky(ctx, night);
      this.drawGround(ctx, night);
    }
    this.drawBuilding(ctx, night);
    this.drawBays(ctx, night);
    if (this.serviceStationsEnabled) this.drawStationsBase(ctx, night);
    this.drawBooth(ctx, night);
    if (night && ground) {
      // Painted world goes dark with one tint pass; vehicles draw after this
      // so their lights stay bright. The stars were already laid into the sky
      // and remain behind the building instead of sparkling through its roof.
      ctx.fillStyle = 'rgba(13,26,62,.44)';
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }
    if (night) this.drawNightLighting(ctx);
  }

  drawForeground(ctx) {
    const night = this.game.isNight;
    if (!this.sprite('building')) {
      ctx.fillStyle = night ? '#304955' : '#315866';
      for (const bay of this.bays) {
        const x = bay.x - bay.w / 2 - 12;
        roundRect(ctx, x, 260, 20, 330, 9);
        ctx.fill();
      }
      const last = this.bays.at(-1);
      roundRect(ctx, last.x + last.w / 2 - 8, 260, 20, 330, 9);
      ctx.fill();
    }
    if (this.serviceStationsEnabled) {
      this.drawWashForeground(ctx);
      this.drawLiftForeground(ctx);
    }
  }

  drawSky(ctx, night) {
    const sky = ctx.createLinearGradient(0, 0, 0, 560);
    sky.addColorStop(0, night ? '#152c4c' : '#77cfee');
    sky.addColorStop(1, night ? '#486282' : '#d8f3ea');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    if (night) this.drawStars(ctx);
    this.drawClouds(ctx, night);
  }

  drawStars(ctx) {
    ctx.fillStyle = 'rgba(255,244,180,.9)';
    for (let index = 0; index < 38; index++) {
      const x = (index * 197 + 43) % WORLD_W;
      const y = 28 + (index * 83) % 235;
      const size = index % 5 === 0 ? 3 : 1.6;
      ctx.fillRect(x, y, size, size);
    }
  }

  drawClouds(ctx, night) {
    for (let index = 0; index < 3; index++) {
      const x = ((index * 620 + 140 + this.cloudOffset * (0.6 + index * 0.15)) % 1900) - 180;
      const y = 85 + index * 55;
      ctx.fillStyle = night ? 'rgba(185,205,221,.18)' : 'rgba(255,255,255,.63)';
      drawCloud(ctx, x, y, 0.72 + index * 0.15);
    }
  }

  drawGround(ctx, night) {
    ctx.fillStyle = night ? '#3d625d' : '#6eaa63';
    ctx.beginPath();
    ctx.moveTo(0, 350);
    ctx.quadraticCurveTo(260, 285, 520, 360);
    ctx.quadraticCurveTo(820, 275, 1110, 350);
    ctx.quadraticCurveTo(1380, 290, 1600, 335);
    ctx.lineTo(1600, 680);
    ctx.lineTo(0, 680);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = night ? '#273d4d' : '#3b5964';
    ctx.fillRect(0, 575, WORLD_W, 325);
    ctx.fillStyle = night ? '#324c5b' : '#496b76';
    ctx.fillRect(0, 705, WORLD_W, 155);
    ctx.strokeStyle = night ? '#d5bd67' : '#f3d56e';
    ctx.lineWidth = 8;
    ctx.setLineDash([74, 56]);
    ctx.beginPath();
    ctx.moveTo(0, 803);
    ctx.lineTo(WORLD_W, 803);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawBuilding(ctx, night) {
    const sprite = this.sprite('building');
    if (sprite) {
      ctx.save();
      if (!this.game.reducedCanvasEffects) {
        ctx.shadowColor = 'rgba(17,32,39,.25)';
        ctx.shadowBlur = 24;
        ctx.shadowOffsetY = 14;
      }
      ctx.drawImage(sprite, 198, 41, 1070, 561);
      ctx.restore();
      if (night) {
        // Warm steady glow over the painted bulb strip at night.
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = '#ffde7a';
        ctx.globalCompositeOperation = 'lighter';
        roundRect(ctx, 240, 66, 986, 78, 34);
        ctx.fill();
        ctx.restore();
      }
      return;
    }
    ctx.save();
    if (!this.game.reducedCanvasEffects) {
      ctx.shadowColor = 'rgba(17,32,39,.28)';
      ctx.shadowBlur = 26;
      ctx.shadowOffsetY = 16;
    }
    ctx.fillStyle = night ? '#b98c59' : '#f0bf76';
    roundRect(ctx, 218, 180, 1030, 420, 28);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = night ? '#9b3f3a' : '#d85145';
    roundRect(ctx, 198, 158, 1070, 74, 24);
    ctx.fill();
    ctx.fillStyle = night ? '#f4d66e' : '#ffe39a';
    for (let x = 235; x < 1230; x += 64) {
      ctx.globalAlpha = night ? 0.8 : 0.85;
      roundRect(ctx, x, 180, 38, 15, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawBays(ctx, night) {
    const painted = Boolean(this.sprite('building'));
    for (const bay of this.bays) {
      if (!painted) {
        ctx.fillStyle = night ? '#182b3d' : '#264752';
        roundRect(ctx, bay.x - bay.w / 2, 255, bay.w, 335, 18);
        ctx.fill();
        const inner = ctx.createLinearGradient(0, 270, 0, 580);
        inner.addColorStop(0, night ? '#26394b' : '#3f6670');
        inner.addColorStop(1, night ? '#172b39' : '#294955');
        ctx.fillStyle = inner;
        roundRect(ctx, bay.x - bay.w / 2 + 12, 270, bay.w - 24, 306, 12);
        ctx.fill();
        ctx.strokeStyle = night ? 'rgba(255,224,132,.34)' : 'rgba(255,238,175,.32)';
        ctx.lineWidth = 5;
        ctx.setLineDash([18, 14]);
        ctx.beginPath();
        ctx.moveTo(bay.x, 565);
        ctx.lineTo(bay.x, 455);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle = bay.large ? '#f1b648' : '#8ed0c4';
      ctx.beginPath();
      ctx.arc(bay.x, painted ? 205 : 290, painted ? 9 : 11, 0, TAU);
      ctx.fill();
      if (this.game.dragBay?.id === bay.id) {
        ctx.strokeStyle = '#ffeb72';
        ctx.lineWidth = 10;
        ctx.globalAlpha = 0.75 + Math.sin(this.game.time * 8) * 0.18;
        roundRect(ctx, bay.x - bay.w / 2 + 6, painted ? 232 : 265, bay.w - 12, painted ? 356 : 316, 14);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  drawStationsBase(ctx, night) {
    const wash = this.stationById('wash');
    const washSprite = this.sprite('wash');
    if (washSprite) {
      drawAnchored(ctx, washSprite, wash.x, wash.y + wash.h / 2 + 4, 292);
    } else {
      ctx.fillStyle = night ? '#254355' : '#dce9d8';
      roundRect(ctx, wash.x - wash.w / 2, wash.y - wash.h / 2 - 112, wash.w, wash.h + 112, 28);
      ctx.fill();
      ctx.fillStyle = '#62c8d7';
      roundRect(ctx, wash.x - wash.w / 2 + 12, wash.y - wash.h / 2 - 100, wash.w - 24, 58, 19);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      for (let index = 0; index < 3; index++) {
        ctx.beginPath();
        ctx.arc(wash.x - 50 + index * 50, wash.y - wash.h / 2 - 71, 11, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = night ? '#203846' : '#314f59';
      roundRect(ctx, wash.x - wash.w / 2 + 18, wash.y - wash.h / 2 - 32, wash.w - 36, wash.h + 22, 18);
      ctx.fill();
    }

    const stationSprites = { charge: 158, air: 172, lift: 288 };
    for (const [id, width] of Object.entries(stationSprites)) {
      const station = this.stationById(id);
      const sprite = this.sprite(id);
      if (sprite) drawAnchored(ctx, sprite, station.x, station.y + station.h / 2 + 8, width);
      else drawServicePad(ctx, station, id, night);
    }
  }

  drawWashForeground(ctx) {
    const wash = this.stationById('wash');
    const painted = Boolean(this.sprite('wash'));
    const active = Boolean(wash.active);
    if (painted && !active) return;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(wash.x + side * (painted ? 88 : wash.w / 2 - 32), wash.y + (painted ? -18 : 5));
      ctx.rotate(active ? this.game.time * 5 * side : 0);
      ctx.strokeStyle = side < 0 ? '#ef6680' : '#55c9d0';
      ctx.lineWidth = 20;
      ctx.lineCap = 'round';
      for (let index = 0; index < 8; index++) {
        ctx.rotate(TAU / 8);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(42, 0);
        ctx.stroke();
      }
      ctx.fillStyle = '#f6d86e';
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    if (!painted) {
      ctx.fillStyle = '#76d4df';
      roundRect(ctx, wash.x - wash.w / 2 - 8, wash.y - wash.h / 2 - 12, 22, wash.h + 42, 8);
      ctx.fill();
      roundRect(ctx, wash.x + wash.w / 2 - 14, wash.y - wash.h / 2 - 12, 22, wash.h + 42, 8);
      ctx.fill();
    }
  }

  drawLiftForeground(ctx) {
    if (this.sprite('lift')) return;
    const lift = this.stationById('lift');
    ctx.fillStyle = '#d76c58';
    roundRect(ctx, lift.x - lift.w / 2 + 14, lift.y - 58, 20, 94, 8);
    ctx.fill();
    roundRect(ctx, lift.x + lift.w / 2 - 34, lift.y - 58, 20, 94, 8);
    ctx.fill();
  }

  drawBooth(ctx, night) {
    const booth = this.pickupBooth;
    const sprite = this.sprite('booth');
    if (sprite) {
      drawAnchored(ctx, sprite, booth.x, booth.y + booth.h / 2 + 6, 150);
      return;
    }
    ctx.fillStyle = night ? '#593e4d' : '#da795f';
    roundRect(ctx, booth.x - booth.w / 2, booth.y - booth.h / 2, booth.w, booth.h, 18);
    ctx.fill();
    ctx.fillStyle = night ? '#7ed3df' : '#b8eff1';
    roundRect(ctx, booth.x - 37, booth.y - 55, 74, 54, 12);
    ctx.fill();
    ctx.fillStyle = '#ffe26f';
    ctx.beginPath();
    ctx.arc(booth.x, booth.y + 35, 18, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ca554a';
    roundRect(ctx, booth.x - 62, booth.y - 100, 124, 30, 12);
    ctx.fill();
  }

  drawNightLighting(ctx) {
    const paintedBuilding = Boolean(this.sprite('building'));

    // A soft ceiling wash makes every stall feel open and welcoming without
    // painting over cars, which are rendered after the garage base layer.
    const bayTop = paintedBuilding ? 246 : 270;
    const bayBottom = paintedBuilding ? 578 : 576;
    for (const bay of this.bays) {
      const inset = paintedBuilding ? 14 : 16;
      const left = bay.x - bay.w / 2 + inset;
      const width = bay.w - inset * 2;
      ctx.save();
      roundRect(ctx, left, bayTop, width, bayBottom - bayTop, 12);
      ctx.clip();
      const wash = ctx.createLinearGradient(0, bayTop, 0, bayBottom);
      wash.addColorStop(0, 'rgba(255,225,145,.28)');
      wash.addColorStop(0.5, 'rgba(255,205,105,.11)');
      wash.addColorStop(1, 'rgba(255,185,80,0)');
      ctx.fillStyle = wash;
      ctx.fillRect(left, bayTop, width, bayBottom - bayTop);
      ctx.restore();

      ctx.save();
      if (!this.game.reducedCanvasEffects) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowColor = 'rgba(255,211,112,.8)';
        ctx.shadowBlur = 18;
      }
      ctx.fillStyle = 'rgba(255,239,177,.72)';
      roundRect(ctx, bay.x - Math.min(34, width * 0.22), bayTop + 11, Math.min(68, width * 0.44), 8, 4);
      ctx.fill();
      ctx.restore();
    }

    // Relight the sign after the painted-world night tint. The broad halo and
    // small hot cores match both the generated marquee and fallback fascia.
    const sign = paintedBuilding
      ? { x: 240, y: 66, w: 986, h: 78, first: 276, last: 1200, step: 43, cy: 105 }
      : { x: 198, y: 158, w: 1070, h: 74, first: 254, last: 1230, step: 64, cy: 188 };
    ctx.save();
    if (!this.game.reducedCanvasEffects) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = 'rgba(255,190,72,.75)';
      ctx.shadowBlur = 28;
    }
    ctx.fillStyle = 'rgba(255,202,82,.12)';
    roundRect(ctx, sign.x, sign.y, sign.w, sign.h, 30);
    ctx.fill();
    if (!this.game.reducedCanvasEffects) ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(255,239,158,.76)';
    for (let x = sign.first; x < sign.last; x += sign.step) {
      ctx.beginPath();
      ctx.arc(x, sign.cy, paintedBuilding ? 3.8 : 4.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // The pickup booth's open window is the one human-scale pool of light in
    // the yard. These bounds align with both the sprite opening and fallback.
    const booth = this.pickupBooth;
    const paintedBooth = Boolean(this.sprite('booth'));
    const windowRect = paintedBooth
      ? { x: booth.x - 36, y: booth.y - 64, w: 72, h: 76 }
      : { x: booth.x - 37, y: booth.y - 55, w: 74, h: 54 };
    ctx.save();
    roundRect(ctx, windowRect.x, windowRect.y, windowRect.w, windowRect.h, 11);
    ctx.clip();
    const windowGlow = ctx.createRadialGradient(
      booth.x,
      windowRect.y + windowRect.h * 0.28,
      2,
      booth.x,
      windowRect.y + windowRect.h * 0.4,
      windowRect.w * 0.75,
    );
    windowGlow.addColorStop(0, 'rgba(255,239,164,.55)');
    windowGlow.addColorStop(0.55, 'rgba(255,199,91,.24)');
    windowGlow.addColorStop(1, 'rgba(255,177,72,0)');
    ctx.fillStyle = windowGlow;
    ctx.fillRect(windowRect.x, windowRect.y, windowRect.w, windowRect.h);
    ctx.restore();
  }

}

function makeBay(id, x, w, large) {
  return {
    id,
    x,
    y: 408,
    w,
    h: 370,
    large,
    park: { x, y: 455, heading: Math.PI / 2 },
    hit: { x: x - w / 2, y: 230, w, h: 375 },
  };
}

function makeStation(id, x, y, w, h, color, serviceDuration) {
  return {
    id,
    x,
    y,
    w,
    h,
    color,
    serviceDuration,
    pose: { x, y, heading: 0 },
    hit: { x: x - w / 2, y: y - h / 2, w, h },
    active: null,
  };
}

function straight(p0, p3, speed, extras = {}) {
  const dx = p3.x - p0.x;
  const dy = p3.y - p0.y;
  return {
    p0: point(p0.x, p0.y),
    p1: point(p0.x + dx / 3, p0.y + dy / 3),
    p2: point(p0.x + dx * 2 / 3, p0.y + dy * 2 / 3),
    p3: point(p3.x, p3.y),
    direction: 1,
    speed,
    ...extras,
  };
}

function drawAnchored(ctx, img, centerX, bottomY, width) {
  const height = width * (img.height / img.width);
  ctx.drawImage(img, centerX - width / 2, bottomY - height, width, height);
}

function drawCloud(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  for (const [cx, cy, radius] of [[0, 8, 30], [38, -8, 43], [83, 10, 32], [42, 20, 52]]) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawServicePad(ctx, station, kind, night) {
  ctx.fillStyle = 'rgba(17,31,37,.25)';
  ctx.beginPath();
  ctx.ellipse(station.x, station.y + station.h * 0.25, station.w * 0.53, station.h * 0.38, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = station.color;
  roundRect(ctx, station.x - station.w / 2, station.y - station.h / 2, station.w, station.h, 24);
  ctx.fill();
  ctx.strokeStyle = night ? '#d9f4e8' : '#fff5c8';
  ctx.lineWidth = 6;
  ctx.setLineDash([16, 12]);
  roundRect(ctx, station.x - station.w / 2 + 12, station.y - station.h / 2 + 12, station.w - 24, station.h - 24, 17);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#294b56';
  ctx.save();
  ctx.translate(station.x, station.y);
  if (kind === 'charge') {
    ctx.beginPath();
    ctx.moveTo(-10, -29);
    ctx.lineTo(13, -29);
    ctx.lineTo(-2, -4);
    ctx.lineTo(18, -4);
    ctx.lineTo(-18, 32);
    ctx.lineTo(-6, 7);
    ctx.lineTo(-24, 7);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'air') {
    ctx.beginPath();
    ctx.arc(0, 0, 29, 0, TAU);
    ctx.fill();
    ctx.fillStyle = station.color;
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#294b56';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(18, -12);
    ctx.stroke();
  } else {
    ctx.fillRect(-72, -10, 144, 20);
    ctx.fillRect(-9, -36, 18, 72);
  }
  ctx.restore();
}
