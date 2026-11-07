// Short-lived effects: tracers, damage numbers, bursts. They're driven by the sim's event feed and
// timed in real seconds, so they read the same at any sim speed. Drawing only.

var RZ = RZ || {};

(function () {
  function Fx(renderer) {
    this.renderer = renderer;
    this.sim = renderer.sim;
    this.items = [];
    this.hurtFlash = 0;
  }

  Fx.prototype.add = function (item) {
    item.age = 0;
    this.items.push(item);
    if (this.items.length > 80) this.items.shift();
  };

  Fx.prototype.shot = function (event) {
    var look = this.sim.cfg.look;
    var aimX = event.toX;
    var aimY = event.toY;
    if (!event.hit) {
      // A miss goes past the target.
      var dx = event.toX - event.fromX;
      var dy = event.toY - event.fromY;
      var len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      var side = (event.seq % 2 ? 1 : -1) * 1.6;
      aimX += dx / len * 3 - dy / len * side;
      aimY += dy / len * 3 + dx / len * side;
    }
    this.add({
      kind: 'tracer', life: 0.16, fromX: event.fromX, fromY: event.fromY, toX: aimX, toY: aimY,
      color: event.by === 'ranger' ? look.shot : (event.by === 'old' ? look.old : look.scav)
    });
    this.add({ kind: 'flash', life: 0.1, x: event.fromX, y: event.fromY, color: look.shot });
    var spread = (event.round || 0) * 0.7; // a burst's numbers step sideways so they don't stack
    if (event.hit) this.add({ kind: 'number', life: 1, x: event.toX + spread, y: event.toY, text: '-' + Math.round(event.damage), color: event.by === 'ranger' ? look.shot : '#ff8f7a' });
    else this.add({ kind: 'number', life: 0.7, x: aimX, y: aimY, text: 'miss', color: 'rgba(230, 225, 210, 0.7)', small: true });
  };

  Fx.prototype.hurt = function (event) {
    if (event.cause === 'tide') return;
    this.hurtFlash = Math.min(0.55, 0.22 + event.damage / 60);
    this.renderer.camera.bump(2 + event.damage / 7);
  };

  // A lob from the thrower, then a fireball the size of the blast and a ring rolling out from it.
  Fx.prototype.blast = function (event) {
    var look = this.sim.cfg.look;
    this.add({ kind: 'tracer', life: 0.25, fromX: event.fromX, fromY: event.fromY, toX: event.x, toY: event.y, color: look.blast });
    this.add({ kind: 'fireball', life: 0.45, x: event.x, y: event.y, reach: event.radius, color: look.blast });
    this.burst(event.x, event.y, look.blast, 0.7, event.radius + 2);
    this.renderer.camera.bump(5);
  };

  Fx.prototype.burst = function (x, y, color, life, reach) {
    this.add({ kind: 'ring', life: life, x: x, y: y, color: color, reach: reach });
  };

  Fx.prototype.handle = function (event) {
    var look = this.sim.cfg.look;
    if (event.type === 'shot') this.shot(event);
    else if (event.type === 'hurt') this.hurt(event);
    else if (event.type === 'blast') this.blast(event);
    else if (event.type === 'blast-hit') this.add({ kind: 'number', life: 1, x: event.x, y: event.y, text: '-' + Math.round(event.damage), color: look.blast });
    else if (event.type === 'kill') this.burst(event.x, event.y, look.scav, 0.6, 3);
    else if (event.type === 'strike') this.burst(event.x, event.y, look.anomaly, 1, 7);
    else if (event.type === 'death') this.burst(event.x, event.y, look.body, 1.6, 12);
    else if (event.type === 'old-rise' || event.type === 'old-down') this.burst(event.x, event.y, look.old, 1.2, 8);
    else if (event.type === 'crate-land') this.burst(event.x, event.y, look.crate, 0.8, 5);
  };

  Fx.prototype.draw = function (dt) {
    var r = this.renderer;
    var ctx = r.ctx;
    var dpr = r.dpr;
    dt = dt || 0;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.2);
    this.items = this.items.filter(function (item) {
      item.age += dt;
      return item.age < item.life;
    });
    this.items.forEach(function (item) {
      var t = item.age / item.life;
      if (item.kind === 'tracer') {
        ctx.strokeStyle = item.color;
        ctx.globalAlpha = 1 - t;
        ctx.lineWidth = 1.6 * dpr;
        ctx.beginPath();
        ctx.moveTo(r.toX(item.fromX), r.toY(item.fromY));
        ctx.lineTo(r.toX(item.toX), r.toY(item.toY));
        ctx.stroke();
      } else if (item.kind === 'flash') {
        ctx.fillStyle = item.color;
        ctx.globalAlpha = 1 - t;
        ctx.beginPath();
        ctx.arc(r.toX(item.x), r.toY(item.y), (5 + 5 * t) * dpr, 0, Math.PI * 2);
        ctx.fill();
      } else if (item.kind === 'fireball') {
        ctx.fillStyle = item.color;
        ctx.globalAlpha = (1 - t) * 0.55;
        ctx.beginPath();
        ctx.arc(r.toX(item.x), r.toY(item.y), item.reach * r.scale * (0.5 + t * 0.5), 0, Math.PI * 2);
        ctx.fill();
      } else if (item.kind === 'ring') {
        ctx.strokeStyle = item.color;
        ctx.globalAlpha = (1 - t) * 0.9;
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.arc(r.toX(item.x), r.toY(item.y), item.reach * r.scale * (0.15 + t * 0.85), 0, Math.PI * 2);
        ctx.stroke();
      } else if (item.kind === 'number') {
        ctx.globalAlpha = Math.min(1, (1 - t) * 2);
        ctx.font = 'bold ' + ((item.small ? 10 : 14) * dpr) + 'px Consolas, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var x = r.toX(item.x);
        var y = r.toY(item.y) - (10 + 26 * t) * dpr;
        ctx.lineWidth = 3 * dpr;
        ctx.strokeStyle = 'rgba(8, 12, 15, 0.8)';
        ctx.strokeText(item.text, x, y);
        ctx.fillStyle = item.color;
        ctx.fillText(item.text, x, y);
      }
    });
    ctx.globalAlpha = 1;
  };

  RZ.makeFx = function (renderer) {
    return new Fx(renderer);
  };
})();
