import { clamp, damp, pointInRect, roundRect, TAU } from '../core/math.js';

export const WORLD_W = 1600;
export const WORLD_H = 900;

const point = (x, y) => ({ x, y });

export class Garage {
  constructor(game) {
    this.game = game;
    this.doorOpen = 0;
    this.doorTarget = 0;
    this.signFlicker = 0;
    this.cloudOffset = 0;
    this.puddleRipple = 0;
    this.petBounds = { minX: 280, maxX: 1180, minY: 585, maxY: 705 };
    this.anchors = {
      arrivalStart: { x: -170, y: 760, heading: 0 },
      waiting: { x: 175, y: 760, heading: 0 },
      towHome: { x: 860, y: 842, heading: 0 },
      exit: { x: 1760, y: 760, heading: 0 },
    };
    this.entrance = {
      door: { x: 20, y: 510, w: 220, h: 230 },
      bell: { x: 105, y: 620, r: 68 },
      roadZone: { x: 0, y: 690, w: 245, h: 185 },
    };
    this.pickupBooth = { x: 1490, y: 600, w: 105, h: 160, hit: { x: 1430, y: 530, w: 170, h: 250 } };
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
    this.doorOpen = damp(this.doorOpen, this.doorTarget, 4.8, dt);
    this.cloudOffset = (this.cloudOffset + dt * 7) % (WORLD_W + 400);
    this.puddleRipple += dt;
    this.signFlicker = damp(this.signFlicker, 0, 7, dt);
  }

  openDoor() { this.doorTarget = 1; }
  closeDoor() { this.doorTarget = 0; }
  flickerSign() { this.signFlicker = 1; }

  bayById(id) {
    return this.bays.find((bay) => bay.id === id) || null;
  }

  stationById(id) {
    return this.stations.find((station) => station.id === id) || null;
  }

  occupiedBayIds(excludeVehicle = null) {
    return new Set(this.game.vehicles
      .filter((vehicle) => vehicle !== excludeVehicle && vehicle.bayId && vehicle.status !== 'exiting')
      .map((vehicle) => vehicle.bayId));
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
    return this.stations.find((station) => pointInRect(x, y, station.hit, 22)) || null;
  }

  containsEntrance(x, y) {
    const bell = this.entrance.bell;
    return Math.hypot(x - bell.x, y - bell.y) <= bell.r + 28 || pointInRect(x, y, this.entrance.roadZone);
  }

  containsBooth(x, y) {
    return pointInRect(x, y, this.pickupBooth.hit, 16);
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
    const approachX = bay.park.x - 145;
    const backing = point(bay.park.x + 92, 832);
    const path = [];
    const start = point(tow.x, tow.y);
    path.push({
      p0: start,
      p1: point(start.x - 120, start.y),
      p2: point(approachX + 105, 760),
      p3: point(approachX, 760),
      direction: 1,
      speed: tow.config.speed,
    });
    path.push({
      p0: path.at(-1).p3,
      p1: point(approachX + 95, 760),
      p2: point(backing.x, 750),
      p3: backing,
      direction: 1,
      speed: 125,
    });
    path.push({
      p0: backing,
      p1: point(backing.x, 748),
      p2: point(bay.park.x + 28, 675),
      p3: point(bay.park.x + 28, 648),
      direction: -1,
      speed: 68,
      cue: 'tow-reverse',
    });
    return path;
  }

  towServicePath(tow, vehicle, bay, station) {
    const start = point(tow.x, tow.y);
    const path = [{
      p0: start,
      p1: point(start.x, 715),
      p2: point(start.x + 45, 760),
      p3: point(start.x + 145, 760),
      direction: 1,
      speed: 105,
    }];
    const laneStart = path.at(-1).p3;
    const entryX = Math.max(laneStart.x + 35, station.pose.x - 260);
    if (entryX > laneStart.x + 3) path.push(straight(laneStart, point(entryX, 760), 110));
    const p0 = path.at(-1).p3;
    path.push({
      p0,
      p1: point(p0.x + 95, p0.y),
      p2: point(station.pose.x - 125, station.pose.y),
      p3: point(station.pose.x, station.pose.y),
      direction: 1,
      speed: 90,
      cue: `tow-${station.id}`,
    });
    return path;
  }

  towReturnPath(tow, vehicle, station, bay) {
    return this.offscreenLoopToBay(tow, point(station.pose.x, station.pose.y), bay, { towing: true });
  }

  towHomePath(tow, bay) {
    const start = point(tow.x, tow.y);
    const laneX = bay.park.x + 165;
    return [
      {
        p0: start,
        p1: point(start.x, 720),
        p2: point(laneX - 70, 760),
        p3: point(laneX, 760),
        direction: 1,
        speed: 110,
      },
      {
        p0: point(laneX, 760),
        p1: point(laneX + 180, 760),
        p2: point(this.anchors.towHome.x + 90, this.anchors.towHome.y),
        p3: point(this.anchors.towHome.x, this.anchors.towHome.y),
        direction: 1,
        speed: tow.config.speed,
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
      this.drawClouds(ctx, night);
    } else {
      this.drawSky(ctx, night);
      this.drawGround(ctx, night);
    }
    this.drawBuilding(ctx, night);
    this.drawBays(ctx, night);
    this.drawEntrance(ctx, night);
    this.drawStationsBase(ctx, night);
    this.drawBooth(ctx, night);
    this.drawAmbientDetails(ctx, night);
    if (night && ground) {
      // Painted world goes dark with one tint pass; vehicles draw after this
      // so their lights stay bright. Stars sit above the tint.
      ctx.fillStyle = 'rgba(13,26,62,.44)';
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      this.drawStars(ctx);
    }
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
    this.drawWashForeground(ctx);
    this.drawLiftForeground(ctx);
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
      ctx.shadowColor = 'rgba(17,32,39,.25)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 14;
      ctx.drawImage(sprite, 198, 41, 1070, 561);
      ctx.restore();
      if (this.signFlicker > 0.02 || night) {
        // Warm glow over the painted bulb strip: flicker on demand, steady at night.
        ctx.save();
        ctx.globalAlpha = night ? 0.28 + this.signFlicker * 0.4 : this.signFlicker * 0.55;
        ctx.fillStyle = '#ffde7a';
        ctx.globalCompositeOperation = 'lighter';
        roundRect(ctx, 240, 66, 986, 78, 34);
        ctx.fill();
        ctx.restore();
      }
      return;
    }
    ctx.save();
    ctx.shadowColor = 'rgba(17,32,39,.28)';
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 16;
    ctx.fillStyle = night ? '#b98c59' : '#f0bf76';
    roundRect(ctx, 218, 180, 1030, 420, 28);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = night ? '#9b3f3a' : '#d85145';
    roundRect(ctx, 198, 158, 1070, 74, 24);
    ctx.fill();
    ctx.fillStyle = night ? '#f4d66e' : '#ffe39a';
    for (let x = 235; x < 1230; x += 64) {
      ctx.globalAlpha = night ? 0.8 + this.signFlicker * 0.2 : 0.85;
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

  drawEntrance(ctx, night) {
    const doorSprite = this.sprite('door');
    if (doorSprite) {
      // Painted frame with an open interior; the animated slats draw inside
      // the interior region measured from the art.
      const width = 296;
      const height = width * (doorSprite.height / doorSprite.width);
      ctx.drawImage(doorSprite, 8, 745 - height, width, height);
      const slat = { x: 52, y: 546, w: 210, h: 178 };
      const doorHeight = slat.h * (1 - this.doorOpen);
      if (doorHeight > 2) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(slat.x, slat.y, slat.w, doorHeight);
        ctx.clip();
        for (let y = slat.y; y < slat.y + slat.h + 26; y += 26) {
          ctx.fillStyle = (Math.floor(y / 26) % 2) ? '#75aebb' : '#86bdc7';
          roundRect(ctx, slat.x + 2, y, slat.w - 4, 21, 4);
          ctx.fill();
        }
        ctx.restore();
      }
    } else {
      ctx.fillStyle = night ? '#254052' : '#315967';
      roundRect(ctx, 14, 500, 225, 245, 30);
      ctx.fill();
      ctx.fillStyle = night ? '#142a3b' : '#25444f';
      roundRect(ctx, 26, 518, 200, 215, 22);
      ctx.fill();

      const doorHeight = 190 * (1 - this.doorOpen);
      if (doorHeight > 2) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(32, 524, 188, doorHeight);
        ctx.clip();
        for (let y = 528; y < 724; y += 27) {
          ctx.fillStyle = (Math.floor(y / 27) % 2) ? '#75aebb' : '#86bdc7';
          roundRect(ctx, 34, y, 184, 22, 4);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    const bell = this.entrance.bell;
    const bellSprite = this.sprite('bell');
    if (bellSprite) {
      const size = bell.r * 2 + 8;
      ctx.drawImage(bellSprite, bell.x - size / 2, bell.y - size / 2, size, size);
    } else {
      ctx.fillStyle = '#ffd860';
      ctx.beginPath();
      ctx.arc(bell.x, bell.y, bell.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#d85346';
      ctx.beginPath();
      ctx.arc(bell.x, bell.y, 46, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff4c9';
      ctx.beginPath();
      ctx.arc(bell.x, bell.y, 14, 0, TAU);
      ctx.fill();
    }
    const pulse = (this.game.time * 1.5) % 1;
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.lineWidth = 7;
    ctx.globalAlpha = 1 - pulse;
    ctx.beginPath();
    ctx.arc(bell.x, bell.y, 78 + pulse * 28, -0.7, 0.7);
    ctx.stroke();
    ctx.globalAlpha = 1;
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

  drawAmbientDetails(ctx, night) {
    ctx.fillStyle = night ? 'rgba(91,143,164,.28)' : 'rgba(132,211,228,.34)';
    ctx.beginPath();
    ctx.ellipse(355, 858, 170, 22 + Math.sin(this.puddleRipple * 2) * 2, 0.02, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = night ? 'rgba(180,219,228,.2)' : 'rgba(255,255,255,.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(355, 858, 85 + Math.sin(this.puddleRipple * 3) * 18, 9, 0.02, 0, TAU);
    ctx.stroke();
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
