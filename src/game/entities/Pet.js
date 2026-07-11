import { damp, dist, rand, roundRect, TAU } from '../core/math.js';

export class Pet {
  constructor(game, data = {}) {
    this.game = game;
    this.x = data.x ?? 1220;
    this.y = data.y ?? 565;
    this.target = null;
    this.heading = -1;
    this.state = 'nap';
    this.stateTime = rand(5, 14);
    this.t = rand(0, 20);
    this.bounce = 0;
    this.roofCar = null;
  }

  get baseline() {
    return this.roofCar ? this.roofCar.baseline + 2 : this.y;
  }

  contains(x, y) {
    const px = this.roofCar ? this.roofCar.x : this.x;
    const py = this.roofCar ? this.roofCar.y - 44 : this.y - 24;
    return Math.hypot(x - px, y - py) < 70;
  }

  onTap() {
    if (this.roofCar) {
      this.game?.sound?.catChirp?.();
      this.game?.particles?.hearts?.(this.roofCar.x, this.roofCar.y - 80, 4);
      this.bounce = 1;
      return;
    }
    this.state = 'stretch';
    this.stateTime = 2.2;
    this.bounce = 1;
    this.game?.sound?.catChirp?.();
    this.game?.particles?.hearts?.(this.x, this.y - 55, 3);
  }

  dance(duration = 4) {
    this.roofCar = null;
    this.state = 'dance';
    this.stateTime = duration;
  }

  napOn(vehicle) {
    if (!vehicle || vehicle.moving) return false;
    this.roofCar = vehicle;
    this.state = 'roofNap';
    this.stateTime = rand(10, 20);
    return true;
  }

  idleCharm() {
    if (this.state === 'nap') {
      this.state = 'stretch';
      this.stateTime = 2.4;
      return;
    }
    if (!this.roofCar) this.pickWanderTarget();
  }

  pickWanderTarget() {
    const bounds = this.game?.garage?.petBounds || { minX: 260, maxX: 1380, minY: 560, maxY: 710 };
    this.target = { x: rand(bounds.minX, bounds.maxX), y: rand(bounds.minY, bounds.maxY) };
    this.state = 'walk';
    this.stateTime = 12;
  }

  update(dt) {
    this.t += dt;
    this.stateTime -= dt;
    this.bounce = damp(this.bounce, 0, 6, dt);

    if (this.roofCar) {
      this.x = this.roofCar.x;
      this.y = this.roofCar.y;
      if (this.roofCar.moving || this.stateTime <= 0) {
        this.x += Math.cos(this.roofCar.heading + Math.PI / 2) * 70;
        this.y += Math.sin(this.roofCar.heading + Math.PI / 2) * 70;
        this.roofCar = null;
        this.state = 'stretch';
        this.stateTime = 1.7;
      }
      return;
    }

    if (this.state === 'walk' && this.target) {
      const dx = this.target.x - this.x;
      const dy = this.target.y - this.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 9 || this.stateTime <= 0) {
        this.target = null;
        this.state = 'nap';
        this.stateTime = rand(9, 22);
      } else {
        const speed = 72;
        this.x += dx / distance * speed * dt;
        this.y += dy / distance * speed * dt;
        this.heading = dx >= 0 ? 1 : -1;
      }
    } else if (this.stateTime <= 0) {
      if (this.state === 'dance' || this.state === 'stretch') {
        this.state = 'nap';
        this.stateTime = rand(8, 18);
      } else if (Math.random() < 0.45) {
        this.pickWanderTarget();
      } else {
        this.stateTime = rand(7, 16);
      }
    }
  }

  draw(ctx) {
    const roof = this.roofCar;
    const x = roof ? roof.x : this.x;
    const y = roof ? roof.y - 52 : this.y;
    const sleeping = this.state === 'nap' || this.state === 'roofNap';
    const dance = this.state === 'dance';
    const walkBob = this.state === 'walk' ? Math.sin(this.t * 13) * 5 : 0;
    const hop = this.bounce * 16 + (dance ? Math.max(0, Math.sin(this.t * 9)) * 18 : 0);
    const stretch = this.state === 'stretch' ? 1 + Math.sin(Math.min(1, 2.2 - this.stateTime) * Math.PI) * 0.32 : 1;

    const assets = this.game?.assets;
    const pose = sleeping ? 'pet_sleep' : (this.state === 'walk' || dance) ? 'pet_walk' : 'pet_sit';
    const sprite = assets?.get?.(pose);
    if (sprite) {
      const height = sleeping ? 66 : pose === 'pet_walk' ? 88 : 100;
      const width = height * (sprite.width / sprite.height);
      ctx.save();
      ctx.translate(x, y - hop + walkBob);
      if (roof) ctx.rotate(roof.heading - Math.PI / 2);
      ctx.scale(this.heading * stretch, 1 / Math.sqrt(stretch));
      if (!roof) {
        ctx.fillStyle = 'rgba(24,40,45,.2)';
        ctx.beginPath();
        ctx.ellipse(0, 26 + hop, width * 0.52, 13, 0, 0, TAU);
        ctx.fill();
      }
      ctx.drawImage(sprite, -width / 2, 28 - height, width, height);
      ctx.restore();
      if (sleeping && !dance) this.drawSnoreZs(ctx, x, y);
      return;
    }

    ctx.save();
    ctx.translate(x, y - hop + walkBob);
    if (roof) ctx.rotate(roof.heading - Math.PI / 2);
    ctx.scale(this.heading * stretch, 1 / Math.sqrt(stretch));

    if (!roof) {
      ctx.fillStyle = 'rgba(24,40,45,.2)';
      ctx.beginPath();
      ctx.ellipse(0, 24 + hop, 48, 16, 0, 0, TAU);
      ctx.fill();
    }

    ctx.strokeStyle = '#9b633a';
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-30, 5);
    ctx.quadraticCurveTo(-70, -22 + Math.sin(this.t * 2) * 8, -55, -48);
    ctx.stroke();

    ctx.fillStyle = '#d99a5d';
    ctx.beginPath();
    ctx.ellipse(-3, 4, sleeping ? 48 : 43, sleeping ? 29 : 35, 0, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.translate(30, sleeping ? 3 : -20);
    ctx.fillStyle = '#e6aa69';
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-20, -17);
    ctx.lineTo(-14, -40);
    ctx.lineTo(-2, -22);
    ctx.moveTo(8, -23);
    ctx.lineTo(22, -40);
    ctx.lineTo(22, -13);
    ctx.fill();

    ctx.strokeStyle = '#4b4038';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      if (sleeping) {
        ctx.arc(side * 9, -4, 5, 0.15, Math.PI - 0.15);
      } else {
        ctx.moveTo(side * 12 - 3, -6);
        ctx.lineTo(side * 12 + 3, -6);
      }
      ctx.stroke();
    }
    ctx.fillStyle = '#d46d6d';
    ctx.beginPath();
    ctx.arc(0, 5, 4, 0, TAU);
    ctx.fill();
    ctx.restore();

    if (!sleeping) {
      ctx.fillStyle = '#d99a5d';
      for (const side of [-1, 1]) {
        roundRect(ctx, side * 18 - 8, 20, 18, 28, 8);
        ctx.fill();
      }
    }
    ctx.restore();

    if (sleeping && !dance) this.drawSnoreZs(ctx, x, y);
  }

  drawSnoreZs(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    ctx.font = '700 27px ui-rounded, sans-serif';
    ctx.fillText('Z', x + 38, y - 48 + Math.sin(this.t * 2) * 5);
    ctx.font = '700 19px ui-rounded, sans-serif';
    ctx.fillText('z', x + 65, y - 67 + Math.sin(this.t * 2 + 1) * 4);
    ctx.restore();
  }
}
