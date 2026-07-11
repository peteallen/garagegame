const WORLD_W = 1600;
const WORLD_H = 900;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.time = 0;
    this.pointer = { x: 0, y: 0, down: false };
    this.doorOpen = 0;
    this.bellBounce = 0;
    this.clouds = [
      { x: 160, y: 112, speed: 7, scale: 0.9 },
      { x: 870, y: 82, speed: 5, scale: 1.2 },
      { x: 1370, y: 140, speed: 8, scale: 0.7 },
    ];
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
    this.pointer = { ...this.toWorld(clientX, clientY), down: true };
  }

  onPointerMove(clientX, clientY) {
    this.pointer = { ...this.toWorld(clientX, clientY), down: this.pointer.down };
  }

  onPointerUp(clientX, clientY) {
    const point = this.toWorld(clientX, clientY);
    this.pointer = { ...point, down: false };
    const bell = Math.hypot(point.x - 126, point.y - 610) < 92;
    if (bell) {
      this.doorOpen = this.doorOpen > 0.5 ? 0 : 1;
      this.bellBounce = 1;
    }
  }

  update(dt) {
    this.time += dt;
    this.bellBounce = Math.max(0, this.bellBounce - dt * 2.8);
    for (const cloud of this.clouds) {
      cloud.x += cloud.speed * dt;
      if (cloud.x > WORLD_W + 180) cloud.x = -220;
    }
  }

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);
    this.drawWorld(ctx);
    ctx.restore();
  }

  drawWorld(ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, 560);
    sky.addColorStop(0, '#8dd9f2');
    sky.addColorStop(1, '#d9f4ef');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    this.drawClouds(ctx);

    ctx.fillStyle = '#6ca55d';
    ctx.beginPath();
    ctx.moveTo(0, 350);
    ctx.quadraticCurveTo(240, 285, 480, 360);
    ctx.quadraticCurveTo(760, 270, 1040, 355);
    ctx.quadraticCurveTo(1320, 280, 1600, 345);
    ctx.lineTo(1600, 600);
    ctx.lineTo(0, 600);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#314e5c';
    ctx.fillRect(0, 650, WORLD_W, 250);
    ctx.fillStyle = '#405f6a';
    ctx.beginPath();
    ctx.moveTo(0, 650);
    ctx.lineTo(1600, 650);
    ctx.lineTo(1600, 745);
    ctx.bezierCurveTo(1160, 710, 500, 820, 0, 765);
    ctx.closePath();
    ctx.fill();

    this.drawGarage(ctx);
    this.drawBell(ctx);
    this.drawTitle(ctx);
  }

  drawClouds(ctx) {
    for (const cloud of this.clouds) {
      ctx.save();
      ctx.translate(cloud.x, cloud.y);
      ctx.scale(cloud.scale, cloud.scale);
      ctx.fillStyle = 'rgba(255,255,255,.76)';
      for (const [x, y, r] of [[0, 8, 34], [40, -8, 48], [92, 10, 36], [42, 20, 58]]) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawGarage(ctx) {
    ctx.save();
    ctx.shadowColor = 'rgba(20,34,41,.28)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 18;
    roundRect(ctx, 210, 220, 1260, 510, 34);
    ctx.fillStyle = '#f5c677';
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#d75446';
    roundRect(ctx, 188, 196, 1304, 85, 28);
    ctx.fill();
    ctx.fillStyle = '#f9df9b';
    for (let x = 238; x < 1450; x += 72) {
      roundRect(ctx, x, 214, 44, 18, 9);
      ctx.fill();
    }

    const bays = [
      { x: 260, w: 262, big: false },
      { x: 540, w: 262, big: false },
      { x: 820, w: 262, big: false },
      { x: 1100, w: 320, big: true },
    ];
    for (const bay of bays) this.drawBay(ctx, bay);

    ctx.fillStyle = '#2e4751';
    ctx.fillRect(218, 680, 1244, 50);
    ctx.fillStyle = '#f7d96f';
    for (let x = 280; x < 1400; x += 180) {
      ctx.fillRect(x, 702, 90, 8);
    }

    ctx.fillStyle = '#244150';
    roundRect(ctx, 1235, 300, 150, 72, 20);
    ctx.fill();
    ctx.fillStyle = '#ffd95a';
    ctx.font = '700 38px ui-rounded, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('★', 1310, 351);
  }

  drawBay(ctx, bay) {
    const openHeight = 365 * this.doorOpen;
    ctx.fillStyle = '#18333d';
    roundRect(ctx, bay.x, 298, bay.w, 382, 20);
    ctx.fill();

    const inside = ctx.createLinearGradient(0, 310, 0, 680);
    inside.addColorStop(0, '#395866');
    inside.addColorStop(1, '#223d47');
    ctx.fillStyle = inside;
    roundRect(ctx, bay.x + 14, 312, bay.w - 28, 354, 14);
    ctx.fill();

    if (this.doorOpen > 0.5) {
      const light = ctx.createRadialGradient(
        bay.x + bay.w / 2, 582, 8,
        bay.x + bay.w / 2, 582, bay.w * 0.52,
      );
      light.addColorStop(0, 'rgba(255,230,145,.34)');
      light.addColorStop(1, 'rgba(255,230,145,0)');
      ctx.fillStyle = light;
      ctx.fillRect(bay.x + 14, 420, bay.w - 28, 240);
    }

    ctx.strokeStyle = 'rgba(255,224,144,.32)';
    ctx.lineWidth = 5;
    ctx.setLineDash([18, 16]);
    ctx.beginPath();
    ctx.moveTo(bay.x + bay.w / 2, 650);
    ctx.lineTo(bay.x + bay.w / 2, 520);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.save();
    ctx.beginPath();
    ctx.rect(bay.x + 12, 302, bay.w - 24, 365 - openHeight);
    ctx.clip();
    ctx.fillStyle = bay.big ? '#86b7c6' : '#8dc4cf';
    for (let y = 306; y < 680; y += 34) {
      roundRect(ctx, bay.x + 16, y, bay.w - 32, 28, 5);
      ctx.fill();
      ctx.fillStyle = bay.big ? '#77a8b8' : '#7bb2bd';
    }
    ctx.restore();

    ctx.fillStyle = '#f6dd9d';
    ctx.beginPath();
    ctx.arc(bay.x + bay.w / 2, 336, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  drawBell(ctx) {
    const hover = Math.hypot(this.pointer.x - 126, this.pointer.y - 610) < 92;
    const pulse = 1 + Math.sin(this.time * 4) * 0.035 + this.bellBounce * 0.13;
    ctx.save();
    ctx.translate(126, 610);
    ctx.scale(pulse, pulse);
    ctx.shadowColor = 'rgba(255,201,62,.55)';
    ctx.shadowBlur = hover ? 28 : 16;
    ctx.fillStyle = hover ? '#fff1a6' : '#ffd85c';
    ctx.beginPath();
    ctx.arc(0, 0, 68, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d64f43';
    ctx.beginPath();
    ctx.arc(0, 0, 49, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff4cf';
    ctx.font = '700 52px ui-rounded, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('●', 0, -4);
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    const ping = (this.time * 1.6) % 1;
    ctx.globalAlpha = 1 - ping;
    ctx.beginPath();
    ctx.arc(126, 610, 82 + ping * 26, -0.7, 0.7);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawTitle(ctx) {
    ctx.save();
    ctx.translate(800, 116 + Math.sin(this.time * 1.8) * 4);
    ctx.rotate(-0.015);
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.font = '900 80px ui-rounded, "Arial Rounded MT Bold", sans-serif';
    ctx.strokeStyle = '#173e55';
    ctx.lineWidth = 18;
    ctx.strokeText('BEEP BEEP GARAGE!', 0, 0);
    ctx.fillStyle = '#fff1ae';
    ctx.fillText('BEEP BEEP GARAGE!', 0, 0);
    ctx.restore();
  }

  destroy() {
    cancelAnimationFrame(this._raf);
  }
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, r);
}
