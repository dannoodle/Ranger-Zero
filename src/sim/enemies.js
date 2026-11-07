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
  };

  // Camps slowly refill between tides.
  RZ.reinforceCamps = function (sim) {
    var c = sim.cfg.scav;
    sim.camps.forEach(function (camp) {
      var size = sim.scavs.filter(function (s) { return s.camp === camp.id; }).length;
      var cap = camp.picket ? c.picketMax : c.campMax;
      if (size < cap && sim.enemyRng.chance(c.reinforceChance)) addScavenger(sim, camp);
    });
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
    var camp = sim.camps[s.camp];
    var ticksPerSecond = sim.cfg.sim.ticksPerSecond;
    var spotted = false;
    if (r && r.alive && !world.safeMask[r.x + r.y * world.w]) {
      var dx = r.x - s.x;
      var dy = r.y - s.y;
      var distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= c.sight - r.quiet && RZ.lineOfSight(sim, s.x, s.y, r.x, r.y)) {
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
    s.moveWait = c.moveTicks;
    var targetX = camp.x;
    var targetY = camp.y;
    var roam = 3;
    if (spotted || s.alert > 0) {
      s.alert = Math.max(0, s.alert - c.moveTicks);
      if (r && r.alive && Math.abs(r.x - camp.x) <= c.leash && Math.abs(r.y - camp.y) <= c.leash) {
        targetX = r.x;
        targetY = r.y;
        roam = 0;
      }
    }
    var rng = sim.enemyRng;
    var moveX = Math.sign(targetX - s.x);
    var moveY = Math.sign(targetY - s.y);
    if (roam && Math.abs(targetX - s.x) <= roam && Math.abs(targetY - s.y) <= roam) {
      moveX = rng.int(-1, 1);
      moveY = rng.int(-1, 1);
    }
    var nx = s.x + moveX;
    var ny = s.y + moveY;
    if (nx < 0 || ny < 0 || nx >= world.w || ny >= world.h) return;
    var cell = nx + ny * world.w;
    if (world.water[cell] || world.huts[cell] || world.safeMask[cell]) return;
    s.x = nx;
    s.y = ny;
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
      if (distance <= limit) percept.enemies.push({ id: s.id, x: s.x, y: s.y, distance: distance });
    });
    percept.enemies.sort(function (a, b) { return a.distance - b.distance; });
  };
})();
