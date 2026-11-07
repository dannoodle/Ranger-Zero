// Old selves: a body the tide reaches gets back up, carrying the gear it died with.
// They shamble, they're slow, and they use whatever gun they fell with until the rounds run out.
// Beating one leaves the gear on the ground. After a few tides the mould lets them go.

var RZ = RZ || {};

(function () {
  var MUTTERS = [
    '...is this Zero...', '...came all this way...', '...tell them I...', '...let me in, let me in...',
    '...still walking...', '...cold now, it wasn\'t cold...', '...whose hands are...', '...nearly home...'
  ];

  function gearWorth(pack) {
    return pack.food + pack.med * 2 + pack.ammo * 0.1 + pack.weapons.length;
  }

  // The tide has reached a body. Returns true if it got up.
  RZ.raiseOldSelf = function (sim, body) {
    var c = sim.cfg.oldself;
    if (body.laid || sim.olds.length >= c.max) return false;
    if (gearWorth(body.pack) < c.gearWorth) return false;
    var cfg = sim.cfg;
    sim.olds.push({
      id: sim.nextScavId++,
      no: body.no,
      name: body.name,
      first: body.first,
      words: body.words,
      x: body.x,
      y: body.y,
      homeX: body.x,
      homeY: body.y,
      hp: c.hp,
      pack: body.pack,
      weapon: RZ.bestWeapon(cfg, body.pack.weapons),
      cool: 0,
      moveWait: 0,
      alert: 0,
      risenTide: sim.tide.number,
      chapter: sim.chapter.no,
      nextMutter: sim.tick + Math.round(c.mutterEvery * cfg.sim.ticksPerSecond * 0.3)
    });
    RZ.writeEntry(sim.book, { tick: sim.tick }, 'old', 'The tide reached ' + body.first + '\'s body. Something got up.');
    RZ.emit(sim, 'old-rise', { x: body.x, y: body.y, name: body.first });
    return true;
  };

  function mutter(sim, old) {
    var c = sim.cfg.oldself;
    if (sim.tick < old.nextMutter) return;
    var r = sim.ranger;
    var dx = r.x - old.x;
    var dy = r.y - old.y;
    if (dx * dx + dy * dy > c.mutterRange * c.mutterRange) return;
    old.nextMutter = sim.tick + Math.round(c.mutterEvery * sim.cfg.sim.ticksPerSecond);
    var own = old.words ? '...' + old.words.toLowerCase().replace(/[.!?]+$/, '') + '...' : null;
    var words = own && old.lastMutter !== own && sim.voiceRng.chance(0.4) ? own : sim.voiceRng.pick(MUTTERS);
    if (words === old.lastMutter) return;
    old.lastMutter = words;
    RZ.addTalk(sim, 'old', words, old.first);
  }

  function stepOne(sim, old) {
    var c = sim.cfg.oldself;
    var cfg = sim.cfg;
    var world = sim.world;
    var r = sim.ranger;
    if (old.cool > 0) old.cool--;
    if (RZ.tideCovers(sim, old.x + old.y * world.w)) return;
    if (r && r.alive) mutter(sim, old);

    var chasing = false;
    if (r && r.alive && !world.safeMask[r.x + r.y * world.w]) {
      var dx = r.x - old.x;
      var dy = r.y - old.y;
      var distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= c.sight - r.quiet && RZ.lineOfSight(sim, old.x, old.y, r.x, r.y)) {
        chasing = true;
        old.alert = 60;
        var name = RZ.pickWeapon(cfg, old.pack.weapons, distance, old.pack.ammo);
        var g = cfg.items.grenade;
        if (old.cool <= 0) {
          if (old.pack.grenade > 0 && distance >= g.minRange && distance <= g.range) {
            RZ.throwGrenade(sim, old, r.x, r.y, 'old');
          } else if (name) {
            var gun = cfg.items.weapons[name];
            old.cool = Math.round(gun.reload * cfg.sim.ticksPerSecond * 1.2);
            var rounds = Math.min(gun.burst || 1, old.pack.ammo);
            for (var n = 0; n < rounds && r.alive; n++) {
              old.pack.ammo--;
              var damage = RZ.rollShot(sim, gun, distance, r.x + r.y * world.w, c.aim);
              RZ.emit(sim, 'shot', { fromX: old.x, fromY: old.y, toX: r.x, toY: r.y, hit: damage > 0, damage: damage, by: 'old', weapon: name, round: n });
              if (damage > 0) RZ.hurtRanger(sim, r, damage, 'oldself');
            }
          } else if (distance <= c.clawRange) {
            old.cool = Math.round(c.clawReload * cfg.sim.ticksPerSecond);
            RZ.hurtRanger(sim, r, sim.enemyRng.int(c.clawMin, c.clawMax), 'oldself');
          }
        }
      }
    }

    if (old.moveWait > 0) {
      old.moveWait--;
      return;
    }
    old.moveWait = c.moveTicks;
    var rng = sim.enemyRng;
    if ((chasing || old.alert > 0) && r && r.alive) {
      old.alert = Math.max(0, old.alert - c.moveTicks);
      // One with rounds or grenades works round the ranger at range; one with neither closes to claw.
      var armed = (old.pack.weapons.length > 0 && old.pack.ammo > 0) || old.pack.grenade > 0;
      var to = RZ.closeOn(sim, old, armed, true);
      if (to) {
        old.x = to.x;
        old.y = to.y;
      }
      return;
    }
    // A slow drift, wandering but always tending back towards where it rose.
    var moveX = rng.int(-1, 1);
    var moveY = rng.int(-1, 1);
    if (Math.abs(old.x - old.homeX) > c.leash) moveX = Math.sign(old.homeX - old.x);
    if (Math.abs(old.y - old.homeY) > c.leash) moveY = Math.sign(old.homeY - old.y);
    if (RZ.enemyCanStep(sim, old, old.x + moveX, old.y + moveY, true)) {
      old.x += moveX;
      old.y += moveY;
    }
  }

  RZ.stepOldSelves = function (sim) {
    for (var i = 0; i < sim.olds.length; i++) stepOne(sim, sim.olds[i]);
  };

  // A ranger has put one down. The gear stays where it fell.
  RZ.oldSelfDown = function (sim, r, old) {
    sim.olds = sim.olds.filter(function (o) { return o !== old; });
    sim.stats.oldsBeaten++;
    r.kills++;
    sim.bodies.push({ x: old.x, y: old.y, no: old.no, name: old.name, first: old.first, words: old.words, pack: old.pack, laid: true });
    RZ.emit(sim, 'old-down', { x: old.x, y: old.y, name: old.first });
    RZ.writeEntry(sim.book, { tick: sim.tick }, 'triumph', RZ.lead(r) + 'Put ' + old.first + ' down at last. Whatever that was, it\'s over now.');
    RZ.addDeed(sim, 'put ' + old.first + ' to rest');
    RZ.speak(sim, r, 'old_kill', { name: old.first });
  };

  // The mould gives up on them in the end.
  RZ.fadeOldSelves = function (sim) {
    var life = sim.cfg.oldself.lifeTides;
    sim.olds = sim.olds.filter(function (old) {
      if (sim.tide.number - old.risenTide < life) return true;
      RZ.writeEntry(sim.book, { tick: sim.tick }, 'old', 'Nobody has seen ' + old.first + ' since the last tide. The mould has finished with them.');
      return false;
    });
  };
})();
