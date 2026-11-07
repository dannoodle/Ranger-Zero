// The board: what the line is asked to do in each land. Home posts it, and the journal keeps a copy,
// so rangers know where each objective is the way they know where the outposts are.
//
// Four kinds of objective:
//   survey    reach a far site and come back to shelter
//   clear     break the scavenger camp at a named village, then come back
//   retrieve  fetch a relic from a marked spot and bring it home
//   stock     fill a named outpost to the amounts on the board
//
// Finishing one leaves a reward: a cache on the ground at the site, or goods in the outpost's stash.
// The real state lives in sim.board. The journal's copy, book.objectives, holds what rangers are
// told and what they've ticked off.

var RZ = RZ || {};

(function () {
  function distance(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function farEnough(spot, list, apart) {
    return list.every(function (other) { return distance(spot, other) >= apart; });
  }

  // How much a finished objective leaves behind. Ranger logic uses this too, to weigh one objective
  // against another, so it takes only what the board and the journal say.
  RZ.rewardValue = function (cfg, objective, home) {
    var c = cfg.rewards;
    return c.base + c.perCell * distance(objective, home) + c.perAttempt * Math.min(5, objective.attempts || 0) +
      (c.typeBonus[objective.type] || 0);
  };

  function surveys(sim, done) {
    return sim.world.sites.filter(function (site) { return !done[site.name]; }).map(function (site) {
      return { type: 'survey', name: site.name, title: 'Survey ' + site.name, x: site.x, y: site.y };
    });
  }

  function camps(sim, rng, taken, count) {
    var c = sim.cfg.objectives;
    var options = sim.camps.filter(function (camp) {
      if (camp.picket || camp.cleared) return false;
      if (distance(camp, sim.world.home) < c.clearMinFromHome) return false;
      return sim.scavs.some(function (s) { return s.camp === camp.id; });
    });
    var chosen = [];
    rng.shuffle(options).forEach(function (camp) {
      if (chosen.length >= count || !farEnough(camp, taken.concat(chosen), c.apart)) return;
      var size = sim.scavs.filter(function (s) { return s.camp === camp.id; }).length;
      chosen.push({ type: 'clear', name: camp.name, title: 'Clear ' + camp.name, x: camp.x, y: camp.y, campId: camp.id, size: size });
    });
    return chosen;
  }

  // A spot as hard to reach as a survey site: dry, reachable, out in the open, away from the rest.
  function relicSpots(sim, rng, taken, count) {
    var c = sim.cfg.objectives;
    var world = sim.world;
    var w = world.w;
    var sources = world.safe.map(function (safe) { return safe.x + safe.y * w; });
    var legCost = RZ.costField(w, world.h, world.moveCost, sources);
    var names = rng.shuffle(sim.cfg.names.relics.slice());
    var chosen = [];
    for (var tries = 0; tries < 1500 && chosen.length < count; tries++) {
      var spot = { x: rng.int(4, w - 5), y: rng.int(4, world.h - 5) };
      var i = spot.x + spot.y * w;
      if (!world.reach[i] || world.water[i] || world.huts[i] || world.nearSafe[i]) continue;
      if (legCost[i] < c.retrieveMinLeg || legCost[i] > c.retrieveMaxLeg) continue;
      if (!farEnough(spot, taken.concat(chosen), c.apart)) continue;
      var near = RZ.nearestPlaceName(sim, spot);
      var relic = names[chosen.length % names.length];
      chosen.push({ type: 'retrieve', name: relic, title: 'Bring home ' + relic, near: near, x: spot.x, y: spot.y });
    }
    return chosen;
  }

  function outposts(sim, rng, count) {
    var c = sim.cfg.objectives;
    var options = rng.shuffle(sim.world.safe.filter(function (safe) { return !safe.isHome; }));
    return options.slice(0, count).map(function (safe) {
      return { type: 'stock', name: safe.name, title: 'Stock ' + safe.name, x: safe.x, y: safe.y, placeId: safe.id,
        goods: { food: c.stockGoods.food, ammo: c.stockGoods.ammo, med: c.stockGoods.med } };
    });
  }

  RZ.nearestPlaceName = function (sim, spot) {
    var best = null;
    var bestDistance = Infinity;
    sim.world.safe.concat(sim.world.villages, sim.world.sites).forEach(function (place) {
      var d = distance(place, spot);
      if (d < bestDistance) {
        bestDistance = d;
        best = place.name;
      }
    });
    return best;
  };

  // Takes every relic off the map, out of every pack and out of every stash.
  function clearRelics(sim) {
    sim.items = sim.items.filter(function (item) { return item.kind !== 'relic'; });
    var packs = [];
    Object.keys(sim.stashes).forEach(function (id) { packs.push(sim.stashes[id]); });
    sim.bodies.forEach(function (body) { packs.push(body.pack); });
    sim.olds.forEach(function (old) { packs.push(old.pack); });
    if (sim.ranger) packs.push(sim.ranger.pack);
    packs.forEach(function (pack) { if (pack) pack.relic = 0; });
  }

  function placeRelic(sim, objective) {
    RZ.addItem(sim, objective.x, objective.y, 'relic', 1);
    sim.items[sim.items.length - 1].board = objective.id;
  }

  // Posts a new board for this land. Surveys come from the land's sites that haven't been done yet.
  RZ.setupBoard = function (sim) {
    var c = sim.cfg.objectives;
    var rng = sim.boardRng;
    var chapter = sim.chapter;
    var done = {};
    (chapter.surveyedSites || []).forEach(function (name) { done[name] = true; });
    clearRelics(sim);

    var list = surveys(sim, done).slice(0, c.survey);
    list = list.concat(camps(sim, rng, list, c.clear));
    list = list.concat(relicSpots(sim, rng, list, c.retrieve));
    list = list.concat(outposts(sim, rng, c.stock));

    var no = (sim.board ? sim.board.no : 0) + 1;
    sim.board = { no: no, objectives: [] };
    list.forEach(function (objective, n) {
      objective.id = 'b' + no + '-' + n;
      objective.done = false;
      objective.rewarded = false;
      sim.board.objectives.push(objective);
      if (objective.type === 'retrieve') placeRelic(sim, objective);
    });

    var book = sim.book;
    book.board = no;
    book.objectives = sim.board.objectives.map(function (objective) {
      return {
        id: objective.id, type: objective.type, name: objective.name, title: objective.title, x: objective.x, y: objective.y,
        near: objective.near || null, size: objective.size || 0, placeId: objective.placeId || null,
        goods: objective.goods ? Object.assign({}, objective.goods) : null,
        done: false, reached: false, attempts: 0, checks: []
      };
    });
    book.mission = book.objectives[0];
    book.landDone = false;
    chapter.landDone = false;
  };

  // Zero tears up the board and asks for a new one. Progress on the old one is dropped.
  RZ.newBoard = function (sim) {
    RZ.setupBoard(sim);
    var clock = { tick: sim.tick, seconds: sim.tick / sim.cfg.sim.ticksPerSecond };
    RZ.writeEntry(sim.book, clock, 'chapter', 'Zero posted a new board: ' +
      sim.board.objectives.map(function (objective) { return objective.title; }).join(', ') + '.');
    RZ.emit(sim, 'board', { no: sim.board.no });
  };

  RZ.boardObjective = function (sim, id) {
    if (!sim.board) return null;
    for (var n = 0; n < sim.board.objectives.length; n++) {
      if (sim.board.objectives[n].id === id) return sim.board.objectives[n];
    }
    return null;
  };

  function bookObjective(book, id) {
    for (var n = 0; n < book.objectives.length; n++) {
      if (book.objectives[n].id === id) return book.objectives[n];
    }
    return null;
  }
  RZ.bookObjective = bookObjective;

  function dryNear(sim, rng, x, y, radius) {
    var world = sim.world;
    for (var tries = 0; tries < 20; tries++) {
      var cx = x + rng.int(-radius, radius);
      var cy = y + rng.int(-radius, radius);
      if (cx < 0 || cy < 0 || cx >= world.w || cy >= world.h) continue;
      var i = cx + cy * world.w;
      if (!world.water[i] && !world.huts[i] && !world.safeMask[i] && world.reach[i]) return { x: cx, y: cy };
    }
    return { x: x, y: y };
  }

  // The reward for a finished objective. Everything but a stocked outpost's reward lies on the
  // ground, where the tide will take what isn't carried in.
  RZ.giveReward = function (sim, id, x, y) {
    var objective = RZ.boardObjective(sim, id);
    if (!objective || objective.rewarded) return;
    objective.rewarded = true;
    var c = sim.cfg.rewards;
    var rng = sim.rewardRng;
    var noted = bookObjective(sim.book, id) || objective;
    var value = RZ.rewardValue(sim.cfg, { type: objective.type, x: objective.x, y: objective.y, attempts: noted.attempts }, sim.world.home);
    var goods = {
      ammo: Math.round(value * c.ammoPerPoint),
      food: Math.floor(value / c.foodEvery),
      med: Math.floor(value / c.medEvery),
      grenade: value >= c.grenadeFrom ? 1 : 0
    };
    var weapon = null;
    if (value >= c.weaponFrom && rng.chance(Math.min(c.weaponChanceMax, (value - c.weaponFrom + 1) * c.weaponChancePerPoint))) {
      weapon = rng.pick(c.weapons);
    }
    var stash = objective.type === 'stock' ? sim.stashes[objective.placeId] : null;
    Object.keys(goods).forEach(function (kind) {
      if (!goods[kind]) return;
      if (stash) {
        stash[kind] += goods[kind];
        return;
      }
      var spot = dryNear(sim, rng, x, y, 2);
      RZ.addItem(sim, spot.x, spot.y, kind, goods[kind]);
      sim.items[sim.items.length - 1].reward = true;
    });
    if (weapon) {
      if (stash) stash.weapons.push(weapon);
      else {
        var at = dryNear(sim, rng, x, y, 2);
        RZ.addItem(sim, at.x, at.y, 'weapon', 1, weapon);
        sim.items[sim.items.length - 1].reward = true;
      }
    }
    sim.stats.rewards = (sim.stats.rewards || 0) + 1;
    RZ.emit(sim, 'reward', { x: x, y: y, title: objective.title, inStash: !!stash, value: Math.round(value) });
  };

  // A relic picked up from its spot pays out there and then.
  RZ.relicTaken = function (sim, item) {
    if (item.board) RZ.giveReward(sim, item.board, item.x, item.y);
  };

  function relicsAround(sim) {
    var count = 0;
    sim.items.forEach(function (item) { if (item.kind === 'relic') count++; });
    if (sim.ranger && sim.ranger.alive) count += sim.ranger.pack.relic;
    sim.bodies.forEach(function (body) { count += body.pack.relic || 0; });
    sim.olds.forEach(function (old) { count += old.pack.relic || 0; });
    Object.keys(sim.stashes).forEach(function (id) { count += sim.stashes[id].relic || 0; });
    return count;
  }

  // A relic the tide has taken for good turns up again where the board says it is, so a land can
  // always be finished.
  RZ.keepRelics = function (sim) {
    if (!sim.board) return;
    var open = sim.board.objectives.filter(function (objective) { return objective.type === 'retrieve' && !objective.done; });
    var count = relicsAround(sim);
    open.forEach(function (objective) {
      if (count >= open.length) return;
      if (sim.items.some(function (item) { return item.board === objective.id; })) return;
      placeRelic(sim, objective);
      count++;
    });
  };

  // Called from the act interface when a ranger finishes one. Marks it done in both copies.
  RZ.finishObjective = function (sim, id) {
    var objective = RZ.boardObjective(sim, id);
    var noted = bookObjective(sim.book, id);
    if (!objective || objective.done) return false;
    objective.done = true;
    if (noted) noted.done = true;
    var chapter = sim.chapter;
    chapter.done = chapter.done || [];
    chapter.done.push(objective.title);
    if (objective.type === 'survey') {
      chapter.surveyedSites = chapter.surveyedSites || [];
      chapter.surveyedSites.push(objective.name);
    }
    if (objective.type === 'clear') {
      var camp = sim.camps[objective.campId];
      if (camp) camp.cleared = true;
    }
    if (sim.board.objectives.every(function (o) { return o.done; })) {
      chapter.landDone = true;
      sim.book.landDone = true;
      var clock = { tick: sim.tick, seconds: sim.tick / sim.cfg.sim.ticksPerSecond };
      RZ.writeEntry(sim.book, clock, 'triumph', 'That\'s the whole board for this land. There\'s nothing left out there for us but the next tide.');
      RZ.emit(sim, 'land-done', {});
      RZ.speak(sim, sim.ranger, 'land_done', null, true);
    }
    return true;
  };

  // How many scavengers of a camp are still standing.
  RZ.campLeft = function (sim, campId) {
    return sim.scavs.filter(function (s) { return s.camp === campId; }).length;
  };
})();
