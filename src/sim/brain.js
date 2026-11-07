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
      camp = { x: enemy.x, y: enemy.y, name: name, spotted: 0, beatUs: 0, lowAmmo: 0 };
      map.camps.push(camp);
      map.dangerDirty = true;
      RZ.writeEntry(r.book, r.clock, 'note', RZ.lead(r) + 'Scavengers camped at ' + name + '.');
      act.say('camp_seen', { place: name });
    }
    camp.spotted++;
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
          tide.window += (sample - tide.window) * (sample < tide.window ? 0.6 : 0.2);
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
    if (r.energy < c.eatBelow) {
      if (act.eat()) act.say('eat');
      else if (place) act.eatFromStash();
      else if (r.energy < c.eatBelow * 0.6) act.say('hungry');
    }
    if (r.hp < c.healBelow) {
      if (act.heal()) act.say('heal');
      else if (place) act.healFromStash();
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
    if (r.lastSafe !== null || close) act.say(close ? 'safe_close' : 'safe');
    r.lastSafe = place.id;
    act.usedSafeHouse(place.id);
    RZ.commitMap(book, r);
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
          setPath(r, shelter.place);
        }
      } else if (type === 'pushon') {
        if (!r.plan || r.plan.kind !== 'survey' || r.plan.at !== 0) { act.say('pushon_nothing'); return; }
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

  // A grenade goes at a group, or at anyone at all when the fight is going badly.
  function tryGrenade(r, enemies, act, desperate) {
    if (!r.pack.grenade || r.cool > 0) return false;
    var spot = grenadeTarget(r, enemies);
    if (!spot || (spot.caught < r.cfg.items.grenade.minTargets && !desperate)) return false;
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
    if (!r.plan || r.plan.kind !== 'survey') return false;
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
    if (!r.plan || r.plan.kind !== 'survey' || r.plan.at !== 0) return false;
    if (r.plan.ordered) return true;
    var p = r.cfg.planner;
    var toSite = RZ.legSeconds(r, here(r), book.mission);
    if (!toSite || toSite.seconds > p.pushSeconds * book.lessons.nerve * r.temper.pushSeconds) return false;
    if (!r.plan.pushed) {
      r.plan.pushed = true;
      act.say('push_on');
      RZ.writeEntry(book, clock, 'note', RZ.lead(r) + 'Should be turning back. ' + book.mission.name +
        ' is right there, so I\'m pushing on.');
    }
    return true;
  }

  // Decides whether it's time to stop everything and get under gold.
  function handleTide(r, book, percept, clock, act) {
    var p = r.cfg.planner;
    var incoming = percept.tide && percept.tide.distance <= (r.lastTideDistance === undefined ? 99 : r.lastTideDistance);
    r.lastTideDistance = percept.tide ? percept.tide.distance : undefined;
    if (clock.tick < r.nextShelterCheck && !incoming) return r.mode === 'shelter' || r.mode === 'climb';
    r.nextShelterCheck = clock.tick + p.shelterCheckTicks;

    var shelter = RZ.nearestSafe(r, book, here(r));
    if (!shelter) return false;
    var left = RZ.timeLeft(book, clock.seconds, r);
    var mustGo = left < shelter.seconds * (1 + p.routeSlack) + p.buffer;
    if (r.mode !== 'shelter' && r.mode !== 'climb' && !mustGo && !incoming) return false;
    if (!incoming && pushingOn(r, book, clock, act)) return false;
    if (r.plan && r.plan.ordered && percept.tide && percept.tide.distance > p.climbWhenTideWithin) return false;
    if (percept.tide && percept.tide.distance < 10) act.say('tide_close');

    if (r.mode !== 'shelter' && r.mode !== 'climb' && r.plan && r.plan.kind === 'survey' && r.plan.at === 0) {
      var c = r.cfg.lessons;
      book.lessons.nerve = Math.min(c.nerveMax, book.lessons.nerve + c.nerveStep);
      book.lessons.tideMargin = Math.max(c.tideMarginStart, book.lessons.tideMargin - c.tideMarginEase);
      RZ.writeEntry(book, clock, 'note', RZ.lead(r) + 'Turning back with ' + book.mission.name +
        ' still ' + Math.round(distance(r, book.mission)) + ' cells off. The tide won\'t wait.');
      act.say('turn_back');
    }

    if (percept.tide && percept.tide.distance < p.climbWhenTideWithin && shelter.seconds > p.climbWhenShelterBeyond) {
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

  function worthGrabbing(r, item) {
    var cfg = r.cfg;
    var pack = r.pack;
    var spare = r.capacity - RZ.packWeight(cfg, pack);
    if (item.kind === 'crate') return true;
    if (item.kind === 'weapon') {
      return pack.weapons.indexOf(item.weapon) < 0 && cfg.items.weapons[item.weapon].weight <= spare;
    }
    return cfg.items.weights[item.kind] <= spare;
  }

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
          var taken = act.pickUp();
          if (taken.length) {
            if (taken[0] === 'rifle') act.say('found_rifle');
            else if (taken[0] === 'shotgun') act.say('found_shotgun');
            else if (taken[0] === 'mp5') act.say('found_mp5');
            else if (/grenade/.test(taken[0])) act.say('found_grenade', { what: taken[0] });
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
    if (RZ.timeLeft(book, clock.seconds, r) < p.grabMinimumTime * r.temper.grabTime) return false;
    for (var b = 0; b < percept.bodies.length; b++) {
      var body = percept.bodies[b];
      if (r.leftBodies[body.no] || distance(body, r) > p.bodyRange) continue;
      r.leftBodies[body.no] = true;
      r.grab = { x: body.x, y: body.y, body: true, first: body.first };
      return setPath(r, r.grab);
    }
    var best = null;
    var near = p.grabRange * r.temper.grabRange;
    percept.items.forEach(function (item) {
      var d = distance(item, r);
      if (d <= near && worthGrabbing(r, item)) {
        near = d;
        best = item;
      }
    });
    if (!best) return false;
    r.grab = { x: best.x, y: best.y };
    return setPath(r, r.grab);
  }

  function arrived(r, step) {
    return distance(step, r) <= step.near;
  }

  function finishSurvey(r, book, act, clock) {
    var mission = book.mission;
    var spent = clock.tick - mission.startTick;
    act.say('triumph', { site: mission.name });
    act.deed('surveyed ' + mission.name);
    act.missionDone();
    RZ.writeEntry(book, clock, 'triumph', RZ.lead(r) + mission.name + ' surveyed and home safe. It took ' +
      mission.attempts + (mission.attempts === 1 ? ' attempt' : ' attempts') + ' and ' + RZ.tideSpan(r.cfg, spent) + '.');
    if (r.orderedOn) {
      RZ.judgeZero(book, r.cfg, clock, true, r.cfg.radio.trustPushWin, 'Zero told ' + r.first + ' to push on, and ' + r.first + ' came back with it. Zero was right.');
      r.orderedOn = false;
    }
    act.nextMission();
    r.surveyed = null;
  }

  function followPlan(r, book, place, act, clock) {
    for (var guard = 0; guard < 6; guard++) {
      if (!r.plan) {
        if (!place) {
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
        if (act.survey()) {
          r.surveyed = book.mission.id;
          act.say('reached');
          RZ.writeEntry(book, clock, 'note', RZ.lead(r) + 'Reached ' + book.mission.name + '. Now to get back with it.');
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
      if (act.stashHere()) book.stashes[place.id] = act.stashHere();
      if (r.surveyed) finishSurvey(r, book, act, clock);
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
