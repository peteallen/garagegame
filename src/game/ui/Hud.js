import { roundRect, TAU } from '../core/math.js';

export class Hud {
  constructor(game) {
    this.game = game;
    this.buttons = {
      dayNight: { x: 1498, y: 100, r: 48 },
      sound: { x: 1498, y: 205, r: 44 },
    };
  }

  onTap(x, y) {
    if (hitCircle(x, y, this.buttons.dayNight, 22)) {
      this.game.toggleNight();
      return true;
    }
    if (hitCircle(x, y, this.buttons.sound, 22)) {
      this.game.sound.toggleMute();
      return true;
    }
    return false;
  }

  draw(ctx) {
    this.drawDayNight(ctx);
    this.drawSound(ctx);
  }

  drawButton(ctx, button, { active = false } = {}) {
    ctx.save();
    ctx.translate(button.x, button.y);
    ctx.shadowColor = 'rgba(18,39,48,.3)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = active ? 'rgba(255,239,159,.96)' : 'rgba(255,255,246,.9)';
    ctx.beginPath();
    ctx.arc(0, 0, button.r, 0, TAU);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(38,73,82,.25)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
  }

  drawDayNight(ctx) {
    const button = this.buttons.dayNight;
    this.drawButton(ctx, button, { active: this.game.isNight });
    ctx.save();
    ctx.translate(button.x, button.y);
    if (this.game.isNight) {
      ctx.fillStyle = '#6d79c6';
      ctx.beginPath();
      ctx.arc(0, 0, 23, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,246,.9)';
      ctx.beginPath();
      ctx.arc(10, -8, 22, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffd85e';
      for (const [x, y] of [[-25, -20], [24, 18], [-20, 25]]) {
        ctx.fillRect(x - 2, y - 6, 4, 12);
        ctx.fillRect(x - 6, y - 2, 12, 4);
      }
    } else {
      ctx.fillStyle = '#f4bd3d';
      for (let index = 0; index < 8; index++) {
        ctx.save();
        ctx.rotate(index * Math.PI / 4);
        roundRect(ctx, -4, -38, 8, 17, 4);
        ctx.fill();
        ctx.restore();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawSound(ctx) {
    const button = this.buttons.sound;
    const muted = this.game.sound.muted;
    this.drawButton(ctx, button, { active: !muted });
    ctx.save();
    ctx.translate(button.x, button.y);
    ctx.fillStyle = '#315567';
    ctx.beginPath();
    ctx.moveTo(-25, -11);
    ctx.lineTo(-12, -11);
    ctx.lineTo(5, -27);
    ctx.lineTo(5, 27);
    ctx.lineTo(-12, 11);
    ctx.lineTo(-25, 11);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = muted ? '#d85a58' : '#315567';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    if (muted) {
      ctx.beginPath();
      ctx.moveTo(15, -16);
      ctx.lineTo(35, 16);
      ctx.moveTo(35, -16);
      ctx.lineTo(15, 16);
      ctx.stroke();
    } else {
      for (const radius of [15, 26]) {
        ctx.beginPath();
        ctx.arc(3, 0, radius, -0.8, 0.8);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

function hitCircle(x, y, circle, padding = 0) {
  return Math.hypot(x - circle.x, y - circle.y) <= circle.r + padding;
}
