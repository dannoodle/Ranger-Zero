// The ranger's plan, made readable: what they're aiming at, why, and the steps left.
// The planner writes each plan's reasoning (plan.trace) and numbers (plan.brief) for this file, and
// nothing in the sim reads them back. Drawing and words only.

var RZ = RZ || {};

(function () {
  var P = RZ.Renderer.prototype;
  var memory = { sim: null, world: null, no: null, plan: null, brief: null };

  // The latest plan that has reasoning, kept after the ranger drops it to run or fight, and the latest
  // staging targets, kept across rangers until the land changes.
  RZ.planMemory = function (sim) {
    if (memory.sim !== sim || memory.world !== sim.world) {
      memory = { sim: sim, world: sim.world, no: null, plan: null, brief: null };
    }
    var r = sim.ranger;
    if (r && r.no !== memory.no) {
      memory.no = r.no;
      memory.plan = null;
    }
    if (r && r.alive && r.plan && r.plan.trace) {
      memory.plan = r.plan;
      if (r.plan.brief.targets) memory.brief = r.plan.brief;
    }
    return memory;
  };

  // The name a ranger would give a spot: a safe house, a site, a village they know, or a body.
  RZ.placeLabel = function (sim, x, y) {
    var book = sim.book;
    var r = sim.ranger;
    var best = null;
    var bestDistance = Infinity;
    function consider(place, reach, name) {
      var d = Math.sqrt((place.x - x) * (place.x - x) + (place.y - y) * (place.y - y));
      if (d <= reach && d < bestDistance) {
        bestDistance = d;
        best = name;
      }
    }
    book.places.forEach(function (place) { consider(place, sim.cfg.safe.radius + 1, place.name); });
    book.sites.forEach(function (site) { consider(site, 3, site.name); });
    book.objectives.forEach(function (o) { if (o.type === 'retrieve') consider(o, 2, o.name); });
    var villages = (r && r.alive ? r.map : book.map).villages;
    Object.keys(villages).forEach(function (id) { consider(villages[id], 7, villages[id].name); });
    if (book.body) consider(book.body, 2, book.body.first + '\'s body');
    return best;
  };

  var SHORT = { food: 'food', ammo: 'rds', med: 'med' };

  RZ.goodsText = function (goods) {
    var parts = [];
    ['food', 'ammo', 'med'].forEach(function (kind) {
      if (goods[kind] > 0) parts.push(goods[kind] + ' ' + SHORT[kind]);
    });
    return parts.join(', ') || 'nothing';
  };

  // A step in plain words.
  RZ.stepLabel = function (sim, plan, n) {
    var step = plan.steps[n];
    var after = plan.steps[n + 1];
    if (step.do === 'go') {
      if (after && after.do === 'open') return 'Walk to the crate';
      if (after && after.do === 'look') return 'Walk to Zero\'s mark';
      var name = RZ.placeLabel(sim, step.x, step.y);
      if (name) return 'Walk to ' + name;
      return plan.kind === 'forage' && step.near === 0 ? 'Walk to a find' : 'Walk into unmapped ground';
    }
    if (step.do === 'survey') return 'Survey ' + sim.book.mission.name;
    if (step.do === 'clear') return 'Call the camp clear';
    if (step.do === 'take') return 'Pick up ' + sim.book.mission.name;
    if (step.do === 'stash') return 'Stash ' + RZ.goodsText(step.goods);
    if (step.do === 'linger') return plan.kind === 'clear' ? 'Sweep the huts' : 'Search';
    if (step.do === 'recover') return 'Take the gear';
    if (step.do === 'look') return 'Look around';
    if (step.do === 'open') return 'Open the crate';
    return 'Wait';
  };

  // Legs after the current one, walked over the ranger's own map. Kept for each plan, because
  // the planner's routes don't change while the plan stands.
  function laterLegs(renderer, r, plan) {
    var cache = renderer.planLegs;
    if (cache && cache.plan === plan && cache.at === plan.at && cache.version === r.map.version) return cache.legs;
    var map = r.map;
    var legs = [];
    var from = null;
    for (var n = plan.at; n < plan.steps.length; n++) {
      var step = plan.steps[n];
      if (step.do !== 'go') continue;
      if (from) {
        var path = RZ.findPath(map.w, map.h, map.route, from.x + from.y * map.w, step.x + step.y * map.w);
        if (path) legs.push(path.cells);
      }
      from = step;
    }
    renderer.planLegs = { plan: plan, at: plan.at, version: map.version, legs: legs };
    return legs;
  }

  function safeAt(sim, spot) {
    var reach = sim.cfg.safe.radius + 1;
    var found = null;
    sim.book.places.forEach(function (place) {
      if (Math.abs(place.x - spot.x) <= reach && Math.abs(place.y - spot.y) <= reach) found = place;
    });
    return found;
  }

  // What happens at the end of each walk, for the pin there.
  function stops(sim, plan) {
    var list = [];
    for (var n = plan.at; n < plan.steps.length; n++) {
      var step = plan.steps[n];
      if (step.do !== 'go') continue;
      var then = plan.steps[n + 1];
      var what = then && then.do !== 'go' ? RZ.stepLabel(sim, plan, n + 1) : null;
      if (what) what = what.charAt(0).toLowerCase() + what.slice(1);
      // A safe house already has its name on the map, so its pin sits beside the ring.
      var safe = safeAt(sim, step);
      if (safe) {
        list.push({ x: safe.x - sim.cfg.safe.radius - 1.2, y: safe.y, text: what || '' });
        continue;
      }
      var name = RZ.placeLabel(sim, step.x, step.y);
      var named = name && (!what || what.indexOf(name) < 0);
      list.push({ x: step.x, y: step.y, text: what ? (named ? name + ': ' : '') + what : name || '' });
    }
    return list;
  }

  P.drawPin = function (x, y, number, text, color) {
    var ctx = this.ctx;
    var dpr = this.dpr;
    var radius = 7 * dpr;
    ctx.fillStyle = 'rgba(8, 12, 15, 0.85)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4 * dpr;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.font = 'bold ' + (10 * dpr) + 'px Consolas, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(String(number), x, y + 0.5 * dpr);
    if (text) this.label(text, x - radius - 3 * dpr, y, color, 11, 'right');
  };

  // A small pennant on the outpost the line is stocking for the next attempt.
  P.drawStagingFlag = function (place) {
    var ctx = this.ctx;
    var dpr = this.dpr;
    var look = this.look;
    var x = this.toX(place.x + this.sim.cfg.safe.radius * 0.75);
    var y = this.toY(place.y - this.sim.cfg.safe.radius * 0.75);
    var pole = 14 * dpr;
    ctx.strokeStyle = look.paper;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - pole);
    ctx.stroke();
    var wave = Math.sin(this.sim.tick * 0.08) * 1.5 * dpr;
    ctx.fillStyle = look.gold;
    ctx.beginPath();
    ctx.moveTo(x, y - pole);
    ctx.lineTo(x + 10 * dpr, y - pole + 3 * dpr + wave);
    ctx.lineTo(x, y - pole + 6 * dpr);
    ctx.closePath();
    ctx.fill();
  };

  // The plan on the map: the legs still to walk, a numbered pin at each stop, the staging post's
  // flag, and what a haul is carrying.
  P.drawPlan = function () {
    var sim = this.sim;
    var r = sim.ranger;
    var look = this.look;
    var ctx = this.ctx;
    var self = this;
    var memory = RZ.planMemory(sim);
    if (memory.brief && memory.brief.staging) {
      var staging = null;
      sim.book.places.forEach(function (place) { if (place.id === memory.brief.staging.id) staging = place; });
      if (staging) this.drawStagingFlag(staging);
    }
    if (!r || !r.alive) return;
    var plan = r.plan;
    if (!plan || !plan.steps || plan.kind === 'wait' || plan.at >= plan.steps.length) return;

    var w = sim.world.w;
    ctx.strokeStyle = look.planLine;
    ctx.lineWidth = 1.2 * this.dpr;
    ctx.setLineDash([2 * this.dpr, 6 * this.dpr]);
    laterLegs(this, r, plan).forEach(function (cells) {
      ctx.beginPath();
      cells.forEach(function (cell, n) {
        var x = self.toX(cell % w);
        var y = self.toY(Math.floor(cell / w));
        if (n === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    ctx.setLineDash([]);

    var urgent = r.mode === 'shelter' || r.mode === 'climb' || r.mode === 'flee';
    ctx.globalAlpha = urgent ? 0.45 : 1;
    stops(sim, plan).forEach(function (stop, n) {
      self.drawPin(self.toX(stop.x), self.toY(stop.y), n + 1, stop.text, n === 0 ? look.planPin : look.planPinLater);
    });
    ctx.globalAlpha = 1;

    // What a haul is carrying, until it's put down.
    if (plan.kind === 'stock') {
      for (var n = plan.at; n < plan.steps.length; n++) {
        var step = plan.steps[n];
        if (step.do !== 'stash') continue;
        var spot = this.rangerSpot();
        var size = this.figureSize();
        var goods = { food: Math.min(step.goods.food, r.pack.food), ammo: Math.min(step.goods.ammo, r.pack.ammo), med: Math.min(step.goods.med, r.pack.med) };
        this.label('+' + RZ.goodsText(goods), this.toX(spot.x), this.toY(spot.y) + size * 2.6, look.cargo, 11);
        break;
      }
    }
  };
})();
