// The one big plan a ranger makes at each safe house: mission, route, loadout and what to stash.
//
// Inputs are the ranger, the journal and `act`. There's no reference to the sim or the real map here,
// and that's deliberate: times come from the ranger's own map, stocks from the journal's ledger.

var RZ = RZ || {};

(function () {
  function cellOf(place, w) {
    return place.x + place.y * w;
  }

  function walkSeconds(r, cells, startCell) {
    var map = r.map;
    var w = map.w;
    var total = 0;
    var previous = startCell;
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      var diagonal = cell - previous !== 1 && cell - previous !== -1 && cell - previous !== w && cell - previous !== -w;
      total += map.cost[cell] * (diagonal ? 1.414 : 1);
      previous = cell;
    }
    return total / r.speed * (r.careful ? 1 / r.cfg.anomaly.carefulSpeed : 1);
  }

  // Walking time between two points on the ranger's map, or null if they know of no way.
  // Answers are kept until the map changes, because plans ask the same questions over and over.
  RZ.legSeconds = function (r, from, to) {
    var map = r.map;
    var start = cellOf(from, map.w);
    var goal = cellOf(to, map.w);
    if (map.legsVersion !== map.version) {
      map.legs = {};
      map.legsVersion = map.version;
    }
    var key = start * (map.w * map.h) + goal;
    if (key in map.legs) return map.legs[key];
    var path = RZ.findPath(map.w, map.h, map.route, start, goal);
    var leg = path ? { seconds: walkSeconds(r, path.cells, start) } : null;
    map.legs[key] = leg;
    return leg;
  };

  // Seconds before a ranger should be under gold, by the journal's estimate of the tide.
  RZ.timeLeft = function (book, seconds, r) {
    var t = book.tide;
    if (t.active) return 0;
    var margin = Math.max(0, book.lessons.tideMargin + (r ? r.temper.tideMargin : 0));
    return t.lastClear + t.window * (1 - margin) - seconds;
  };

  RZ.nearestSafe = function (r, book, from) {
    var best = null;
    for (var i = 0; i < book.places.length; i++) {
      var leg = RZ.legSeconds(r, from, book.places[i]);
      if (leg && (!best || leg.seconds < best.seconds)) {
        best = { place: book.places[i], seconds: leg.seconds };
      }
    }
    return best;
  };

  // The safe house closest to the mission, by walking time. Once one has been chosen it stays
  // chosen unless another is clearly better, or supplies end up scattered across every outpost.
  function stagingPost(r, book) {
    var best = null;
    var current = null;
    for (var i = 0; i < book.places.length; i++) {
      var leg = RZ.legSeconds(r, book.places[i], book.mission);
      if (!leg) continue;
      var option = { place: book.places[i], seconds: leg.seconds };
      if (!best || option.seconds < best.seconds) best = option;
      if (option.place.id === book.mission.stagingId) current = option;
    }
    if (current && best.seconds > current.seconds * r.cfg.planner.stagingSwitch) best = current;
    if (best) book.mission.stagingId = best.place.id;
    return best;
  }

  // What the survey needs at the staging post, allowing for every lesson so far.
  function missionNeeds(r, book, staging) {
    var cfg = r.cfg;
    var p = cfg.planner;
    var lessons = book.lessons;
    var secondsPerFood = (cfg.items.foodEnergy / cfg.ranger.energyMax) * r.hungerSeconds;
    var tripFood = Math.ceil((staging.seconds * 2 + p.tripFoodSeconds) / secondsPerFood) + lessons.foodExtra;
    var campsOnMap = r.map.camps.filter(function (camp) { return camp.spotted >= 1; }).length;
    // Every failed attempt at this mission argues for going better prepared.
    var failed = book.mission.attempts;
    return {
      food: tripFood,
      // A stash also has to feed whoever waits there for the next window.
      stockFood: tripFood + Math.ceil(p.shelterSeconds / secondsPerFood),
      ammo: Math.min(p.ammoCap, Math.max(0, p.ammoBase + r.temper.ammo + lessons.ammoExtra + campsOnMap * p.ammoPerCamp + failed * p.ammoPerFailure)),
      med: Math.min(p.medCap, p.medBase + lessons.medExtra + Math.floor(failed / p.failuresPerMed))
    };
  }

  function ledger(book, place) {
    return book.stashes[place.id] || RZ.emptyPack();
  }

  function shortfall(need, have) {
    return {
      food: Math.max(0, need.food - have.food),
      ammo: Math.max(0, need.ammo - have.ammo),
      med: Math.max(0, need.med - have.med)
    };
  }

  function anyShort(short) {
    return short.food + short.ammo + short.med > 0;
  }

  // Near enough to the target that another trip home isn't worth a tide.
  function closeEnough(short, need, p, r) {
    return short.food === 0 && short.med <= p.medLeeway * r.temper.leeway && short.ammo <= need.ammo * p.ammoLeeway * r.temper.leeway;
  }

  function describeGoods(goods) {
    var parts = [];
    if (goods.food) parts.push(goods.food + ' food');
    if (goods.ammo) parts.push(goods.ammo + ' rounds');
    if (goods.med) parts.push(goods.med + (goods.med === 1 ? ' medkit' : ' medkits'));
    if (!parts.length) return 'nothing much';
    if (parts.length === 1) return parts[0];
    return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
  }

  // Takes goods from this stash, as far as the pack allows, up to the amounts given.
  function loadUp(r, act, wanted) {
    var taken = { food: 0, ammo: 0, med: 0 };
    ['med', 'food', 'ammo'].forEach(function (kind) {
      if (wanted[kind] > 0) taken[kind] = act.take(kind, wanted[kind]);
    });
    return taken;
  }

  function dropLoot(r, act) {
    if (r.pack.loot > 0) act.put('loot', r.pack.loot);
  }

  // A plan has an id for the journal, a list of steps and a line of intent.
  function makeSteps(kind, steps, note) {
    return { kind: kind, steps: steps, at: 0, note: note };
  }

  function waitPlan(clock, why) {
    return { kind: 'wait', steps: [{ do: 'wait', until: clock.tick + 20 }], at: 0, note: null, why: why };
  }

  function journalPlan(r, book, clock, plan, key, text) {
    var lead = RZ.lead(r);
    if (book.pendingLesson) {
      RZ.writeEntry(book, clock, 'lesson', lead + book.pendingLesson);
      book.pendingLesson = null;
    }
    if (book.lastPlanKey === r.no + ':' + key) return;
    book.lastPlanKey = r.no + ':' + key;
    if (text) RZ.writeEntry(book, clock, plan.kind === 'survey' ? 'plan-big' : 'plan', lead + text);
  }

  function tryRecoverBody(r, book, here, act, clock, left) {
    var body = book.body;
    if (!body) return null;
    var p = r.cfg.planner;
    if (body.worth < p.bodyWorth * (r.temperName === 'greedy' ? 0.5 : 1)) return null;
    var out = RZ.legSeconds(r, here, body);
    if (!out) return null;
    var back = RZ.nearestSafe(r, book, body);
    if (!back) return null;
    if (out.seconds + back.seconds + p.buffer > left) return null;
    var plan = makeSteps('recover', [
      { do: 'go', x: body.x, y: body.y, near: 0 },
      { do: 'recover' },
      { do: 'go', x: back.place.x, y: back.place.y, near: r.cfg.safe.radius - 1 }
    ]);
    journalPlan(r, book, clock, plan, 'recover' + body.no,
      body.first + ' went down near ' + body.nearName + '. Going for the gear before the tide does.');
    act.say('setout_recover', { name: body.first });
    return plan;
  }

  function surveyPlan(r, book, here, staging, act, clock, need) {
    var cfg = r.cfg;
    var mission = book.mission;
    var have = r.pack;
    loadUp(r, act, shortfall(need, have));
    act.takeBestWeapon();
    mission.attempts++;
    mission.lastTry = clock.tick;
    book.patience = Math.max(0, book.patience - r.cfg.planner.patienceSpent);
    var plan = makeSteps('survey', [
      { do: 'go', x: mission.x, y: mission.y, near: cfg.planner.surveyReach },
      { do: 'survey' },
      { do: 'go', x: here.x, y: here.y, near: cfg.safe.radius - 1 }
    ]);
    var lead = mission.attempts === 1 ? 'Setting out for ' : 'Attempt ' + mission.attempts + ' at ';
    act.say(mission.attempts === 1 ? 'setout_survey' : 'setout_again', { attempt: mission.attempts });
    var extra = RZ.attemptNote(book, r.map);
    journalPlan(r, book, clock, plan, 'survey' + mission.attempts,
      lead + mission.name + ' from ' + here.name + ' with ' + describeGoods(r.pack) + '.' + (extra ? ' ' + extra : ''));
    return plan;
  }

  function stockPlan(r, book, here, staging, act, clock, short) {
    var taken = loadUp(r, act, short);
    act.takeBestWeapon();
    var cargo = {
      food: taken.food, ammo: taken.ammo, med: taken.med
    };
    if (cargo.food + cargo.ammo + cargo.med === 0) return null;
    var plan = makeSteps('stock', [
      { do: 'go', x: staging.place.x, y: staging.place.y, near: r.cfg.safe.radius - 1 },
      { do: 'stash', goods: cargo }
    ]);
    journalPlan(r, book, clock, plan, 'stock' + staging.place.id + describeGoods(cargo),
      'Moving ' + describeGoods(cargo) + ' to ' + staging.place.name + '. ' + RZ.stockReason(book));
    act.say('setout_stock', { place: staging.place.name });
    return plan;
  }

  function fetchPlan(r, book, here, clock, act) {
    var home = book.places[0];
    var plan = makeSteps('fetch', [{ do: 'go', x: home.x, y: home.y, near: r.cfg.safe.radius - 1 }]);
    journalPlan(r, book, clock, plan, 'fetch' + here.id, here.name + ' is short. Going back home for more.');
    act.say('setout_fetch', { place: here.name });
    return plan;
  }

  // Nearest village the ranger knows of that isn't a known killer, or the nearest unseen ground.
  function scavengeTarget(r, book, here, left) {
    var map = r.map;
    var best = null;
    Object.keys(map.villages).forEach(function (id) {
      var village = map.villages[id];
      var camp = RZ.campNear(map, village.x, village.y, 8);
      if (camp && (camp.beatUs || 0) >= r.cfg.planner.avoidCampAfter) return;
      var leg = RZ.legSeconds(r, here, village);
      if (!leg || leg.seconds * 2 > left) return;
      if (!best || leg.seconds < best.seconds) best = { x: village.x, y: village.y, seconds: leg.seconds, name: village.name };
    });
    if (best) return best;
    var step = 7;
    var reach = (left / 2) * r.speed;
    for (var y = 3; y < map.h; y += step) {
      for (var x = 3; x < map.w; x += step) {
        if (map.seen[x + y * map.w] || map.cost[x + y * map.w] === Infinity) continue;
        var dx = x - here.x;
        var dy = y - here.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d > reach / r.cfg.ranger.unknownCost) continue;
        if (!best || d < best.d) best = { x: x, y: y, d: d, name: null };
      }
    }
    return best;
  }

  function scavengePlan(r, book, here, clock, left, act) {
    var target = scavengeTarget(r, book, here, left);
    if (!target) return null;
    var plan = makeSteps('scavenge', [
      { do: 'go', x: target.x, y: target.y, near: 2 },
      { do: 'linger', ticks: 40 },
      { do: 'go', x: here.x, y: here.y, near: r.cfg.safe.radius - 1 }
    ]);
    journalPlan(r, book, clock, plan, 'scavenge' + (target.name || 'wild'),
      target.name ? 'Stores are thin. Going to search ' + target.name + '.' : 'Stores are thin, and the map is thinner. Going out to look.');
    if (target.name) act.say('setout_scavenge', { place: target.name });
    else act.say('setout_forage');
    return plan;
  }

  // Something nearby worth a walk, in the order a ranger would want it: a crate or stores they
  // remember seeing, then a village, then ground nobody has looked at.
  function forageTarget(r, book, here, usable) {
    var map = r.map;
    var p = r.cfg.planner;
    var best = null;
    var bestValue = -1;
    Object.keys(map.items).forEach(function (key) {
      var item = map.items[key];
      if (item.kind === 'loot' && r.temperName !== 'greedy') return;
      var leg = RZ.legSeconds(r, here, item);
      if (!leg || leg.seconds * 2 + p.buffer > usable) return;
      var value = (item.kind === 'crate' ? 200 : 100) - leg.seconds;
      if (value > bestValue) {
        bestValue = value;
        best = { x: item.x, y: item.y, near: 0, name: null };
      }
    });
    if (best) return best;
    best = scavengeTarget(r, book, here, usable);
    if (best) best.near = 2;
    return best;
  }

  // A calm spell too short for the mission is still long enough for a short trip.
  function forageOr(r, book, here, clock, left, act, otherwise) {
    var p = r.cfg.planner;
    var usable = left * p.forageShare * r.temper.forage;
    if (usable < p.forageMinimum) return otherwise;
    var target = forageTarget(r, book, here, usable);
    if (!target) return otherwise;
    if (r.weapon && r.pack.ammo < p.forageRounds) act.take('ammo', p.forageRounds - r.pack.ammo);
    var plan = makeSteps('forage', [
      { do: 'go', x: target.x, y: target.y, near: target.near },
      { do: 'linger', ticks: p.forageLinger },
      { do: 'go', x: here.x, y: here.y, near: r.cfg.safe.radius - 1 }
    ]);
    journalPlan(r, book, clock, plan, 'forage' + book.tide.lastClear,
      'The window won\'t stretch to ' + book.mission.name + '. Looking around ' + here.name + ' instead.');
    act.say('setout_forage');
    return plan;
  }

  // A window too short for the trip. Each one that goes by makes the next ranger less picky.
  function holdForWindow(r, book, clock) {
    if (book.heldFor !== book.tide.lastClear) {
      book.heldFor = book.tide.lastClear;
      book.patience = Math.min(r.cfg.planner.patienceMax, book.patience + 1);
    }
    return waitPlan(clock, 'window');
  }

  // A place Zero sent them to, picked up from under gold.
  function errandPlan(r, book, here, left, act) {
    var spot = r.errand;
    if (!spot) return null;
    r.errand = null;
    var p = r.cfg.planner;
    var out = RZ.legSeconds(r, here, spot);
    if (!out || out.seconds * 2 + p.buffer > left) {
      act.say('no_time');
      return null;
    }
    act.say('setout_errand');
    return makeSteps('errand', [
      { do: 'go', x: spot.x, y: spot.y, near: spot.crate ? 0 : 1 },
      { do: spot.crate ? 'open' : 'look', x: spot.x, y: spot.y },
      { do: 'go', x: here.x, y: here.y, near: r.cfg.safe.radius - 1 }
    ]);
  }

  // Called at a safe house when the ranger has nothing left to do. Always returns a plan, even if
  // the plan is to wait for the tide.
  RZ.makePlan = function (r, book, here, act, clock) {
    var cfg = r.cfg;
    var p = cfg.planner;
    var mission = book.mission;
    var left = RZ.timeLeft(book, clock.seconds, r);
    dropLoot(r, act);
    act.takeBestWeapon();
    if (book.landDone) return waitPlan(clock, 'done');

    var staging = stagingPost(r, book);
    if (!staging) return waitPlan(clock, 'no route');
    var need = missionNeeds(r, book, staging);
    // Stores will never be perfect. After long enough without an attempt, the line goes with what it has.
    var waited = (clock.tick - (mission.lastTry === undefined ? mission.startTick : mission.lastTry)) / cfg.sim.ticksPerSecond;
    var hurry = waited > p.stockPatience;
    var stashHere = act.stashHere();

    if (left < p.minimumWindow) {
      journalPlan(r, book, clock, { kind: 'wait' }, 'hold', null);
      return waitPlan(clock, 'tide');
    }

    var errand = errandPlan(r, book, here, left, act);
    if (errand) return errand;

    var recover = tryRecoverBody(r, book, here, act, clock, left);
    if (recover) return recover;

    if (here.id === staging.place.id) {
      var available = {
        food: r.pack.food + stashHere.food,
        ammo: r.pack.ammo + stashHere.ammo,
        med: r.pack.med + stashHere.med
      };
      var short = shortfall(need, available);
      if (closeEnough(short, need, p, r) || here.isHome || hurry) {
        var trip = staging.seconds * 2 * (1 + p.routeSlack) + p.buffer;
        if (trip <= left + book.patience * p.patienceSeconds) return surveyPlan(r, book, here, staging, act, clock, need);
        return forageOr(r, book, here, clock, left, act, holdForWindow(r, book, clock));
      }
      var homeLeg = RZ.legSeconds(r, here, book.places[0]);
      if (homeLeg && homeLeg.seconds + p.buffer <= left) return fetchPlan(r, book, here, clock, act);
      return forageOr(r, book, here, clock, left, act, waitPlan(clock, 'window'));
    }

    var toStaging = RZ.legSeconds(r, here, staging.place);
    if (!toStaging) return waitPlan(clock, 'no route');
    var walk = toStaging.seconds * (1 + p.routeSlack) + p.buffer;
    if (walk > left) return forageOr(r, book, here, clock, left, act, waitPlan(clock, 'window'));

    var ahead = ledger(book, staging.place);
    var gap = shortfall({ food: need.stockFood, ammo: need.ammo, med: need.med }, ahead);
    if (anyShort(gap) && !closeEnough(gap, need, p, r) && !hurry) {
      var can = {
        food: Math.min(gap.food + p.travelFood, stashHere.food),
        ammo: Math.min(gap.ammo, stashHere.ammo),
        med: Math.min(gap.med, stashHere.med)
      };
      var stock = stockPlan(r, book, here, staging, act, clock, can);
      if (stock) return stock;
      if (!here.isHome) return fetchPlan(r, book, here, clock, act);
      var scavenge = scavengePlan(r, book, here, clock, left, act);
      if (scavenge) return scavenge;
      return waitPlan(clock, 'stores');
    }

    act.takeBestWeapon();
    var plan = makeSteps('advance', [{ do: 'go', x: staging.place.x, y: staging.place.y, near: cfg.safe.radius - 1 }]);
    act.say('setout_advance', { place: staging.place.name });
    journalPlan(r, book, clock, plan, 'advance' + staging.place.id + mission.attempts,
      (staging.place.isHome ? 'Going home. ' : 'Going up to ' + staging.place.name + '. ') + 'That\'s the place to start for ' + mission.name + ' from.');
    return plan;
  };
})();
