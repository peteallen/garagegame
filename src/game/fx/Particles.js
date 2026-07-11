import { rand, TAU } from '../core/math.js';

export class Particles {
  constructor() {
    this.items = [];
  }

  emit(x, y, options = {}) {
    const count = options.count ?? 8;
    for (let index = 0; index < count; index++) {
      const angle = options.angle ?? rand(0, TAU);
      const spread = options.spread ?? TAU;
      const direction = angle + rand(-spread / 2, spread / 2);
      const speed = rand(options.speedMin ?? 30, options.speedMax ?? 130);
      const life = rand(options.lifeMin ?? 0.45, options.lifeMax ?? 1.1);
      this.items.push({
        x: x + rand(-(options.jitterX ?? 5), options.jitterX ?? 5),
        y: y + rand(-(options.jitterY ?? 5), options.jitterY ?? 5),
        vx: Math.cos(direction) * speed + (options.vx ?? 0),
        vy: Math.sin(direction) * speed + (options.vy ?? 0),
        gravity: options.gravity ?? 70,
        drag: options.drag ?? 1.6,
        life,
        maxLife: life,
        size: rand(options.sizeMin ?? 4, options.sizeMax ?? 10),
        color: Array.isArray(options.colors)
          ? options.colors[Math.floor(Math.random() * options.colors.length)]
          : options.color || '#fff1a8',
        shape: options.shape || 'circle',
        rotation: rand(0, TAU),
        spin: rand(-5, 5),
      });
    }
  }

  sparkle(x, y, count = 8) {
    this.emit(x, y, {
      count, colors: ['#fff7b2', '#ffd75d', '#ffffff'], shape: 'sparkle',
      speedMin: 25, speedMax: 105, gravity: 18, lifeMin: 0.55, lifeMax: 1.15,
    });
  }

  hearts(x, y, count = 4) {
    this.emit(x, y, {
      count, colors: ['#ff708c', '#ff9aad', '#ffd1d9'], shape: 'heart',
      angle: -Math.PI / 2, spread: 1.3, speedMin: 35, speedMax: 85,
      gravity: -25, drag: 2.2, sizeMin: 9, sizeMax: 16, lifeMin: 0.8, lifeMax: 1.35,
    });
  }

  exhaust(point, heading, count = 1) {
    this.emit(point.x, point.y, {
      count, color: 'rgba(223,236,226,.64)', shape: 'puff',
      angle: heading + Math.PI, spread: 0.65, speedMin: 16, speedMax: 42,
      gravity: -18, drag: 1.2, sizeMin: 8, sizeMax: 18, lifeMin: 0.7, lifeMax: 1.35,
    });
  }

  foam(x, y, count = 12) {
    this.emit(x, y, {
      count, colors: ['#ffffff', '#dff8ff', '#bcebf6'], shape: 'bubble',
      speedMin: 18, speedMax: 88, gravity: -22, drag: 0.9,
      sizeMin: 7, sizeMax: 18, lifeMin: 1, lifeMax: 2.2,
    });
  }

  water(x, y, count = 10, angle = Math.PI / 2) {
    this.emit(x, y, {
      count, colors: ['#64c9e8', '#a8eaf6', '#ffffff'], shape: 'drop',
      angle, spread: 0.8, speedMin: 110, speedMax: 260, gravity: 250,
      sizeMin: 3, sizeMax: 8, lifeMin: 0.45, lifeMax: 1,
    });
  }

  confetti(x, y, count = 50) {
    this.emit(x, y, {
      count, colors: ['#ff5d67', '#ffd34f', '#54d7c5', '#5d91e6', '#a86ad7'],
      shape: 'confetti', angle: -Math.PI / 2, spread: 2.3,
      speedMin: 120, speedMax: 360, gravity: 250, drag: 0.35,
      sizeMin: 7, sizeMax: 14, lifeMin: 1.8, lifeMax: 3.6,
    });
  }

  dust(x, y, count = 5) {
    this.emit(x, y, {
      count, colors: ['rgba(220,199,157,.6)', 'rgba(245,230,194,.5)'], shape: 'puff',
      speedMin: 18, speedMax: 68, gravity: -9, sizeMin: 6, sizeMax: 14,
      lifeMin: 0.55, lifeMax: 1.2,
    });
  }

  update(dt) {
    for (const particle of this.items) {
      particle.life -= dt;
      particle.vx *= Math.exp(-particle.drag * dt);
      particle.vy = particle.vy * Math.exp(-particle.drag * dt) + particle.gravity * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.rotation += particle.spin * dt;
    }
    this.items = this.items.filter((particle) => particle.life > 0);
  }

  draw(ctx) {
    for (const particle of this.items) {
      const progress = particle.life / particle.maxLife;
      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rotation);
      ctx.globalAlpha = Math.min(1, progress * 2.5);
      ctx.fillStyle = particle.color;
      this.drawShape(ctx, particle, progress);
      ctx.restore();
    }
  }

  drawShape(ctx, particle, progress) {
    const size = particle.size * (particle.shape === 'puff' ? 1.5 - progress * 0.5 : 1);
    if (particle.shape === 'sparkle') {
      ctx.fillRect(-size * 0.16, -size, size * 0.32, size * 2);
      ctx.fillRect(-size, -size * 0.16, size * 2, size * 0.32);
      return;
    }
    if (particle.shape === 'heart') {
      ctx.beginPath();
      ctx.moveTo(0, size * 0.75);
      ctx.bezierCurveTo(-size * 1.2, -size * 0.05, -size * 0.55, -size, 0, -size * 0.42);
      ctx.bezierCurveTo(size * 0.55, -size, size * 1.2, -size * 0.05, 0, size * 0.75);
      ctx.fill();
      return;
    }
    if (particle.shape === 'confetti') {
      ctx.fillRect(-size * 0.55, -size * 0.18, size * 1.1, size * 0.36);
      return;
    }
    if (particle.shape === 'drop') {
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.36, size, 0, 0, TAU);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, TAU);
    if (particle.shape === 'bubble') {
      ctx.globalAlpha *= 0.68;
      ctx.strokeStyle = particle.color;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.12)';
    }
    ctx.fill();
  }
}
