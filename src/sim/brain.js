// How a ranger acts in the moment: fight, flee, hide, heal, or head for shelter.
//
// think() receives the ranger, the journal, a percept and `act`. It is never given the sim, so it
// can only use what the ranger can see or has been told. See sense.js for how the percept is made.

var RZ = RZ || {};

(function () {
  function here(r) {
    return { x: r.x, y: r.y };
  }

  function distance(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  RZ.safeHere = function (r, book) {
    var radius = r.cfg.safe.radius;
    for (var i = 0; i < book.places.length; i++) {
      var place = book.places[i];
      if (distance(place, r) <= radius) return place;
    }
    return null;
  };

  // Known dangers make cells dearer on the ranger's own map, so routes bend around them.
  function refreshRoutes(r) {
    var map = r.map;
    if (!map.dangerDirty) return;
    map.dangerDirty = false;
    map.version++;
    var p = r.cfg.planner;
    var w = map.w;
    var h = map.h;
    map.route.set(map.cost);
    function raise(x, y, radius, weight) {
      for (var dy = -radius; dy <= radius; dy++) {
        for (var dx = -radius; dx <= radius; dx++) {
          var cx = x + dx;
          var cy = y + dy;
          if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d > radius) continue;
          var i = cx + cy * w;
          if (map.route[i] !== Infinity) map.route[i] += weight * (1 - d / (radius + 1));
        }
      }
    }
    map.camps.forEach(function (camp) {
      var hurt = camp.beatUs || 0;
      raise(camp.x, camp.y, p.campAvoidRadius + hurt * 2, p.campAvoidCost * (1 + hurt));
    });
    map.patrols.forEach(function (seen) { raise(seen.x, seen.y, p.patrolAvoidRadius, p.patrolAvoidCost); });
    map.anomalies.forEach(function (a) { raise(a.x, a.y, 3, p.anomalyAvoidCost); });
    map.warnings.forEach(function (mark) {
      if (mark.heeded) raise(mark.x, mark.y, r.cfg.radio.warnRadius, r.cfg.radio.warnCost);
    });
    r.pathSuspect = true;
  }

  function noteCamp(r, enemy, act) {
    var map = r.map;
    var camp = RZ.campNear(map, enemy.x, enemy.y, 12);
    if (!camp) {
      var name = RZ.nearestName(r.book, map, enemy.x, enemy.y);
      // A big camp can be spotted from two sides. It's still news only once.
      var known = map.camps.some(function (other) { return other.name === name; });
      camp = { x: enemy.x, y: enemy.y, name: name, spotted: 0, beatUs: 0, lowAmmo: 0 };
      map.camps.push(camp);
      map.dangerDirty = true;
      if (!known) {
        RZ.writeEntry(r.book, r.clock, 'note', RZ.lead(r) + 'Scavengers camped at ' + name + '.');
        act.say('camp_seen', { place: name });
      }
    }
    camp.spotted++;
  }

  // A group on the move isn't a camp, so it isn't marked as one. Where it was seen goes on the map,
  // so over time the journal learns the roads patrols use. It's written up once a life.
  function notePatrol(r, enemy, book, clock, act) {
    var map = r.map;
    var reach = r.cfg.planner.patrolMarkSpacing;
    var near = map.patrols.some(function (seen) {
      return Math.abs(seen.x - enemy.x) <= reach && Math.abs(seen.y - enemy.y) <= reach;
    });
    if (!near) {
      map.patrols.push({ x: enemy.x, y: enemy.y });
      map.dangerDirty = true;
    }
    if (r.patrolsSeen[enemy.patrol]) return;
    r.patrolsSeen[enemy.patrol] = true;
    var place = RZ.nearestName(book, r.map, enemy.x, enemy.y);
    act.say('patrol_seen', { place: place });
    RZ.writeEntry(book, clock, 'note', RZ.lead(r) + 'A patrol on the move near ' + place + '. They don\'t keep to one place.');
  }

  function noteOldSelf(r, enemy, book, clock, act) {
    if (r.oldsSeen[enemy.no]) return;
    r.oldsSeen[enemy.no] = true;
    act.say('old_seen', { name: enemy.first });
    RZ.writeEntry(book, clock, 'old', RZ.lead(r) + 'I saw ' + enemy.first + ' today, walking. The journal says ' + enemy.first + ' is dead.');
  }

  // Warnings from Zero are settled by what the ranger finds. Anything real near the mark proves it.
  function settleWarnings(r, book, percept, act, clock) {
    var map = r.map;
    if (!map.warnings.length) return;
    var c = r.cfg.radio;
    var things = percept.enemies.concat(percept.tellsSeen);
    if (r.struck) things.push(r.struck);
    map.warnings = map.warnings.filter(function (mark) {
      var found = things.some(function (thing) { return distance(thing, mark) <= c.warnRadius; });
      if (found) {
        RZ.judgeZero(book, r.cfg, clock, true, c.trustRight, 'Zero warned ' + r.first + ' off a spot, and there was something there.');
        act.say(mark.heeded ? 'right' : 'right_ignored');
        map.dangerDirty = true;
        return false;
      }
      if (distance(r, mark) <= c.warnPassed) {
        RZ.judgeZero(book, r.cfg, clock, false, c.trustWrong, 'Zero warned ' + r.first + ' off a spot. Nothing there.');
        act.say('wrong');
        map.dangerDirty = true;
        return false;
      }
      return true;
    });
  }

  // Bumps the trust record once the tide shows whether a turn-back was the right call.
  function settleTurnback(r, book, clock) {
    var order = book.zero.turnback;
    if (!order) return;
    book.zero.turnback = null;
    var c = r.cfg.radio;
    var right = clock.seconds - order.seconds <= c.turnbackWithin;
    RZ.judgeZero(book, r.cfg, clock, right, right ? c.trustRight : c.trustWrong,
      right ? 'Zero called ' + order.first + ' back, and the tide came right after. Zero saw it first.'
            : 'Zero called ' + order.first + ' back, and no tide came. A window wasted.');
    r.pendingVerdict = right ? 'right' : 'wrong_turnback';
  }

  function trackTide(r, book, percept, clock, act) {
    var tide = book.tide;
    if (percept.tide) {
      tide.lastSeen = clock.seconds;
      if (!tide.active) {
        tide.active = true;
        settleTurnback(r, book, clock);
        if (!RZ.safeHere(r, book)) act.say('tide_seen');
        var sample = clock.seconds - tide.lastClear;
        // A sighting this soon is the last tide still draining away, not a new one.
        if (sample >= tide.window * r.cfg.planner.tideSampleFloor) {
          var p = r.cfg.planner;
          tide.window += (sample - tide.window) * (sample < tide.window ? p.tideLearnDown : p.tideLearnUp);
          tide.samples++;
        }
      }
      return;
    }
    if (tide.active && clock.seconds - tide.lastSeen > r.cfg.planner.tideClearSeconds) {
      tide.active = false;
      tide.lastClear = clock.seconds;
      // Whatever was lying out there has been eaten, and pockets have moved.
      r.map.items = {};
      r.map.anomalies = [];
      r.map.warnings = [];
      r.map.dangerDirty = true;
      book.body = null;
    }
  }

  function remember(r, book, percept, clock, act) {
    var map = r.map;
    percept.hutsSeen.forEach(function (village) { map.villages[village.id] = village; });
    percept.enemies.forEach(function (enemy) {
      if (enemy.old) noteOldSelf(r, enemy, book, clock, act);
      else if (enemy.patrol != null) notePatrol(r, enemy, book, clock, act);
      else noteCamp(r, enemy, act);
    });
    settleWarnings(r, book, percept, act, clock);
    percept.tellsSeen.forEach(function (tell) {
      for (var i = 0; i < map.anomalies.length; i++) {
        if (map.anomalies[i].x === tell.x && map.anomalies[i].y === tell.y) return;
      }
      map.anomalies.push(tell);
      map.dangerDirty = true;
      act.say('tell');
    });
    if (r.struck) {
      map.anomalies.push(r.struck);
      map.dangerDirty = true;
      r.struck = null;
    }
    trackTide(r, book, percept, clock, act);
    if (r.pendingVerdict) {
      act.say(r.pendingVerdict);
      r.pendingVerdict = null;
    }
  }

  function upkeep(r, act, place) {
    var c = r.cfg.ranger;
    // The tide's mould. A medkit burns some of it out, when there's no shelter near enough to do it.
    if (r.infection > 0 && !place && !r.caught) {
      r.caught = true;
      act.say('tide_touch');
    }
    // Not while still standing in it, unless it's that or fall down.
    var inIt = r.percept && r.percept.tide && r.percept.tide.distance < 1;
    if (!place && r.infection >= r.cfg.tide.medAt && (!inIt || r.hp < c.healBelow * 0.5) && act.heal()) act.say('heal_mould');
    if (place && r.wasInfected && r.infection === 0) act.say('mould_cured');
    r.wasInfected = r.infection > 0;
    if (r.energy < c.eatBelow) {
      if (act.eat()) act.say('eat');
      else if (place) {
        if (!act.eatFromStash()) act.say('no_food');
      } else if (r.energy < c.eatBelow * 0.6) act.say('hungry');
    }
    if (r.hp < c.healBelow) {
      if (act.heal()) act.say('heal');
      else if (!place || !act.healFromStash()) act.say('no_meds');
    }
    // Rounds only come up when they've just been firing them.
    if (r.weapon && !place && r.lastShot && r.clock.tick - r.lastShot.tick < 40) {
      if (r.pack.ammo === 0) act.say('no_ammo');
      else if (r.pack.ammo < r.cfg.lessons.lowAmmo) act.say('low_ammo');
    }
  }

  function arriveSafe(r, book, place, act, percept, clock) {
    if (r.lastSafe === place.id) return;
    var close = (percept.tide && percept.tide.distance < 18) || r.mode === 'shelter' && RZ.timeLeft(book, clock.seconds, r) < 8;
    if (r.lastSafe !== null || close) act.say(close ? 'safe_close' : 'safe', { place: place.name });
    r.lastSafe = place.id;
    act.usedSafeHouse(place.id);
    RZ.commitMap(book, r);
  }

  // Caught out and lived. The journal takes it as a warning, a smaller one than a death.
  function survivedTide(r, book, place, clock) {
    if (!r.caught) return;
    r.caught = false;
    var c = r.cfg.lessons;
    book.lessons.tideMargin = Math.min(c.tideMarginMax, book.lessons.tideMargin + c.tideMarginCaught);
    RZ.writeEntry(book, clock, 'note', RZ.lead(r) + 'The tide caught me out. Made it to shelter at ' + place.name +
      ' with the mould in me. Leaving more time from now on.');
  }

  // Walks a ranger to a spot Zero gave them, as a detour from wherever they are.
  function detour(r, spot, crate) {
    var steps = [
      { do: 'go', x: spot.x, y: spot.y, near: crate ? 0 : 1 },
      { do: crate ? 'open' : 'look', x: spot.x, y: spot.y }
    ];
    if (r.plan && r.plan.kind !== 'wait') {
      r.plan.steps.splice.apply(r.plan.steps, [r.plan.at, 0].concat(steps));
    } else {
      var back = RZ.nearestSafe(r, r.book, here(r));
      steps.push({ do: 'go', x: back.place.x, y: back.place.y, near: r.cfg.safe.radius - 1 });
      r.plan = { kind: 'errand', steps: steps, at: 0, note: null };
    }
    r.path = null;
    r.grab = null;
    r.mode = 'travel';
  }

  function canReach(r, book, spot, clock) {
    var p = r.cfg.planner;
    var out = RZ.legSeconds(r, here(r), spot);
    if (!out) return false;
    var back = RZ.nearestSafe(r, book, spot);
    if (!back) return false;
    return out.seconds + back.seconds + p.buffer <= RZ.timeLeft(book, clock.seconds, r);
  }

  // What Zero said, and what the ranger does about it. They hear it, they weigh it, and they may
  // well say no. Everything here works from the ranger's own map and the journal.
  function hearRadio(r, book, percept, act, clock, place) {
    percept.radio.forEach(function (call) {
      var type = call.type;
      if (type === 'ask') {
        act.reply(RZ.answer(r, book, clock, call.topic));
        return;
      }
      if (type === 'hold' || type === 'release') {
        if (type === 'hold') act.say('hold_land');
        else act.say('release_land');
        return;
      }
      if (type === 'board') {
        // New orders from home. Whatever this trip was for may not be on the board any more.
        act.say('board_new');
        r.achieved = null;
        if (place || (r.plan && r.plan.kind !== 'errand' && r.plan.kind !== 'recover')) {
          r.plan = null;
          r.path = null;
        }
        return;
      }
      var heed = RZ.willHeed(r, book, type);
      if (type === 'turnback') {
        if (place) { act.say('turnback_inside'); return; }
        if (!heed) { act.say('no_turnback'); return; }
        act.say('ack_turnback');
        book.zero.turnback = { seconds: clock.seconds, first: r.first };
        r.orderedOn = false;
        r.plan = null;
        r.grab = null;
        var shelter = RZ.nearestSafe(r, book, here(r));
        if (shelter) {
          r.mode = 'shelter';
          r.sheltering = 'zero';
          setPath(r, shelter.place);
        }
      } else if (type === 'pushon') {
        if (!r.plan || !r.plan.attempt || r.plan.at !== 0) { act.say('pushon_nothing'); return; }
        if (!heed) { act.say('no_pushon'); return; }
        act.say('ack_pushon');
        r.plan.ordered = true;
        r.orderedOn = true;
      } else if (type === 'warn') {
        r.map.warnings.push({ x: call.x, y: call.y, heeded: heed });
        act.say(heed ? 'ack_warn' : 'no_warn');
        if (heed) r.map.dangerDirty = true;
      } else if (type === 'send') {
        if (!heed) { act.say('no_send'); return; }
        if (place) {
          r.errand = { x: call.x, y: call.y };
          r.plan = null;
          act.say('ack_send');
        } else if (canReach(r, book, call, clock)) {
          act.say('ack_send');
          detour(r, call, false);
        } else {
          act.say('no_time');
        }
      } else if (type === 'crate') {
        if (call.stash) {
          var stash = book.stashes[call.stash] || RZ.emptyPack();
          var goods = r.cfg.radio.crate;
          RZ.GOODS.forEach(function (kind) { stash[kind] += goods[kind] || 0; });
          book.stashes[call.stash] = stash;
          act.say('crate_stash');
          return;
        }
        r.map.items[call.x + call.y * r.map.w] = { x: call.x, y: call.y, kind: 'crate', qty: 1, weapon: null };
        if (heed && place) {
          r.errand = { x: call.x, y: call.y, crate: true };
          r.plan = null;
          act.say('ack_crate');
        } else if (heed && canReach(r, book, call, clock)) {
          act.say('ack_crate');
          detour(r, call, true);
        } else {
          act.say('crate_later');
        }
      }
    });
  }

  // Idle talk. Nothing here changes what the ranger does.
  function thinkAloud(r, book, percept, act, clock, place) {
    var c = r.cfg.voice;
    var perSecond = r.cfg.sim.ticksPerSecond;
    book.graves.forEach(function (grave) {
      if (r.gravesSeen[grave.no] || distance(grave, r) > c.graveRange) return;
      r.gravesSeen[grave.no] = true;
      act.say('grave', { name: grave.first });
    });
    if (clock.tick < r.nextThought) return;
    if (place) {
      r.nextThought = clock.tick + Math.round(c.museEvery * perSecond);
      act.say(percept.tide ? 'muse_tide' : 'muse');
      return;
    }
    if (r.mode !== 'travel' || percept.enemies.length) return;
    r.nextThought = clock.tick + Math.round(c.walkEvery * perSecond);
    var key = 'walk';
    if (r.freshGround > 40 && clock.tick % 2 === 0) key = 'walk_new';
    else if (percept.underfoot === 'forest') key = 'walk_forest';
    else if (percept.underfoot === 'water') key = 'walk_water';
    r.freshGround = 0;
    act.say(key);
  }

  function setPath(r, target) {
    var map = r.map;
    var path = RZ.findPath(map.w, map.h, map.route, r.x + r.y * map.w, target.x + target.y * map.w);
    r.path = path ? path.cells : null;
    r.pathAt = 0;
    r.pathSuspect = false;
    return !!path;
  }

  function pathStillGood(r) {
    if (!r.path) return false;
    if (!r.pathSuspect) return true;
    for (var i = r.pathAt; i < r.path.length && i < r.pathAt + 16; i++) {
      if (r.map.route[r.path[i]] === Infinity) return false;
    }
    return false; // dangers changed: take a fresh route
  }

  // Roughly how badly a fight would go, using what a ranger knows about their own gun and scavengers.
  // Grenades count as one enemy each taken out of the fight, but there's always one left to shoot.
  function fightLooksGood(r, enemies) {
    var cfg = r.cfg;
    if (!r.weapon) return false;
    var name = RZ.pickWeapon(cfg, r.pack.weapons, enemies[0].distance, r.pack.ammo) || r.weapon;
    var gun = cfg.items.weapons[name];
    var burst = gun.burst || 1;
    var s = cfg.scav;
    var perPull = burst * gun.hit * (1 - gun.falloff * 0.5) * (gun.damageMin + gun.damageMax) / 2;
    var pullsEach = Math.ceil(s.hp / perPull);
    var count = Math.max(1, enemies.length - r.pack.grenade);
    var rounds = pullsEach * burst * count;
    if (r.pack.ammo < rounds) return false;
    var incoming = s.hit * (1 - s.falloff * 0.5) * (s.damageMin + s.damageMax) / 2 / s.reload;
    var killTime = pullsEach * gun.reload;
    var damage = 0;
    for (var n = 1; n <= count; n++) damage += n * incoming * killTime;
    return damage < (r.hp + r.pack.med * r.medHeal) * cfg.planner.fightNerve * r.temper.fightNerve;
  }

  // Runs for cover: away from the enemies, preferring broken ground if the map shows any.
  function flee(r, enemies, act) {
    var map = r.map;
    act.say('flee');
    var best = null;
    var bestScore = -Infinity;
    var radius = r.cfg.planner.fleeDistance;
    for (var k = 0; k < 16; k++) {
      var angle = (k / 16) * Math.PI * 2;
      var x = Math.round(r.x + Math.cos(angle) * radius);
      var y = Math.round(r.y + Math.sin(angle) * radius);
      if (x < 1 || y < 1 || x >= map.w - 1 || y >= map.h - 1) continue;
      var i = x + y * map.w;
      if (map.cost[i] === Infinity) continue;
      var score = 0;
      for (var e = 0; e < enemies.length; e++) score += distance({ x: x, y: y }, enemies[e]);
      score -= map.cost[i];
      if (score > bestScore) { bestScore = score; best = { x: x, y: y }; }
    }
    if (!best) return false;
    r.mode = 'flee';
    r.fleeUntil = r.clock.tick + r.cfg.planner.fleeTicks;
    return setPath(r, best);
  }

  // Picks the visible enemy whose blast would catch the most of them, out of the thrower's own reach.
  function grenadeTarget(r, enemies) {
    var g = r.cfg.items.grenade;
    var best = null;
    enemies.forEach(function (enemy) {
      if (enemy.distance > g.range || enemy.distance < g.minRange) return;
      var caught = 0;
      enemies.forEach(function (other) { if (distance(enemy, other) <= g.radius) caught++; });
      if (!best || caught > best.caught) best = { x: enemy.x, y: enemy.y, caught: caught };
    });
    return best;
  }

  // A grenade goes at a group, at anyone at all when the fight is going badly, and at anyone when
  // there are plenty more in the pack.
  function tryGrenade(r, enemies, act, desperate) {
    if (!r.pack.grenade || r.cool > 0) return false;
    var g = r.cfg.items.grenade;
    var spot = grenadeTarget(r, enemies);
    if (!spot || (spot.caught < g.minTargets && !desperate && r.pack.grenade < g.plenty)) return false;
    act.say('grenade'); // shouted before it lands, and the target was checked above
    return act.throwGrenade(spot.x, spot.y);
  }

  // Fires at the nearest target in range without breaking stride.
  function shootOnTheRun(r, enemies, act) {
    if (!enemies.length || !r.weapon) return;
    if (tryGrenade(r, enemies, act, false)) return;
    if (enemies[0].distance <= RZ.gunReach(r.cfg, r.pack.weapons)) act.shoot(enemies[0].id);
  }

  // Running from a camp twice on the same trip means there's no way around it. Time to run through.
  function runGauntlet(r, book, clock) {
    if (!r.plan || !r.plan.attempt) return false;
    if (r.plan.dash) return true;
    r.plan.fled = (r.plan.fled || 0) + 1;
    if (r.plan.fled <= r.cfg.planner.fleesBeforeDash) return false;
    r.plan.dash = true;
    RZ.writeEntry(book, clock, 'note', RZ.lead(r) + 'No way around them. Running for ' + book.mission.name + ' and shooting as I go.');
    r.dashing = true;
    return true;
  }

  // Returns true if the enemies took over this moment.
  function handleEnemies(r, book, percept, act, clock) {
    var enemies = percept.enemies;
    if (r.mode === 'flee' && clock.tick < r.fleeUntil) return true;
    if (!enemies.length) {
      if (r.mode === 'flee' || r.mode === 'fight') {
        r.mode = 'travel';
        r.path = null;
      }
      return false;
    }
    for (var o = 0; o < enemies.length; o++) {
      if (enemies[o].old && enemies[o].distance <= r.cfg.voice.chaseRange) {
        act.say('old_chase', { name: enemies[o].first });
        break;
      }
    }
    if (r.mode === 'shelter' || r.mode === 'climb' || (r.plan && r.plan.dash)) {
      shootOnTheRun(r, enemies, act); // the tide or the gauntlet comes first
      return false;
    }
    if (!fightLooksGood(r, enemies)) {
      if (tryGrenade(r, enemies, act, true)) return true;
      if (r.mode !== 'flee') {
        if (runGauntlet(r, book, clock)) {
          act.say('dash');
          shootOnTheRun(r, enemies, act);
          r.mode = 'travel';
          r.path = null;
          return false;
        }
      }
      return flee(r, enemies, act);
    }
    var target = enemies[0];
    // A ranger with a job doesn't go looking for a fight. They keep walking until it comes to them.
    if (target.distance > RZ.gunReach(r.cfg, r.pack.weapons)) {
      if (r.mode === 'fight') {
        r.mode = 'travel';
        r.path = null;
      }
      return false;
    }
    if (r.mode !== 'fight') act.say('contact');
    else if (enemies.length > 1 || r.hp < r.cfg.ranger.hpMax * 0.5) act.say('pinned');
    r.mode = 'fight';
    r.path = null;
    if (!tryGrenade(r, enemies, act, false)) act.shoot(target.id);
    return true;
  }

  function goHighGround(r) {
    var map = r.map;
    var best = null;
    var height = map.elev[r.x + r.y * map.w];
    for (var dy = -12; dy <= 12; dy += 2) {
      for (var dx = -12; dx <= 12; dx += 2) {
        var x = r.x + dx;
        var y = r.y + dy;
        if (x < 0 || y < 0 || x >= map.w || y >= map.h) continue;
        var i = x + y * map.w;
        if (map.cost[i] === Infinity) continue;
        if (map.elev[i] > height) { height = map.elev[i]; best = { x: x, y: y }; }
      }
    }
    if (best) setPath(r, best);
  }

  // The gamble. With the site this close, a ranger may ignore the clock and go for it. Every
  // turn-back makes the next ranger bolder, and every tide death makes them less so.
  function pushingOn(r, book, clock, act) {
    if (!r.plan || !r.plan.attempt || r.plan.at !== 0) return false;
    if (r.plan.ordered) return true;
    var p = r.cfg.planner;
    var toSite = RZ.legSeconds(r, here(r), book.mission);
    var reach = Math.min(p.pushMax, p.pushSeconds * book.lessons.nerve * r.temper.pushSeconds);
    if (!toSite || toSite.seconds > reach) return false;
    if (!r.plan.pushed) {
      r.plan.pushed = true;
      act.say('push_on');
      RZ.writeEntry(book, clock, 'note', RZ.lead(r) + 'Should be turning back. ' + book.mission.name +
        ' is right there, so I\'m pushing on.');
    }
    return true;
  }

  // Decides whether it's time to stop everything and get to shelter.
  function handleTide(r, book, percept, clock, act) {
    var p = r.cfg.planner;
    var incoming = percept.tide && percept.tide.distance <= (r.lastTideDistance === undefined ? 99 : r.lastTideDistance);
    r.lastTideDistance = percept.tide ? percept.tide.distance : undefined;
    if (clock.tick < r.nextShelterCheck && !incoming) return !!r.sheltering;
    r.nextShelterCheck = clock.tick + p.shelterCheckTicks;

    var shelter = RZ.nearestSafe(r, book, here(r));
    if (!shelter) return false;
    var left = RZ.timeLeft(book, clock.seconds, r);
    var mustGo = left < shelter.seconds * (1 + p.routeSlack) + p.buffer;
    // Walking home with time in hand isn't running for it, and there's time to pick things up.
    // Zero calling them in is running for it.
    if (!mustGo && !incoming && r.mode !== 'climb' && r.sheltering !== 'zero') {
      r.sheltering = false;
      return false;
    }
    r.sheltering = r.sheltering === 'zero' ? 'zero' : true;
    r.grab = null;
    if (!incoming && pushingOn(r, book, clock, act)) return false;
    if (r.plan && r.plan.ordered && percept.tide && percept.tide.distance > p.climbWhenTideWithin) return false;
    if (percept.tide && percept.tide.distance < 10) act.say('tide_close');

    if (r.mode !== 'shelter' && r.mode !== 'climb' && r.plan && r.plan.attempt && r.plan.at === 0) {
      var c = r.cfg.lessons;
      book.lessons.nerve = Math.min(c.nerveMax, book.lessons.nerve + c.nerveStep);
      book.lessons.tideMargin = Math.max(c.tideMarginStart, book.lessons.tideMargin - c.tideMarginEase);
      book.mission.turnbacks = (book.mission.turnbacks || 0) + 1;
      RZ.writeEntry(book, clock, 'note', RZ.lead(r) + 'Turning back with ' + book.mission.name +
        ' still ' + Math.round(distance(r, book.mission)) + ' cells off. The tide won\'t wait.');
      act.say('turn_back');
    }

    // Already in it: every second there burns, and higher ground that's flooded is no help. Run for shelter.
    var inIt = percept.tide && percept.tide.distance < 1;
    if (!inIt && percept.tide && percept.tide.distance < p.climbWhenTideWithin && shelter.seconds > p.climbWhenShelterBeyond) {
      if (r.mode !== 'climb') act.say('climb');
      r.mode = 'climb';
      r.plan = null;
      goHighGround(r);
      return true;
    }
    r.mode = 'shelter';
    r.plan = null;
    setPath(r, shelter.place);
    return true;
  }

  // Rounds a ranger won't leave behind to make room: all of them on the way out to an attempt.
  function keepRounds(r) {
    return r.plan && r.plan.attempt && r.plan.at === 0 ? Infinity : r.cfg.planner.keepRounds;
  }

  // A full pack still has room for something better: loot and spare rounds can be left behind.
  function worthGrabbing(r, item) {
    var cfg = r.cfg;
    var pack = r.pack;
    var spare = r.capacity - RZ.packWeight(cfg, pack);
    if (item.kind === 'crate' || item.kind === 'relic') return true;
    var room = spare + RZ.roomToMake(cfg, pack, keepRounds(r));
    if (item.kind === 'weapon') {
      var gun = cfg.items.weapons[item.weapon];
      // The spare slot takes anything but a pistol, to leave at the next safe house.
      if (!r.spare && item.weapon !== 'pistol') return true;
      if (pack.weapons.indexOf(item.weapon) >= 0) return false;
      if (RZ.spareGuns(cfg, pack.weapons.concat([item.weapon])).indexOf(item.weapon) >= 0) return false;
      // A gun no better than one carried is only worth room that's free already.
      var better = !r.weapon || gun.rank > cfg.items.weapons[r.weapon].rank;
      return gun.weight <= (better ? room : spare);
    }
    return cfg.items.weights[item.kind] <= (RZ.MAKES_ROOM[item.kind] ? room : spare);
  }

  // Whether a detour to a spot still gets the ranger to shelter in time, by the journal.
  // Measured pessimistically, as if every cell were unknown ground, both ways.
  function detourFits(r, book, clock, spot, shelter) {
    var p = r.cfg.planner;
    if (!shelter) return false;
    var out = distance(spot, r) * r.cfg.ranger.unknownCost / r.speed;
    var left = RZ.timeLeft(book, clock.seconds, r);
    return out * 2 + shelter.seconds * (1 + p.routeSlack) + p.buffer * r.temper.grabTime <= left;
  }

  // How a ranger names a gun out loud.
  var GUN_WORDS = { pistol: 'pistol', rifle: 'rifle', shotgun: 'shotgun', mp5: 'submachine gun' };

  function handleItems(r, percept, act, clock, book) {
    var p = r.cfg.planner;
    if (r.grab) {
      if (distance(r, r.grab) <= (r.grab.body ? 1 : 0)) {
        if (r.grab.body) {
          var name = r.grab.first;
          if (act.recoverBody()) {
            act.say('body_found', { name: name });
            RZ.writeEntry(book, clock, 'note', RZ.lead(r) + 'Found what was left of ' + name + '. Took the gear on.');
          }
          book.body = null;
        } else {
          var taken = act.pickUp(keepRounds(r));
          if (taken.length) {
            var gunFound = GUN_WORDS[taken[0]] || GUN_WORDS[taken[0].replace(/^a spare /, '')];
            if (gunFound && r.pack.ammo === 0) act.say('found_gun_dry', { what: gunFound });
            else if (taken[0] === 'rifle') act.say('found_rifle');
            else if (taken[0] === 'shotgun') act.say('found_shotgun');
            else if (taken[0] === 'mp5') act.say('found_mp5');
            else if (/^a spare /.test(taken[0])) act.say('found_spare', { what: taken[0].slice(8) });
            else if (/grenade/.test(taken[0])) act.say('found_grenade', { what: taken[0] });
            else if (taken[0] === 'relic') noteRelic(r, book, act, clock);
            else if (taken[0] === 'a crate') {
              act.say('crate_got');
              RZ.judgeZero(book, r.cfg, clock, true, 2, null);
            } else act.say('found', { what: taken[0] });
          }
        }
        act.equipBest();
        r.grab = null;
        r.path = null;
        return false;
      }
      if (!r.path) setPath(r, r.grab);
      return true;
    }
    if (!percept.items.length && !percept.bodies.length) return false;
    var shelter = RZ.nearestSafe(r, book, here(r));
    for (var b = 0; b < percept.bodies.length; b++) {
      var body = percept.bodies[b];
      if (r.leftBodies[body.no] || distance(body, r) > p.bodyRange) continue;
      if (!detourFits(r, book, clock, body, shelter)) continue;
      r.leftBodies[body.no] = true;
      r.grab = { x: body.x, y: body.y, body: true, first: body.first };
      return setPath(r, r.grab);
    }
    var best = null;
    var reach = p.grabRange * r.temper.grabRange;
    var nearest = Infinity;
    percept.items.forEach(function (item) {
      var d = distance(item, r);
      // A gun is worth going further for.
      if (d > reach * (item.kind === 'weapon' ? p.gunGrabReach : 1) || d >= nearest) return;
      if (!worthGrabbing(r, item)) return;
      nearest = d;
      best = item;
    });
    if (!best || !detourFits(r, book, clock, best, shelter)) return false;
    r.grab = { x: best.x, y: best.y };
    return setPath(r, r.grab);
  }

  function arrived(r, step) {
    return distance(step, r) <= step.near;
  }

  var DEEDS = { survey: 'surveyed ', clear: 'broke the camp at ', retrieve: 'brought home ', stock: 'stocked ' };

  function doneText(o) {
    if (o.type === 'clear') return 'The camp at ' + o.name + ' is broken, and I\'m home safe.';
    if (o.type === 'retrieve') return 'Brought ' + o.name + ' home.';
    if (o.type === 'stock') return o.name + ' holds what the board asked for.';
    return o.name + ' surveyed and home safe.';
  }

  // An objective is finished: the journal ticks it off and home posts the reward.
  RZ.completeObjective = function (r, book, act, clock, o) {
    r.achieved = null;
    if (!o || o.done) return false;
    var spent = clock.tick - (o.startTick === undefined ? clock.tick : o.startTick);
    var tries = o.type === 'stock' ? (o.attempts === 1 ? ' load' : ' loads') : (o.attempts === 1 ? ' attempt' : ' attempts');
    RZ.writeEntry(book, clock, 'triumph', RZ.lead(r) + doneText(o) + ' It took ' + Math.max(1, o.attempts) + tries +
      ' and ' + RZ.tideSpan(r.cfg, spent) + '.');
    act.say('triumph', { site: o.name });
    act.deed(DEEDS[o.type] + o.name);
    act.missionDone(o.id);
    if (r.orderedOn) {
      RZ.judgeZero(book, r.cfg, clock, true, r.cfg.radio.trustPushWin, 'Zero told ' + r.first + ' to push on, and ' + r.first + ' came back with it. Zero was right.');
      r.orderedOn = false;
    }
    return true;
  };

  // The hard part is done. The journal's checklist ticks it straight away.
  function reached(o) {
    o.reached = true;
    o.checks.forEach(function (check) { if (check.step === 'reach') check.done = true; });
  }

  function noteRelic(r, book, act, clock) {
    var o = null;
    book.objectives.forEach(function (objective) { if (objective.type === 'retrieve' && !objective.done) o = objective; });
    if (!o || o.reached) return;
    reached(o);
    act.say('relic_got', { site: o.name });
    RZ.writeEntry(book, clock, 'note', RZ.lead(r) + 'Got ' + o.name + '. Now it has to come home in one piece.');
  }

  function followPlan(r, book, place, act, clock) {
    for (var guard = 0; guard < 6; guard++) {
      if (!r.plan) {
        if (!place) {
          if (r.mode === 'shelter' && pathStillGood(r)) return;
          var shelter = RZ.nearestSafe(r, book, here(r));
          if (!shelter) return;
          r.mode = 'shelter';
          setPath(r, shelter.place);
          return;
        }
        r.mode = 'plan';
        r.plan = RZ.makePlan(r, book, place, act, clock);
        r.path = null;
      }
      var step = r.plan.steps[r.plan.at];
      if (!step) {
        r.plan = null;
        if (!place) return;
        continue;
      }
      if (step.do === 'wait') {
        r.mode = 'wait';
        if (clock.tick < step.until) return;
        r.plan = null;
        continue;
      }
      if (step.do === 'linger') {
        if (step.until === undefined) step.until = clock.tick + step.ticks;
        if (clock.tick >= step.until) r.plan.at++;
        else return;
        continue;
      }
      if (step.do === 'survey') {
        if (act.survey(book.mission.id)) {
          r.achieved = book.mission.id;
          reached(book.mission);
          act.say('reached');
          RZ.writeEntry(book, clock, 'note', RZ.lead(r) + 'Reached ' + book.mission.name + '. Now to get back with it.');
        }
        r.plan.at++;
        continue;
      }
      if (step.do === 'clear') {
        // Nobody in sight after a sweep of the huts. Is it really over?
        if (act.clearCamp(book.mission.id)) {
          r.achieved = book.mission.id;
          reached(book.mission);
          act.say('cleared', { site: book.mission.name });
          RZ.writeEntry(book, clock, 'note', RZ.lead(r) + 'Nobody left standing at ' + book.mission.name + '. Now home to say so.');
        } else {
          act.say('not_cleared', { site: book.mission.name });
          RZ.writeEntry(book, clock, 'note', RZ.lead(r) + 'Still someone at ' + book.mission.name + ' I can\'t find. It isn\'t finished.');
        }
        r.plan.at++;
        continue;
      }
      if (step.do === 'take') {
        act.pickUp();
        act.equipBest();
        if (r.pack.relic > 0) noteRelic(r, book, act, clock);
        else {
          act.say('relic_missing', { site: book.mission.name });
          RZ.writeEntry(book, clock, 'note', RZ.lead(r) + 'The board says ' + book.mission.name + ' is here. It isn\'t.');
        }
        r.plan.at++;
        continue;
      }
      if (step.do === 'recover') {
        var gained = act.recoverBody();
        if (gained) {
          act.say('body_found', { name: book.body.first });
          RZ.writeEntry(book, clock, 'note', RZ.lead(r) + 'Found ' + book.body.first + '. Took what the body still had.');
        }
        book.body = null;
        r.plan.at++;
        continue;
      }
      if (step.do === 'look') {
        // Zero sent them here. Was it worth the walk?
        var seen = r.percept.items.concat(r.percept.bodies, r.percept.enemies).some(function (thing) {
          return distance(thing, step) <= r.cfg.radio.lookRadius;
        });
        RZ.judgeZero(book, r.cfg, clock, seen, seen ? r.cfg.radio.trustRight : r.cfg.radio.trustWrong,
          seen ? 'Zero sent ' + r.first + ' somewhere, and there was something to find.' : 'Zero sent ' + r.first + ' somewhere. Nothing to find.');
        act.say(seen ? 'right' : 'wrong');
        r.plan.at++;
        continue;
      }
      if (step.do === 'open') {
        var got = act.pickUp();
        act.equipBest();
        if (got.length) {
          act.say('crate_got');
          RZ.judgeZero(book, r.cfg, clock, true, 2, null);
        }
        r.plan.at++;
        continue;
      }
      if (step.do === 'stash') {
        ['food', 'ammo', 'med'].forEach(function (kind) {
          var amount = Math.min(step.goods[kind], r.pack[kind]);
          if (amount > 0) act.put(kind, amount);
        });
        act.leaveSidearm();
        act.carried(step.goods.ammo);
        r.plan.at++;
        continue;
      }
      // step.do === 'go'
      r.mode = 'travel';
      if (arrived(r, step)) {
        r.path = null;
        r.plan.at++;
        continue;
      }
      if (!pathStillGood(r) && !setPath(r, step)) r.plan = null;
      return;
    }
  }

  RZ.think = function (r, book, percept, act, clock) {
    r.book = book;
    r.clock = clock;
    r.percept = percept;
    refreshRoutes(r);
    remember(r, book, percept, clock, act);
    refreshRoutes(r);
    var place = RZ.safeHere(r, book);
    hearRadio(r, book, percept, act, clock, place);
    refreshRoutes(r);
    upkeep(r, act, place);
    thinkAloud(r, book, percept, act, clock, place);

    if (place) {
      arriveSafe(r, book, place, act, percept, clock);
      survivedTide(r, book, place, clock);
      var leftGun = act.stashSpare();
      if (leftGun) {
        act.say('spare_left', { what: leftGun, place: place.name });
        RZ.writeEntry(book, clock, 'note', RZ.lead(r) + 'Left a ' + leftGun + ' at ' + place.name + ' for whoever comes through.');
      }
      if (act.stashHere()) book.stashes[place.id] = act.stashHere();
      if (r.achieved) RZ.completeObjective(r, book, act, clock, RZ.bookObjective(book, r.achieved));
      r.sheltering = false;
      if (r.mode === 'shelter' || r.mode === 'climb') {
        r.mode = 'plan';
        r.path = null;
      }
    } else {
      if (handleEnemies(r, book, percept, act, clock)) return;
      if (handleTide(r, book, percept, clock, act)) return;
      if (handleItems(r, percept, act, clock, book)) return;
    }
    followPlan(r, book, place, act, clock);
    if (place) {
      var stash = act.stashHere();
      if (stash) book.stashes[place.id] = stash;
    }
  };
})();
