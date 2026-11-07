// The simulation. One tick is a fixed slice of sim time, so results never depend on the frame rate.
// This file owns the real state: bodies, needs, death and succession. Decisions live in brain.js.

var RZ = RZ || {};

(function () {
  function secondsOf(sim) {
    return sim.tick / sim.cfg.sim.ticksPerSecond;
  }

  function clockOf(sim) {
    return { tick: sim.tick, seconds: secondsOf(sim) };
  }

  function makeRanger(sim, no, place, freeKit, person) {
    var cfg = sim.cfg;
    var r = {
      no: no,
      cfg: cfg,
      alive: true,
      x: place.x,
      y: place.y,
      fromX: place.x,
      fromY: place.y,
      progress: 0,
      moveFraction: 0,
      hp: cfg.ranger.hpMax,
      energy: cfg.ranger.energyMax,
      pack: RZ.emptyPack(),
      weapon: null,
      inHand: null,           // the gun last fired, for the view
      cool: 0,
      tideExposure: 0,
      map: RZ.copyKnowledge(sim.book.map),
      path: null,
      pathAt: 0,
      pathSuspect: false,
      plan: null,
      mode: 'plan',
      lastSafe: null,
      careful: sim.book.lessons.careful,
      kills: 0,
      nextShelterCheck: 0,
      inbox: [],
      voice: { last: -1000, keys: {} },
      nextThought: sim.tick + Math.round(cfg.voice.gap * 2 * cfg.sim.ticksPerSecond),
      freshGround: 0,
      oldsSeen: {},
      gravesSeen: {},
      leftBodies: {},
      errand: null,
      orderedOn: false
    };
    RZ.dress(r, person, cfg);
    if (freeKit) {
      var kit = cfg.items.freeKit;
      r.pack.food = kit.food;
      r.pack.ammo = kit.ammo;
      r.pack.med = kit.med;
      r.pack.weapons.push(kit.weapon);
      r.weapon = kit.weapon;
    }
    return r;
  }

  // The act interface: everything a ranger can do to the world. Each call checks what's physically
  // possible, so ranger logic can't cheat by asking for something it couldn't do.
  function makeActions(sim) {
    function stashHere() {
      var r = sim.ranger;
      var place = RZ.safeHere(r, sim.book);
      return place ? sim.stashes[place.id] : null;
    }

    return {
      stashHere: function () {
        var stash = stashHere();
        return stash ? RZ.copyPack(stash) : null;
      },
      say: function (key, vars) {
        var r = sim.ranger;
        var words = Object.assign({ site: sim.book.mission.name, count: r.no }, vars);
        if (sim.book.lastName && sim.book.lastName !== r.first) words.last = sim.book.lastName;
        RZ.speak(sim, r, key, words);
      },
      reply: function (text) {
        RZ.addTalk(sim, 'ranger', text, sim.ranger.first);
      },
      deed: function (text) {
        RZ.addDeed(sim, text);
      },
      carried: function (rounds) {
        sim.rangers[sim.rangers.length - 1].carried += rounds;
      },
      // The line takes an objective on. Its clock starts the first time.
      focus: function (id) {
        var objective = RZ.bookObjective(sim.book, id);
        if (!objective || objective.startTick !== undefined) return;
        objective.startTick = sim.tick;
        objective.startRanger = sim.ranger.no;
        objective.startTide = sim.tide.number;
      },
      take: function (kind, amount) {
        var r = sim.ranger;
        var stash = stashHere();
        if (!stash) return 0;
        var cfg = sim.cfg;
        var spare = r.capacity - RZ.packWeight(cfg, r.pack);
        var fits = Math.floor(spare / cfg.items.weights[kind] + 1e-6);
        var moved = Math.max(0, Math.min(amount, stash[kind], fits));
        stash[kind] -= moved;
        r.pack[kind] += moved;
        return moved;
      },
      put: function (kind, amount) {
        var r = sim.ranger;
        var stash = stashHere();
        if (!stash) return 0;
        var moved = Math.min(amount, r.pack[kind]);
        r.pack[kind] -= moved;
        stash[kind] += moved;
        return moved;
      },
      takeBestWeapon: function () {
        var r = sim.ranger;
        var stash = stashHere();
        if (!stash) return;
        var place = RZ.safeHere(r, sim.book);
        if (place.isHome && !r.pack.weapons.length) r.pack.weapons.push(sim.cfg.items.freeKit.weapon);
        var best = RZ.bestWeapon(sim.cfg, r.pack.weapons.concat(stash.weapons));
        var at = stash.weapons.indexOf(best);
        if (at >= 0 && r.pack.weapons.indexOf(best) < 0) { // one of each: a spare pistol is just weight
          stash.weapons.splice(at, 1);
          r.pack.weapons.push(best);
        }
        r.weapon = RZ.bestWeapon(sim.cfg, r.pack.weapons);
      },
      // Whoever hauls a load also leaves a sidearm, or the next arrival has rounds and no gun.
      leaveSidearm: function () {
        var stash = stashHere();
        if (stash && !stash.weapons.length) stash.weapons.push(sim.cfg.items.freeKit.weapon);
      },
      equipBest: function () {
        var r = sim.ranger;
        r.weapon = RZ.bestWeapon(sim.cfg, r.pack.weapons);
      },
      eat: function () {
        var r = sim.ranger;
        if (r.pack.food <= 0) return false;
        r.pack.food--;
        r.energy = Math.min(sim.cfg.ranger.energyMax, r.energy + sim.cfg.items.foodEnergy);
        return true;
      },
      eatFromStash: function () {
        var r = sim.ranger;
        var stash = stashHere();
        if (!stash || stash.food <= 0) return false;
        stash.food--;
        r.energy = Math.min(sim.cfg.ranger.energyMax, r.energy + sim.cfg.items.foodEnergy);
        return true;
      },
      heal: function () {
        var r = sim.ranger;
        if (r.pack.med <= 0) return false;
        r.pack.med--;
        r.hp = Math.min(sim.cfg.ranger.hpMax, r.hp + r.medHeal);
        return true;
      },
      healFromStash: function () {
        var r = sim.ranger;
        var stash = stashHere();
        if (!stash || stash.med <= 0) return false;
        stash.med--;
        r.hp = Math.min(sim.cfg.ranger.hpMax, r.hp + r.medHeal);
        return true;
      },
      pickUp: function () {
        return RZ.pickUp(sim, sim.ranger);
      },
      shoot: function (id) {
        return RZ.rangerShoot(sim, sim.ranger, id);
      },
      throwGrenade: function (x, y) {
        return RZ.throwGrenade(sim, sim.ranger, x, y, 'ranger');
      },
      usedSafeHouse: function (id) {
        sim.lastSafe = id;
      },
      // Each of these checks the real world, as act always does, then pays out if it's true.
      survey: function (id) {
        var r = sim.ranger;
        var objective = RZ.boardObjective(sim, id);
        if (!objective || objective.type !== 'survey' || objective.done) return false;
        var dx = objective.x - r.x;
        var dy = objective.y - r.y;
        if (Math.sqrt(dx * dx + dy * dy) > sim.cfg.planner.surveyReach + 1) return false;
        sim.stats.sitesReached++;
        RZ.giveReward(sim, id, objective.x, objective.y);
        return true;
      },
      clearCamp: function (id) {
        var r = sim.ranger;
        var objective = RZ.boardObjective(sim, id);
        if (!objective || objective.type !== 'clear' || objective.done) return false;
        var dx = objective.x - r.x;
        var dy = objective.y - r.y;
        if (Math.sqrt(dx * dx + dy * dy) > sim.cfg.objectives.clearReach) return false;
        if (RZ.campLeft(sim, objective.campId) > 0) return false;
        sim.stats.campsCleared = (sim.stats.campsCleared || 0) + 1;
        RZ.giveReward(sim, id, objective.x, objective.y);
        return true;
      },
      // A relic only counts once it's under the home ring.
      deliverRelic: function (id) {
        var r = sim.ranger;
        var place = RZ.safeHere(r, sim.book);
        var objective = RZ.boardObjective(sim, id);
        if (!place || !place.isHome || r.pack.relic <= 0 || !objective || objective.type !== 'retrieve' || objective.done) return false;
        r.pack.relic--;
        return true;
      },
      stockMet: function (id) {
        var r = sim.ranger;
        var place = RZ.safeHere(r, sim.book);
        var objective = RZ.boardObjective(sim, id);
        if (!place || !objective || objective.type !== 'stock' || objective.done || place.id !== objective.placeId) return false;
        var stash = sim.stashes[place.id];
        var goods = objective.goods;
        if (stash.food < goods.food || stash.ammo < goods.ammo || stash.med < goods.med) return false;
        RZ.giveReward(sim, id, objective.x, objective.y);
        return true;
      },
      missionDone: function (id) {
        var m = RZ.bookObjective(sim.book, id);
        if (!m || !RZ.finishObjective(sim, id)) return false;
        sim.stats.missions.push({
          name: m.name,
          type: m.type,
          attempts: m.attempts,
          rangers: sim.ranger.no - (m.startRanger === undefined ? sim.ranger.no : m.startRanger) + 1,
          seconds: (sim.tick - (m.startTick === undefined ? sim.tick : m.startTick)) / sim.cfg.sim.ticksPerSecond,
          tides: sim.tide.number - (m.startTide === undefined ? sim.tide.number : m.startTide)
        });
        RZ.emit(sim, 'triumph', { name: m.name, title: m.title, kind: m.type, no: sim.ranger.no });
        return true;
      },
      recoverBody: function () {
        var r = sim.ranger;
        var gained = false;
        sim.bodies = sim.bodies.filter(function (body) {
          if (Math.abs(body.x - r.x) > 1 || Math.abs(body.y - r.y) > 1) return true;
          var cfg = sim.cfg;
          RZ.GOODS.forEach(function (kind) {
            var spare = r.capacity - RZ.packWeight(cfg, r.pack);
            var fits = Math.floor(spare / cfg.items.weights[kind] + 1e-6);
            var moved = Math.min(fits, body.pack[kind]);
            r.pack[kind] += moved;
            body.pack[kind] -= moved;
            if (moved > 0) gained = true;
          });
          body.pack.weapons.forEach(function (name) {
            if (r.pack.weapons.indexOf(name) < 0) {
              r.pack.weapons.push(name);
              gained = true;
            }
          });
          r.weapon = RZ.bestWeapon(cfg, r.pack.weapons);
          sim.stats.bodiesRecovered++;
          return false;
        });
        return gained;
      }
    };
  }

  // The next ranger arrives with nothing at the last outpost used, if it holds any gear.
  // Otherwise they start at home, which always gives a free basic kit.
  function spawnNext(sim) {
    var world = sim.world;
    var place = world.safe[0];
    var freeKit = true;
    if (sim.lastSafe && sim.lastSafe !== 'home' && RZ.holdsGear(sim.stashes[sim.lastSafe])) {
      for (var i = 0; i < world.safe.length; i++) if (world.safe[i].id === sim.lastSafe) place = world.safe[i];
      freeKit = false;
    }
    sim.rangerCount++;
    var person = sim.recruits[sim.pick] || sim.recruits[0];
    sim.ranger = makeRanger(sim, sim.rangerCount, place, freeKit, person);
    sim.rangers.push({
      no: sim.rangerCount, bornTick: sim.tick, startedAt: place.name, cause: null,
      name: person.name, first: person.first, temper: person.temper, quirk: sim.ranger.quirkLabel, past: person.past,
      bornTide: sim.tide.number, chapter: sim.chapter.no, kills: 0, carried: 0, deeds: [], track: [place.x, place.y]
    });
    var where = freeKit ? 'at home with the basic kit' : 'at ' + place.name + ' with nothing but the journal';
    var board = sim.book.objectives;
    var done = board.filter(function (objective) { return objective.done; }).length;
    var tally = sim.rangerCount > 1 && board.length ? ' The board has ' + done + ' of ' + board.length + ' done.' : '';
    RZ.writeEntry(sim.book, clockOf(sim), 'arrival', 'Ranger ' + sim.rangerCount + ', ' + person.name + ', arrives ' + where + '. ' + person.past + tally);
    sim.recruits = RZ.makeRecruits(sim);
    sim.pick = 0;
    greet(sim, sim.ranger);
  }

  function greet(sim, r) {
    var vars = { count: r.no, site: sim.book.mission.name };
    if (sim.book.lastName) vars.last = sim.book.lastName;
    var zero = sim.book.zero;
    var key = 'first';
    if (zero.trust <= 30) key = 'meet_doubt';
    else if (zero.trust >= 70) key = 'meet_trust';
    else if (sim.book.lastName) key = sim.voiceRng.chance(0.5) ? 'first_line' : 'first';
    RZ.speak(sim, r, key, vars, true);
  }

  // Zero picks who goes next. Picking at the very start redresses the first ranger.
  RZ.chooseRecruit = function (sim, pick) {
    if (sim.tick <= 1 && sim.ranger && sim.ranger.no === 1 && sim.firstChoice && sim.firstChoice[pick]) {
      var person = sim.firstChoice[pick];
      var r = sim.ranger;
      RZ.dress(r, person, sim.cfg);
      var record = sim.rangers[0];
      record.name = person.name;
      record.first = person.first;
      record.temper = person.temper;
      record.quirk = r.quirkLabel;
      record.past = person.past;
      var entry = sim.book.entries[0];
      entry.text = 'Ranger 1, ' + person.name + ', arrives at home with the basic kit. ' + person.past;
      sim.talk.length = 0;
      greet(sim, r);
      return;
    }
    if (sim.recruits[pick]) sim.pick = pick;
  };

  RZ.addDeed = function (sim, text) {
    var record = sim.rangers[sim.rangers.length - 1];
    if (!record) return;
    if (record.deeds.indexOf(text) < 0) record.deeds.push(text);
  };

  // Moves a living ranger to a safe house with a clean slate, keeping their pack.
  RZ.relocate = function (sim, r, place) {
    r.x = place.x;
    r.y = place.y;
    r.fromX = place.x;
    r.fromY = place.y;
    r.progress = 0;
    r.moveFraction = 0;
    r.path = null;
    r.plan = null;
    r.grab = null;
    r.errand = null;
    r.achieved = null;
    r.orderedOn = false;
    r.mode = 'plan';
    r.lastSafe = null;
    r.map = RZ.copyKnowledge(sim.book.map);
    r.gravesSeen = {};
    r.oldsSeen = {};
    r.leftBodies = {};
    r.inbox = [];
    RZ.speak(sim, r, 'new_land', { place: place.name }, true);
  };

  RZ.emit = function (sim, type, data) {
    var event = data || {};
    event.type = type;
    event.tick = sim.tick;
    event.seq = ++sim.eventSeq;
    sim.events.push(event);
    if (sim.events.length > 240) sim.events.shift();
  };

  function killRanger(sim, r, cause) {
    r.alive = false;
    r.path = null;
    var words = lastWords(sim, r, cause);
    RZ.emit(sim, 'death', { x: r.x, y: r.y, cause: cause, no: r.no });
    sim.respawnTick = sim.tick + Math.round(sim.cfg.ranger.respawnSeconds * sim.cfg.sim.ticksPerSecond);
    sim.stats.deaths[cause] = (sim.stats.deaths[cause] || 0) + 1;
    var record = sim.rangers[sim.rangers.length - 1];
    record.cause = cause;
    record.deathTick = sim.tick;
    record.kills = r.kills;
    record.reached = r.achieved ? true : false;
    record.words = words;
    record.deathTide = sim.tide.number;
    record.x = r.x;
    record.y = r.y;
    record.pack = RZ.copyPack(r.pack);
    record.weapon = r.weapon;

    var clock = clockOf(sim);
    record.place = RZ.learnFromDeath(sim.book, sim.cfg, r, cause, clock);
    RZ.commitMap(sim.book, r);
    var pack = RZ.copyPack(r.pack);
    sim.bodies.push({ x: r.x, y: r.y, no: r.no, name: r.name, first: r.first, words: words, pack: pack });
    var worth = pack.food + pack.med * 2 + pack.ammo * 0.1 + pack.weapons.length + (pack.relic || 0) * sim.cfg.objectives.relicWorth;
    sim.book.body = {
      x: r.x, y: r.y, no: r.no, first: r.first, worth: worth,
      nearName: RZ.nearestName(sim.book, r.map, r.x, r.y)
    };
  }

  function lastWords(sim, r, cause) {
    var seq = sim.talkSeq;
    RZ.speak(sim, r, 'last_' + cause, null, true);
    if (sim.talkSeq === seq) return null;
    var line = sim.talk[sim.talk.length - 1];
    line.last = true;
    return line.text;
  }

  RZ.hurtRanger = function (sim, r, damage, cause) {
    if (!r.alive) return;
    r.hp -= damage;
    RZ.emit(sim, 'hurt', { x: r.x, y: r.y, damage: damage, cause: cause });
    if (r.hp <= 0) {
      killRanger(sim, r, cause);
      return;
    }
    if (cause === 'scavenger' || cause === 'oldself') RZ.speak(sim, r, r.hp < sim.cfg.ranger.hpMax * 0.35 ? 'hurt_bad' : 'hurt');
  };

  function stepNeeds(sim, r) {
    var cfg = sim.cfg;
    var perTick = 1 / cfg.sim.ticksPerSecond;
    var world = sim.world;
    var cell = r.x + r.y * world.w;
    var inSafe = world.safeMask[cell] === 1;
    var atHome = inSafe && world.safeOwner[cell] === 0;

    if (atHome) {
      r.energy = cfg.ranger.energyMax;
    } else {
      r.energy = Math.max(0, r.energy - (cfg.ranger.energyMax / r.hungerSeconds) * perTick);
      if (r.energy === 0) RZ.hurtRanger(sim, r, cfg.ranger.starveDamage * perTick, 'starved');
    }
    if (!r.alive) return;
    if (inSafe && r.hp < cfg.ranger.hpMax) {
      var rate = atHome ? cfg.safe.homeRestHeal : cfg.safe.restHeal;
      r.hp = Math.min(cfg.ranger.hpMax, r.hp + rate * perTick);
    }
    if (r.cool > 0) r.cool--;

    if (RZ.tideCovers(sim, cell) && !inSafe) {
      r.tideExposure++;
      if (r.tideExposure >= cfg.tide.graceSeconds * cfg.sim.ticksPerSecond) RZ.hurtRanger(sim, r, r.hp, 'tide');
    } else {
      r.tideExposure = 0;
    }
  }

  function moveRanger(sim, r) {
    if (!r.path || r.pathAt >= r.path.length) {
      r.moveFraction = 0;
      return;
    }
    var world = sim.world;
    var next = r.path[r.pathAt];
    var nx = next % world.w;
    var ny = (next - nx) / world.w;
    var cost = world.moveCost[next];
    if (cost === Infinity) {
      r.path = null;
      r.pathSuspect = true;
      return;
    }
    if (nx !== r.x && ny !== r.y) cost *= 1.414;
    var speed = r.speed / sim.cfg.sim.ticksPerSecond;
    if (r.careful) speed *= sim.cfg.anomaly.carefulSpeed;
    r.progress += speed;
    if (r.progress >= cost) {
      r.progress -= cost;
      r.fromX = r.x;
      r.fromY = r.y;
      r.x = nx;
      r.y = ny;
      r.pathAt++;
      r.moveFraction = 0;
    } else {
      r.moveFraction = r.progress / cost;
    }
  }

  function stepRanger(sim) {
    var r = sim.ranger;
    if (!r || !r.alive) return;
    stepNeeds(sim, r);
    if (!r.alive) return;
    if (sim.tick % sim.cfg.ranger.thinkTicks === 0) {
      var percept = RZ.sense(sim, r);
      r.careful = sim.book.lessons.careful;
      RZ.think(r, sim.book, percept, sim.actions, clockOf(sim));
    }
    moveRanger(sim, r);
    if (sim.tick % sim.cfg.sim.ticksPerSecond === 0) {
      var track = sim.rangers[sim.rangers.length - 1].track;
      if (track[track.length - 2] !== r.x || track[track.length - 1] !== r.y) track.push(r.x, r.y);
    }
  }

  // Called when each tide has fully pulled back.
  RZ.afterTide = function (sim) {
    var ration = sim.cfg.items.homeRation;
    var home = sim.stashes.home;
    RZ.GOODS.forEach(function (kind) { home[kind] += ration[kind] || 0; });
    RZ.spawnSalvage(sim);
    RZ.keepRelics(sim);
    RZ.placeAnomalies(sim);
    RZ.reinforceCamps(sim);
    RZ.fadeOldSelves(sim);
    RZ.afterTideSignal(sim);
  };

  RZ.createSim = function (cfg, seed, script) {
    var rng = RZ.makeRng(seed);
    var world = RZ.generateMap(cfg, seed);
    var sim = {
      cfg: cfg,
      seed: seed,
      tick: 0,
      rng: rng,
      world: world,
      itemRng: rng.fork('items'),
      peopleRng: rng.fork('people'),
      voiceRng: rng.fork('voice'),
      enemyRng: rng.fork('enemies'),
      combatRng: rng.fork('combat'),
      anomalyRng: rng.fork('anomalies'),
      boardRng: rng.fork('board'),
      rewardRng: rng.fork('rewards'),
      board: null,
      hold: !!cfg.chapter.hold,       // Zero's switch: keep this land until the board is done
      view: {
        stamp: new Uint32Array(world.w * world.h),
        cells: new Int32Array(world.w * world.h),
        count: 0,
        generation: 0
      },
      items: [],
      scavs: [],
      olds: [],
      crates: [],
      camps: [],
      anomalies: [],
      bodies: [],
      stashes: {},
      nextItemId: 1,
      nextScavId: 1,
      nextAnomalyId: 1,
      rangers: [],
      rangerCount: 0,
      ranger: null,
      respawnTick: 0,
      lastSafe: null,
      recruits: [],
      pick: 0,
      people: { decks: {} },
      talk: [],
      talkSeq: 0,
      talkUsed: {},
      events: [],
      eventSeq: 0,
      signal: cfg.radio.signalStart,
      callQueue: [],
      callLog: [],
      script: script || null,
      scriptAt: 0,
      chapter: { no: 1, startTide: 0, startRanger: 1, landDone: false, done: [], surveyedSites: [] },
      chapters: [],
      usedNames: {},
      stats: {
        deaths: {}, missions: [], sitesReached: 0, scavsKilled: 0, oldsBeaten: 0, bodiesLost: 0, bodiesRecovered: 0
      }
    };
    world.safe.forEach(function (safe) {
      sim.stashes[safe.id] = RZ.makeStash(safe.isHome ? cfg.items.homeStart : null);
    });
    sim.tide = RZ.makeTide(sim);
    sim.book = RZ.makeBook(cfg, world, rng.fork('ink'));
    sim.actions = makeActions(sim);
    RZ.setupCamps(sim);
    RZ.spawnSalvage(sim);
    RZ.placeAnomalies(sim);
    RZ.setupBoard(sim);
    sim.recruits = RZ.makeRecruits(sim);
    sim.firstChoice = sim.recruits;
    spawnNext(sim);
    return sim;
  };

  RZ.stepSim = function (sim) {
    sim.tick++;
    RZ.applyCalls(sim);
    RZ.stepTide(sim);
    RZ.stepScavengers(sim);
    RZ.stepOldSelves(sim);
    RZ.stepCrates(sim);
    stepRanger(sim);
    RZ.stepAnomalies(sim);
    if (!sim.ranger.alive && sim.tick >= sim.respawnTick) spawnNext(sim);
  };

  // A fingerprint of the sim state, for checking that a seed repeats exactly.
  RZ.fingerprint = function (sim) {
    var r = sim.ranger;
    var text = [
      sim.tick, sim.tide.number, sim.tide.level.toFixed(6), r.no, r.x, r.y, r.hp.toFixed(6), r.energy.toFixed(6),
      JSON.stringify(r.pack), sim.items.length, sim.scavs.length, sim.olds.length, sim.anomalies.length, sim.bodies.length, sim.signal,
      sim.book.zero.trust, sim.talkSeq,
      JSON.stringify(sim.stashes), sim.book.entries.length, JSON.stringify(sim.stats), sim.hold, sim.board ? sim.board.no : 0
    ].join('|');
    return RZ.hashString(text).toString(16);
  };
})();
