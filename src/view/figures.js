// People and marks on the map: the figures, their trail, what they're saying, graves, and the marks
// Zero leaves. Drawing only.

var RZ = RZ || {};

(function () {
  var P = RZ.Renderer.prototype;

  // Figures grow with the zoom, but never so small that you lose them on the whole map.
  P.figureSize = function () {
    return Math.max(5.5 * this.dpr, Math.min(13 * this.dpr, this.scale * 0.56));
  };

  // A person from above: shoulders, pack, head, and what they're carrying.
  P.figure = function (x, y, angle, size, coat, trim, opts) {
    var ctx = this.ctx;
    opts = opts || {};
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    ctx.beginPath();
    ctx.ellipse(-size * 0.1, size * 0.14, size * 1.05, size * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();
    if (opts.pack) {
      ctx.fillStyle = opts.pack;
      ctx.beginPath();
      ctx.roundRect(-size * 1.1, -size * 0.55, size * 0.7, size * 1.1, size * 0.18);
      ctx.fill();
    }
    ctx.strokeStyle = trim;
    ctx.lineWidth = Math.max(1, size * 0.18);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(size * 0.25, size * 0.42);
    ctx.lineTo(size * 1.25, size * 0.3);
    ctx.stroke();
    ctx.fillStyle = coat;
    ctx.strokeStyle = 'rgba(8, 12, 15, 0.85)';
    ctx.lineWidth = Math.max(1, size * 0.13);
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.55, size * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = trim;
    ctx.beginPath();
    ctx.arc(size * 0.12, 0, size * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  // Where the ranger really is between cells.
  P.rangerSpot = function () {
    var r = this.sim.ranger;
    var w = this.sim.world.w;
    var next = r.path && r.pathAt < r.path.length ? r.path[r.pathAt] : null;
    var fx = r.x;
    var fy = r.y;
    if (next !== null) {
      fx += ((next % w) - r.x) * r.moveFraction;
      fy += (Math.floor(next / w) - r.y) * r.moveFraction;
    }
    return { x: fx, y: fy };
  };

  P.drawRanger = function (dt) {
    var r = this.sim.ranger;
    if (!r || !r.alive) {
      this.trail = [];
      return;
    }
    var look = this.look;
    var ctx = this.ctx;
    var spot = this.rangerSpot();
    var size = this.figureSize();
    var w = this.sim.world.w;

    // A fading line of footsteps, so you can see where they've just been.
    this.trail = this.trail && this.trailOwner === r.no ? this.trail : [];
    this.trailOwner = r.no;
    var last = this.trail[this.trail.length - 1];
    if (!last || last.x !== r.x || last.y !== r.y) {
      this.trail.push({ x: r.x, y: r.y });
      if (this.trail.length > 60) this.trail.shift();
    }
    ctx.fillStyle = look.track;
    for (var n = 0; n < this.trail.length; n++) {
      ctx.globalAlpha = (n / this.trail.length) * 0.5;
      ctx.beginPath();
      ctx.arc(this.toX(this.trail[n].x), this.toY(this.trail[n].y), Math.max(1, size * 0.11), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    var heading = this.facing === undefined ? 0 : this.facing;
    var want = heading;
    if (r.lastShot && this.sim.tick - r.lastShot.tick < 16) {
      want = Math.atan2(r.lastShot.y - r.y, r.lastShot.x - r.x);
    } else if (r.path && r.pathAt < r.path.length) {
      var next = r.path[r.pathAt];
      want = Math.atan2(Math.floor(next / w) - r.y, (next % w) - r.x);
    }
    var turn = Math.atan2(Math.sin(want - heading), Math.cos(want - heading));
    this.facing = heading + turn * (1 - Math.exp(-(dt || 0.016) * 10));

    var x = this.toX(spot.x);
    var y = this.toY(spot.y);
    ctx.fillStyle = look.rangerGlow;
    ctx.beginPath();
    ctx.arc(x, y, size * 2.2, 0, Math.PI * 2);
    ctx.fill();
    // The tide's mould on them: a violet haze that pulses, stronger the deeper it has got in.
    if (r.infection > 0) {
      var mould = r.infection / 100;
      ctx.fillStyle = look.mould;
      ctx.globalAlpha = Math.min(0.8, 0.2 + mould * 0.6) * (0.75 + 0.25 * Math.sin(this.sim.tick * 0.5));
      ctx.beginPath();
      ctx.arc(x, y, size * (1.3 + mould * 0.9), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    var coat = look.temper[r.temperName] || look.ranger;
    this.figure(x, y, this.facing, size, coat, look.ranger, { pack: '#3a342b' });
    if (!this.speech) this.label(r.first, x, y - size * 2.4, look.ranger, 12);
  };

  // A line of print on a scrap of paper, above whoever said it.
  function wrap(ctx, text, width) {
    var words = text.split(' ');
    var lines = [];
    var line = '';
    words.forEach(function (word) {
      var test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > width && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  P.bubble = function (text, x, y, alpha, ghost) {
    var ctx = this.ctx;
    var look = this.look;
    var dpr = this.dpr;
    var size = 13 * dpr;
    ctx.font = (ghost ? 'italic ' : '') + size + 'px Georgia, "Times New Roman", serif';
    var lines = wrap(ctx, text, look.speechWidth * dpr);
    var width = 0;
    lines.forEach(function (line) { width = Math.max(width, ctx.measureText(line).width); });
    var pad = 7 * dpr;
    var height = lines.length * size * 1.25 + pad * 1.5;
    var boxW = width + pad * 2;
    var left = Math.max(6 * dpr, Math.min(this.width - boxW - 6 * dpr, x - boxW / 2));
    var top = y - height - 12 * dpr;
    var below = top < 54 * dpr;
    if (below) top = y + 22 * dpr;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = ghost ? 'rgba(38, 18, 66, 0.92)' : look.paper;
    ctx.beginPath();
    ctx.roundRect(left, top, boxW, height, 3 * dpr);
    ctx.fill();
    var tailX = Math.max(left + 8 * dpr, Math.min(left + boxW - 8 * dpr, x));
    ctx.beginPath();
    if (below) {
      ctx.moveTo(tailX - 5 * dpr, top + 1);
      ctx.lineTo(tailX, top - 6 * dpr);
      ctx.lineTo(tailX + 5 * dpr, top + 1);
    } else {
      ctx.moveTo(tailX - 5 * dpr, top + height - 1);
      ctx.lineTo(tailX, top + height + 6 * dpr);
      ctx.lineTo(tailX + 5 * dpr, top + height - 1);
    }
    ctx.fill();
    ctx.fillStyle = ghost ? look.old : look.paperInk;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach(function (line, i) {
      ctx.fillText(line, left + pad, top + pad * 0.75 + i * size * 1.25);
    });
    ctx.globalAlpha = 1;
  };

  // The latest thing said stays up for a moment, in real time, whatever the sim speed.
  // An old self's words get their own bubble, over that old self, so they never cover the ranger's.
  P.showSpeech = function (line) {
    if (line.kind === 'old') this.oldSpeech = { text: line.text, from: line.from, age: 0 };
    else this.speech = { text: line.text, kind: line.kind, age: 0 };
  };

  // Seconds a bubble stays up, and how faded it is now. Null once it has had its time.
  P.speechFade = function (speech, dt) {
    speech.age += dt || 0;
    var look = this.look;
    var life = look.speechSeconds + speech.text.length * look.speechPerLetter;
    if (speech.age > life) return null;
    return Math.min(1, (life - speech.age) * 3);
  };

  P.drawOldSpeech = function (dt) {
    var speech = this.oldSpeech;
    if (!speech) return;
    var alpha = this.speechFade(speech, dt);
    var old = this.sim.olds.filter(function (o) { return o.id === speech.from; })[0];
    if (alpha === null || !old) {
      this.oldSpeech = null;
      return;
    }
    // Drawn only where the figure is: in the ranger's view, an old self out of sight stays hidden.
    if (this.mode === 'ranger' && !this.visibleNow(old.x, old.y)) return;
    this.bubble(speech.text, this.toX(old.x), this.toY(old.y) - this.figureSize(), alpha, true);
  };

  P.drawSpeech = function (dt) {
    this.drawOldSpeech(dt);
    var speech = this.speech;
    if (!speech) return;
    var alpha = this.speechFade(speech, dt);
    if (alpha === null) {
      this.speech = null;
      return;
    }
    var r = this.sim.ranger;
    if (r && r.alive) {
      var spot = this.rangerSpot();
      this.bubble(speech.text, this.toX(spot.x), this.toY(spot.y) - this.figureSize(), alpha, false);
    } else if (this.camera.lastFocus) {
      this.bubble(speech.text, this.toX(this.camera.lastFocus.x), this.toY(this.camera.lastFocus.y) - this.figureSize(), alpha, false);
    }
  };

  // Where the line has fallen. The journal keeps this, so every view can show it.
  P.drawGraves = function () {
    var ctx = this.ctx;
    var look = this.look;
    var self = this;
    var near = this.scale / this.dpr >= 14;
    this.sim.book.graves.forEach(function (grave) {
      if (self.sim.bodies.some(function (body) { return body.no === grave.no; })) return;
      var x = self.toX(grave.x);
      var y = self.toY(grave.y);
      var s = 3.4 * self.dpr;
      ctx.strokeStyle = look.grave;
      ctx.lineWidth = 1.4 * self.dpr;
      ctx.beginPath();
      ctx.moveTo(x, y - s * 1.3);
      ctx.lineTo(x, y + s * 1.3);
      ctx.moveTo(x - s * 0.8, y - s * 0.4);
      ctx.lineTo(x + s * 0.8, y - s * 0.4);
      ctx.stroke();
      if (near) self.label(grave.first, x, y + 11 * self.dpr, look.grave, 10);
    });
  };

  // The path of whichever ranger is picked out in the history screen.
  P.drawTrack = function () {
    var record = this.highlight;
    if (!record || record.chapter !== this.sim.chapter.no || !record.track) return;
    var ctx = this.ctx;
    ctx.strokeStyle = this.look.temper[record.temper] || this.look.track;
    ctx.lineWidth = 2.2 * this.dpr;
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    for (var i = 0; i + 1 < record.track.length; i += 2) {
      var x = this.toX(record.track[i]);
      var y = this.toY(record.track[i + 1]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  // Zero's marks: warnings the ranger is carrying, and where they've been sent.
  P.drawMarks = function () {
    var r = this.sim.ranger;
    if (!r || !r.alive) return;
    var ctx = this.ctx;
    var look = this.look;
    var self = this;
    var radius = this.sim.cfg.radio.warnRadius;
    r.map.warnings.forEach(function (mark) {
      var x = self.toX(mark.x);
      var y = self.toY(mark.y);
      ctx.strokeStyle = look.warnMark;
      ctx.globalAlpha = mark.heeded ? 0.9 : 0.4;
      ctx.lineWidth = 1.6 * self.dpr;
      ctx.setLineDash([5 * self.dpr, 5 * self.dpr]);
      ctx.beginPath();
      ctx.arc(x, y, radius * self.scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      self.label('!', x, y, look.warnMark, 16);
    });
    var plan = r.plan;
    if (plan && plan.steps) {
      plan.steps.forEach(function (step, n) {
        if (n < plan.at || (step.do !== 'look' && step.do !== 'open')) return;
        var x = self.toX(step.x);
        var y = self.toY(step.y);
        var pulse = 1 + Math.sin(self.sim.tick * 0.2) * 0.15;
        ctx.strokeStyle = look.sendMark;
        ctx.lineWidth = 1.8 * self.dpr;
        ctx.beginPath();
        ctx.arc(x, y, 7 * self.dpr * pulse, 0, Math.PI * 2);
        ctx.moveTo(x - 11 * self.dpr, y);
        ctx.lineTo(x + 11 * self.dpr, y);
        ctx.moveTo(x, y - 11 * self.dpr);
        ctx.lineTo(x, y + 11 * self.dpr);
        ctx.stroke();
      });
    }
  };

  // A pulse around a danger the ranger can't see, so Zero doesn't have to hunt for it.
  P.drawThreat = function () {
    var threat = this.threat;
    if (!threat || this.mode === 'ranger') return;
    var ctx = this.ctx;
    var x = this.toX(threat.x);
    var y = this.toY(threat.y);
    var t = (performance.now() / 900) % 1;
    ctx.strokeStyle = this.look.warnMark;
    ctx.lineWidth = 2 * this.dpr;
    ctx.globalAlpha = 1 - t;
    ctx.beginPath();
    ctx.arc(x, y, (6 + t * 18) * this.dpr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  P.drawCrates = function () {
    var ctx = this.ctx;
    var look = this.look;
    var self = this;
    var sim = this.sim;
    var fall = sim.cfg.radio.crateFall * sim.cfg.sim.ticksPerSecond;
    sim.crates.forEach(function (crate) {
      var x = self.toX(crate.x);
      var y = self.toY(crate.y);
      var left = Math.max(0, crate.lands - sim.tick) / fall;
      var height = left * 180 * self.dpr;
      ctx.strokeStyle = look.crate;
      ctx.lineWidth = 1.5 * self.dpr;
      ctx.setLineDash([3 * self.dpr, 4 * self.dpr]);
      ctx.beginPath();
      ctx.arc(x, y, 8 * self.dpr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = look.crate;
      ctx.fillRect(x - 4 * self.dpr, y - height - 4 * self.dpr, 8 * self.dpr, 8 * self.dpr);
      ctx.strokeStyle = 'rgba(232, 185, 58, 0.5)';
      ctx.beginPath();
      ctx.arc(x, y - height - 11 * self.dpr, 9 * self.dpr, Math.PI, 0);
      ctx.moveTo(x - 9 * self.dpr, y - height - 11 * self.dpr);
      ctx.lineTo(x, y - height - 4 * self.dpr);
      ctx.lineTo(x + 9 * self.dpr, y - height - 11 * self.dpr);
      ctx.stroke();
    });
  };

  // The edges of the screen say how bad things are: red when hurt, violet with the tide close.
  P.drawMood = function () {
    var r = this.sim.ranger;
    if (!r || !r.alive) return;
    var ctx = this.ctx;
    var sim = this.sim;
    var w = this.width;
    var h = this.height;
    var cfg = sim.cfg;
    var hurt = 1 - r.hp / cfg.ranger.hpMax;
    var flash = this.fx.hurtFlash;
    var red = Math.max(hurt > 0.55 ? (hurt - 0.55) * (0.8 + 0.2 * Math.sin(sim.tick * 0.3)) : 0, flash);
    function vignette(color, strength) {
      var g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.34, w / 2, h / 2, Math.max(w, h) * 0.66);
      g.addColorStop(0, 'rgba(' + color + ', 0)');
      g.addColorStop(1, 'rgba(' + color + ', ' + Math.min(0.75, strength) + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    if (red > 0.01) vignette('170, 30, 20', red);
    if (r.infection > 0) vignette('120, 50, 210', 0.15 + r.infection / 100 * 0.45);
    if (sim.tide.phase !== 'calm' && !sim.world.safeMask[r.x + r.y * sim.world.w]) {
      var gap = sim.tide.front[r.x + r.y * sim.world.w] - sim.tide.level;
      if (gap > 0 && gap < 0.2) vignette('120, 50, 210', (0.2 - gap) * 3);
    }
  };
})();
