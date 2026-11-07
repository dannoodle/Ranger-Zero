// Scavengers and dice combat. There's no real-time shooting: every shot is one roll, shaped by
// range, line of sight and the cover the target stands in.

var RZ = RZ || {};

(function () {
  function addScavenger(sim, camp) {
    var world = sim.world;
    var c = sim.cfg.scav;
    var rng = sim.enemyRng;
    for (var tries = 0; tries < 12; tries++) {
      var x = camp.x + rng.int(-3, 3);
      var y = camp.y + rng.int(-3, 3);
      if (x < 0 || y < 0 || x >= world.w || y >= world.h) continue;
      var i = x + y * world.w;
      if (world.water[i] || world.huts[i]) continue;
      sim.scavs.push({
        id: sim.nextScavId++, camp: camp.id, x: x, y: y, hp: c.hp, cool: 0, moveWait: 0, alert: 0
      });
      return;
    }
  }

  RZ.setupCamps = function (sim) {
    var c = sim.cfg.scav;
    var world = sim.world;
    sim.camps = world.villages.concat(world.sites).map(function (place, n) {
      return { id: n, name: place.name, x: place.x, y: place.y, picket: n >= world.villages.length };
    });
    sim.camps.forEach(function (camp) {
      var size = camp.picket ? sim.enemyRng.int(c.picketMin, c.picketMax) : sim.enemyRng.int(c.campMin, c.campMax);
      for (var k = 0; k < size; k++) addScavenger(sim, camp);
    });
    setupPatrols(sim);
  };

  // Camps slowly refill between tides, and patrols that have lost people take on new ones.
  RZ.reinforceCamps = function (sim) {
    var c = sim.cfg.scav;
    sim.camps.forEach(function (camp) {
      if (camp.cleared) return; // a broken camp stays broken
      var size = sim.scavs.filter(function (s) { return s.camp === camp.id; }).length;
      var cap = camp.picket ? c.picketMax : c.campMax;
      if (size < cap && sim.enemyRng.chance(c.reinforceChance)) addScavenger(sim, camp);
    });
    var p = sim.cfg.patrol;
    sim.patrols.forEach(function (patrol) {
      var size = sim.scavs.filter(function (s) { return s.patrol === patrol.id; }).length;
      if (size < p.sizeMin && sim.patrolRng.chance(p.reinforceChance)) {
        addWalker(sim, patrol, patrol.stops[sim.patrolRng.int(0, patrol.stops.length - 1)]);
      }
    });
  };

  // ---- Patrols ----
  // A patrol walks a fixed loop between villages, in file, stopping a while at each one. The route is
  // worked out once on the real map. Patrols use their own random stream, so they don't reshuffle camps.

  // Where an enemy may walk on a patrol route: dry, outside huts and outside the safe houses.
  function patrolCosts(sim) {
    var world = sim.world;
    var costs = new Float32Array(world.moveCost);
    for (var i = 0; i < costs.length; i++) {
      if (world.water[i] || world.huts[i] || world.safeMask[i]) costs[i] = Infinity;
    }
    return costs;
  }

  // The nearest open cell to a village's centre, which is often a hut.
  function openCellNear(sim, x, y) {
    var world = sim.world;
    for (var reach = 0; reach <= 4; reach++) {
      for (var dy = -reach; dy <= reach; dy++) {
        for (var dx = -reach; dx <= reach; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== reach) continue;
          var cx = x + dx;
          var cy = y + dy;
          if (cx < 0 || cy < 0 || cx >= world.w || cy >= world.h) continue;
          var i = cx + cy * world.w;
          if (sim.patrolCosts[i] !== Infinity) return i;
        }
      }
    }
    return -1;
  }

  function planPatrol(sim, rng, starts) {
    var c = sim.cfg.patrol;
    var world = sim.world;
    var villages = world.villages;
    var fresh = villages.filter(function (v) { return starts.indexOf(v.id) < 0; });
    if (!fresh.length) return null;
    var stops = [rng.pick(fresh)];
    while (stops.length < c.stops) {
      var last = stops[stops.length - 1];
      var options = villages.filter(function (v) {
        return stops.indexOf(v) < 0 && Math.hypot(v.x - last.x, v.y - last.y) <= c.legMax;
      }).sort(function (a, b) {
        return Math.hypot(a.x - last.x, a.y - last.y) - Math.hypot(b.x - last.x, b.y - last.y);
      });
      if (!options.length) break;
      stops.push(rng.pick(options.slice(0, 2)));
    }
    if (stops.length < 2) return null;
    var cells = stops.map(function (v) { return openCellNear(sim, v.x, v.y); });
    if (cells.indexOf(-1) >= 0) return null;
    var route = [cells[0]];
    var stopAt = [0];
    for (var k = 0; k < cells.length; k++) {
      var found = RZ.findPath(world.w, world.h, sim.patrolCosts, cells[k], cells[(k + 1) % cells.length]);
      if (!found) return null;
      for (var n = 0; n < found.cells.length; n++) route.push(found.cells[n]);
      if (k < cells.length - 1) stopAt.push(route.length - 1);
    }
    route.pop(); // the last leg ends where the loop began
    if (route.length > c.routeMax || route.length < c.spacing * c.sizeMax + 2) return null;
    return {
      id: sim.nextPatrolId++,
      start: stops[0].id,
      names: stops.map(function (v) { return v.name; }),
      route: route,
      stops: stopAt
    };
  }

  // One more walker joins a patrol at a point on its route.
  function addWalker(sim, patrol, at) {
    var world = sim.world;
    var n = patrol.route.length;
    for (var tries = 0; tries < n; tries++) {
      var index = (at - tries + n) % n;
      var cell = patrol.route[index];
      var x = cell % world.w;
      var y = (cell - x) / world.w;
      if (taken(sim, null, x, y)) continue;
      sim.scavs.push({
        id: sim.nextScavId++, camp: null, patrol: patrol.id, x: x, y: y, hp: sim.cfg.scav.hp, cool: 0, moveWait: 0, alert: 0,
        at: index, pause: 0, paused: false, back: null, fromX: null, fromY: null
      });
      return;
    }
  }

  function setupPatrols(sim) {
    var c = sim.cfg.patrol;
    sim.patrols = [];
    sim.patrolCosts = patrolCosts(sim);
    var rng = sim.patrolRng;
    var starts = [];
    for (var tries = 0; sim.patrols.length < c.count && tries < c.count * 6; tries++) {
      var patrol = planPatrol(sim, rng, starts);
      if (!patrol) continue;
      starts.push(patrol.start);
      sim.patrols.push(patrol);
      var size = rng.int(c.sizeMin, c.sizeMax);
      var front = rng.int(0, patrol.route.length - 1);
      for (var k = 0; k < size; k++) addWalker(sim, patrol, front - k * c.spacing);
    }
  }

  function findPatrol(sim, id) {
    for (var i = 0; i < sim.patrols.length; i++) if (sim.patrols[i].id === id) return sim.patrols[i];
    return null;
  }

  function nearestOnRoute(patrol, x, y, w) {
    var best = 0;
    var bestDistance = Infinity;
    for (var i = 0; i < patrol.route.length; i++) {
      var cx = patrol.route[i] % w;
      var cy = (patrol.route[i] - cx) / w;
      var d = Math.max(Math.abs(cx - x), Math.abs(cy - y));
      if (d < bestDistance) { bestDistance = d; best = i; }
    }
    return best;
  }

  // One step along the route, or back to it after a chase. A walker waits if the next cell is taken.
  function walkPatrol(sim, s, patrol) {
    var c = sim.cfg.patrol;
    var world = sim.world;
    var w = world.w;
    var route = patrol.route;
    if (s.pause > 0) {
      s.pause--;
      return;
    }
    var here = s.x + s.y * w;
    if (here === route[s.at]) {
      if (!s.paused && patrol.stops.indexOf(s.at) >= 0) {
        s.paused = true;
        s.pause = c.pause;
        return;
      }
      s.paused = false;
      s.at = (s.at + 1) % route.length;
      s.back = null;
    }
    var next = route[s.at];
    var nx = next % w;
    var ny = (next - nx) / w;
    var onRoute = Math.abs(nx - s.x) <= 1 && Math.abs(ny - s.y) <= 1;
    if (!onRoute) {
      // Off the route after a chase: find the way back to the nearest part of it.
      if (!s.back || s.back.i >= s.back.cells.length) {
        s.at = nearestOnRoute(patrol, s.x, s.y, w);
        if (route[s.at] === here) return;
        var found = RZ.findPath(world.w, world.h, sim.patrolCosts, here, route[s.at]);
        s.back = found && found.cells.length ? { cells: found.cells, i: 0 } : null;
        if (!s.back) return;
      }
      next = s.back.cells[s.back.i];
      nx = next % w;
      ny = (next - nx) / w;
    }
    if (!taken(sim, s, nx, ny)) {
      if (!onRoute) s.back.i++;
      s.stuck = 0;
      s.x = nx;
      s.y = ny;
      return;
    }
    // Someone's in the way. Routes run out and back over the same ground, so walkers meet head on.
    // Step round them onto a cell beside the one after, or after a while step aside and find the route again.
    s.stuck = (s.stuck || 0) + 1;
    var after = onRoute ? route[(s.at + 1) % route.length] : -1;
    var ax = after % w;
    var ay = (after - ax) / w;
    var best = null;
    var bestDistance = Infinity;
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        var x = s.x + dx;
        var y = s.y + dy;
        if ((!dx && !dy) || !standable(sim, x, y, false) || taken(sim, s, x, y)) continue;
        var d = after >= 0 && Math.abs(ax - x) <= 1 && Math.abs(ay - y) <= 1 ? Math.hypot(ax - x, ay - y) : Infinity;
        if (d === Infinity && s.stuck > 4) d = 10 + Math.hypot(nx - x, ny - y);
        if (d < bestDistance) { bestDistance = d; best = { x: x, y: y, round: d < 10 }; }
      }
    }
    if (!best) return;
    if (best.round) s.at = (s.at + 1) % route.length;
    else s.back = null;
    s.stuck = 0;
    s.x = best.x;
    s.y = best.y;
  }

  // ---- Closing in ----

  // Someone already on this cell: the ranger, or another enemy.
  function taken(sim, mover, x, y) {
    var r = sim.ranger;
    if (r && r.alive && r.x === x && r.y === y) return true;
    for (var i = 0; i < sim.scavs.length; i++) {
      var s = sim.scavs[i];
      if (s !== mover && s.x === x && s.y === y) return true;
    }
    for (var o = 0; o < sim.olds.length; o++) {
      var old = sim.olds[o];
      if (old !== mover && old.x === x && old.y === y) return true;
    }
    return false;
  }

  // Old selves wade the shallows; scavengers keep their feet dry.
  function standable(sim, x, y, wades) {
    var world = sim.world;
    if (x < 0 || y < 0 || x >= world.w || y >= world.h) return false;
    var cell = x + y * world.w;
    if (world.huts[cell] || world.safeMask[cell]) return false;
    return wades ? world.water[cell] !== 2 : !world.water[cell];
  }

  // True if an enemy can step onto this cell now.
  RZ.enemyCanStep = function (sim, mover, x, y, wades) {
    return standable(sim, x, y, wades) && !taken(sim, mover, x, y);
  };

  function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  // Where an enemy giving chase steps next, or null to hold. Further off they walk straight at the ranger,
  // edging round anything in the way. Close in they flank: hold a ring round the ranger, spread out from
  // each other, take what cover there is, and work a few cells round before holding. They never step
  // onto the ranger or onto each other. armed is false for an old self that can only claw.
  RZ.closeOn = function (sim, mover, armed, wades) {
    var f = sim.cfg.combat.flank;
    var r = sim.ranger;
    var world = sim.world;
    var dx = r.x - mover.x;
    var dy = r.y - mover.y;
    var distance = Math.sqrt(dx * dx + dy * dy);
    var ring = armed ? f.ring : f.clawRing;
    if (distance > Math.max(f.close, ring + 1)) {
      mover.flanked = 0;
      var mx = Math.sign(dx);
      var my = Math.sign(dy);
      var tries = [[mx, my], mx && my ? [mx, 0] : [mx || my, my || -mx], mx && my ? [0, my] : [mx || -my, my || mx]];
      for (var t = 0; t < tries.length; t++) {
        if (RZ.enemyCanStep(sim, mover, mover.x + tries[t][0], mover.y + tries[t][1], wades)) {
          return { x: mover.x + tries[t][0], y: mover.y + tries[t][1] };
        }
      }
      return null;
    }

    var others = [];
    sim.scavs.concat(sim.olds).forEach(function (e) {
      if (e !== mover && Math.abs(e.x - r.x) <= ring + f.spread + 1 && Math.abs(e.y - r.y) <= ring + f.spread + 1) others.push(e);
    });
    var side = mover.id % 2 ? 1 : -1;
    var round = Math.atan2(mover.y - r.y, mover.x - r.x);
    var best = null;
    var bestScore = -Infinity;
    for (var sy = -1; sy <= 1; sy++) {
      for (var sx = -1; sx <= 1; sx++) {
        var x = mover.x + sx;
        var y = mover.y + sy;
        var stay = !sx && !sy;
        if (stay ? (x === r.x && y === r.y) : !RZ.enemyCanStep(sim, mover, x, y, wades)) continue;
        var ax = x - r.x;
        var ay = y - r.y;
        var d = Math.sqrt(ax * ax + ay * ay);
        var score = -Math.abs(d - ring) * 2;
        for (var k = 0; k < others.length; k++) {
          var gap = Math.hypot(x - others[k].x, y - others[k].y);
          if (gap < f.spread) score -= f.spread - gap;
        }
        var cell = x + y * world.w;
        if (world.trees[cell]) score += f.cover;
        if (armed && !RZ.lineOfSight(sim, x, y, r.x, r.y)) score -= 1;
        if (stay) score += 0.15; // no fidgeting
        else if ((mover.flanked || 0) < f.steps) score += side * wrapAngle(Math.atan2(ay, ax) - round) * 1.5;
        if (score > bestScore) {
          bestScore = score;
          best = stay ? null : { x: x, y: y };
        }
      }
    }
    if (best) mover.flanked = (mover.flanked || 0) + 1;
    return best;
  };

  // True if a straight line between two cells clears ridges, trees and huts.
  RZ.lineOfSight = function (sim, ax, ay, bx, by) {
    var world = sim.world;
    var c = sim.cfg.ranger;
    var w = world.w;
    var steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    if (steps < 2) return true;
    var from = Math.max(world.elev[ax + ay * w], world.seaLevel) * c.heightScale + c.eyeHeight;
    var to = Math.max(world.elev[bx + by * w], world.seaLevel) * c.heightScale + c.eyeHeight;
    for (var s = 1; s < steps; s++) {
      var t = s / steps;
      var i = Math.round(ax + (bx - ax) * t) + Math.round(ay + (by - ay) * t) * w;
      var top = Math.max(world.elev[i], world.seaLevel) * c.heightScale +
        (world.trees[i] ? c.treeHeight : 0) + (world.huts[i] ? c.hutHeight : 0);
      if (top > from + (to - from) * t) return false;
    }
    return true;
  };

  function coverAt(sim, i) {
    var c = sim.cfg.combat;
    if (sim.world.huts[i]) return c.hutCover;
    if (sim.world.trees[i]) return c.treeCover;
    return 1;
  }

  // One dice roll. Range wears down accuracy and cover reduces it further.
  RZ.rollShot = function (sim, gun, distance, targetCell, aim) {
    var chance = gun.hit * (aim || 1) * (1 - gun.falloff * (distance / gun.range)) * coverAt(sim, targetCell);
    if (!sim.combatRng.chance(chance)) return 0;
    return sim.combatRng.int(gun.damageMin, gun.damageMax);
  };

  function stepOne(sim, s) {
    var c = sim.cfg.scav;
    var r = sim.ranger;
    if (s.cool > 0) s.cool--;
    if (RZ.tideCovers(sim, s.x + s.y * sim.world.w)) return; // gone to ground in the cellars

    var world = sim.world;
    var patrol = s.patrol != null ? findPatrol(sim, s.patrol) : null;
    var camp = patrol ? null : sim.camps[s.camp];
    var ticksPerSecond = sim.cfg.sim.ticksPerSecond;
    var spotted = false;
    if (r && r.alive && !world.safeMask[r.x + r.y * world.w]) {
      var dx = r.x - s.x;
      var dy = r.y - s.y;
      var distance = Math.sqrt(dx * dx + dy * dy);
      var sight = patrol ? sim.cfg.patrol.sight : c.sight; // walking, a patrol watches the road more than the hills
      if (distance <= sight - r.quiet && RZ.lineOfSight(sim, s.x, s.y, r.x, r.y)) {
        spotted = true;
        s.alert = c.alertTicks;
        if (distance <= c.range && s.cool <= 0) {
          s.cool = Math.round(c.reload * ticksPerSecond);
          var damage = RZ.rollShot(sim, c, distance, r.x + r.y * world.w);
          RZ.emit(sim, 'shot', { fromX: s.x, fromY: s.y, toX: r.x, toY: r.y, hit: damage > 0, damage: damage, by: 'scav' });
          if (damage > 0) RZ.hurtRanger(sim, r, damage, 'scavenger');
        }
      }
    }

    if (s.moveWait > 0) {
      s.moveWait--;
      return;
    }
    s.moveWait = patrol ? sim.cfg.patrol.moveTicks : c.moveTicks;
    if (spotted || s.alert > 0) {
      s.alert = Math.max(0, s.alert - s.moveWait);
      // A camp gives chase as far as its leash. A patrol measures its leash from where the chase began.
      if (patrol && s.fromX == null) {
        s.fromX = s.x;
        s.fromY = s.y;
      }
      var anchorX = patrol ? s.fromX : camp.x;
      var anchorY = patrol ? s.fromY : camp.y;
      var leash = patrol ? sim.cfg.patrol.leash : c.leash;
      if (r && r.alive && Math.abs(r.x - anchorX) <= leash && Math.abs(r.y - anchorY) <= leash) {
        var to = RZ.closeOn(sim, s, true, false);
        if (to) {
          s.x = to.x;
          s.y = to.y;
        }
        return;
      }
    }
    if (patrol) {
      s.fromX = null;
      s.fromY = null;
      walkPatrol(sim, s, patrol);
      return;
    }
    var rng = sim.enemyRng;
    var moveX = Math.sign(camp.x - s.x);
    var moveY = Math.sign(camp.y - s.y);
    if (Math.abs(camp.x - s.x) <= 3 && Math.abs(camp.y - s.y) <= 3) {
      moveX = rng.int(-1, 1);
      moveY = rng.int(-1, 1);
    }
    if (RZ.enemyCanStep(sim, s, s.x + moveX, s.y + moveY, false)) {
      s.x += moveX;
      s.y += moveY;
    }
  }

  RZ.stepScavengers = function (sim) {
    for (var i = 0; i < sim.scavs.length; i++) stepOne(sim, sim.scavs[i]);
  };

  function findEnemy(sim, id) {
    for (var i = 0; i < sim.scavs.length; i++) if (sim.scavs[i].id === id) return { target: sim.scavs[i], old: false };
    for (var o = 0; o < sim.olds.length; o++) if (sim.olds[o].id === id) return { target: sim.olds[o], old: true };
    return null;
  }

  // Damage lands on a scavenger or an old self. Returns true if it put them down.
  function hurtEnemy(sim, r, target, old, damage) {
    var cfg = sim.cfg;
    target.hp -= damage;
    if (target.hp > 0) return false;
    if (old) {
      RZ.oldSelfDown(sim, r, target);
      return true;
    }
    sim.scavs = sim.scavs.filter(function (s) { return s !== target; });
    r.kills++;
    sim.stats.scavsKilled++;
    RZ.emit(sim, 'kill', { x: target.x, y: target.y });
    RZ.speak(sim, r, 'kill');
    if (sim.combatRng.chance(cfg.scav.dropChance)) RZ.addItem(sim, target.x, target.y, 'ammo', sim.combatRng.int(4, 10));
    return true;
  }

  // A ranger takes a shot at a scavenger they can see, drawing whichever carried gun suits the distance.
  // Returns false if the shot can't be made.
  RZ.rangerShoot = function (sim, r, scavId) {
    var cfg = sim.cfg;
    if (!r.pack.weapons.length || r.pack.ammo <= 0 || r.cool > 0) return false;
    var found = findEnemy(sim, scavId);
    if (!found) return false;
    var target = found.target;
    if (!RZ.canSee(sim, target.x, target.y)) return false;
    var dx = target.x - r.x;
    var dy = target.y - r.y;
    var distance = Math.sqrt(dx * dx + dy * dy);
    var name = RZ.pickWeapon(cfg, r.pack.weapons, distance, r.pack.ammo);
    if (!name) return false;
    var gun = cfg.items.weapons[name];
    r.inHand = name;
    r.cool = Math.round(gun.reload * cfg.sim.ticksPerSecond);
    r.lastShot = { x: target.x, y: target.y, tick: sim.tick };
    target.alert = cfg.scav.alertTicks;
    var rounds = Math.min(gun.burst || 1, r.pack.ammo);
    for (var n = 0; n < rounds; n++) {
      r.pack.ammo--;
      var damage = RZ.rollShot(sim, gun, distance, target.x + target.y * sim.world.w, r.aim);
      RZ.emit(sim, 'shot', { fromX: r.x, fromY: r.y, toX: target.x, toY: target.y, hit: damage > 0, damage: damage, by: 'ranger', weapon: name, round: n });
      if (damage > 0 && hurtEnemy(sim, r, target, found.old, damage)) break;
    }
    return true;
  };

  // A grenade thrown at a cell. Anyone can throw one: a ranger, or an old self with one in their pack.
  // Returns false if the throw can't be made.
  RZ.throwGrenade = function (sim, thrower, x, y, by) {
    var cfg = sim.cfg;
    var g = cfg.items.grenade;
    var world = sim.world;
    var r = sim.ranger;
    if (thrower.pack.grenade <= 0 || thrower.cool > 0) return false;
    var dx = x - thrower.x;
    var dy = y - thrower.y;
    var distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > g.range || distance < g.minRange) return false;
    if (x < 0 || y < 0 || x >= world.w || y >= world.h) return false;
    if (by === 'ranger' && !RZ.canSee(sim, x, y)) return false;
    thrower.pack.grenade--;
    thrower.cool = Math.round(g.reload * cfg.sim.ticksPerSecond);
    var rng = sim.combatRng;
    if (rng.chance(g.scatter)) {
      x = Math.max(0, Math.min(world.w - 1, x + rng.int(-1, 1)));
      y = Math.max(0, Math.min(world.h - 1, y + rng.int(-1, 1)));
    }
    RZ.emit(sim, 'blast', { fromX: thrower.x, fromY: thrower.y, x: x, y: y, radius: g.radius, by: by });

    function blastDamage(tx, ty) {
      var bx = tx - x;
      var by2 = ty - y;
      var reach = Math.sqrt(bx * bx + by2 * by2);
      if (reach > g.radius || RZ.tideCovers(sim, tx + ty * world.w)) return 0;
      var roll = rng.int(g.damageMin, g.damageMax) * (1 - reach / (g.radius + 1)) * coverAt(sim, tx + ty * world.w);
      return Math.max(1, Math.round(roll));
    }

    sim.scavs.forEach(function (s) {
      var ax = s.x - x;
      var ay = s.y - y;
      if (ax * ax + ay * ay <= g.alert * g.alert) s.alert = cfg.scav.alertTicks;
    });
    if (!r || !r.alive) return true;
    if (by === 'ranger') {
      // Rolled for everyone first, so the order people fall in can't change who gets hurt.
      var hits = [];
      sim.olds.concat(sim.scavs).forEach(function (enemy) {
        var damage = blastDamage(enemy.x, enemy.y);
        if (damage > 0) hits.push({ enemy: enemy, damage: damage, old: sim.olds.indexOf(enemy) >= 0 });
      });
      hits.forEach(function (hit) {
        RZ.emit(sim, 'blast-hit', { x: hit.enemy.x, y: hit.enemy.y, damage: hit.damage });
        hurtEnemy(sim, r, hit.enemy, hit.old, hit.damage);
      });
    } else {
      // minRange keeps a ranger's own throws outside the blast, so only someone else's can reach them.
      var self = blastDamage(r.x, r.y);
      if (self > 0 && !world.safeMask[r.x + r.y * world.w]) RZ.hurtRanger(sim, r, self, 'oldself');
    }
    return true;
  };

  RZ.senseEnemies = function (sim, r, percept) {
    var limit = r.sight;
    sim.olds.forEach(function (old) {
      if (!RZ.canSee(sim, old.x, old.y) || RZ.tideCovers(sim, old.x + old.y * sim.world.w)) return;
      var dx = old.x - r.x;
      var dy = old.y - r.y;
      var distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= limit) percept.enemies.push({ id: old.id, x: old.x, y: old.y, distance: distance, old: true, no: old.no, first: old.first });
    });
    sim.scavs.forEach(function (s) {
      if (!RZ.canSee(sim, s.x, s.y) || RZ.tideCovers(sim, s.x + s.y * sim.world.w)) return;
      var dx = s.x - r.x;
      var dy = s.y - r.y;
      var distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > limit) return;
      var seen = { id: s.id, x: s.x, y: s.y, distance: distance };
      if (s.patrol != null) seen.patrol = s.patrol; // a group on the move looks like one
      percept.enemies.push(seen);
    });
    percept.enemies.sort(function (a, b) { return a.distance - b.distance; });
  };
})();
