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

  // The safe house closest to an objective, by walking time. Once one has been chosen it stays
  // chosen unless another is clearly better, or supplies end up scattered across every outpost.
  // A Stock objective's staging post is the outpost itself.
  function stagingFor(r, book, objective) {
    var best = null;
    var current = null;
    for (var i = 0; i < book.places.length; i++) {
      var place = book.places[i];
      if (objective.type === 'stock' && place.id !== objective.placeId) continue;
      var leg = place.id === objective.placeId ? { seconds: 0 } : RZ.legSeconds(r, place, objective);
      if (!leg) continue;
      var option = { place: place, seconds: leg.seconds };
      if (!best || option.seconds < best.seconds) best = option;
      if (option.place.id === objective.stagingId) current = option;
    }
    if (current && best.seconds > current.seconds * r.cfg.planner.stagingSwitch) best = current;
    return best;
  }

  function stagingPost(r, book) {
    var best = stagingFor(r, book, book.mission);
    if (best) book.mission.stagingId = best.place.id;
    return best;
  }

  // What an attempt needs at the staging post, allowing for every lesson so far. A Stock
  // objective needs exactly what the board asks for.
  function missionNeeds(r, book, staging, objective) {
    objective = objective || book.mission;
    if (objective.type === 'stock') {
      var goods = objective.goods;
      return { food: goods.food, stockFood: goods.food, ammo: goods.ammo, med: goods.med, exact: true };
    }
    var cfg = r.cfg;
    var p = cfg.planner;
    var lessons = book.lessons;
    var secondsPerFood = (cfg.items.foodEnergy / cfg.ranger.energyMax) * r.hungerSeconds;
    var tripFood = Math.ceil((staging.seconds * 2 + p.tripFoodSeconds) / secondsPerFood) + lessons.foodExtra;
    var campsOnMap = r.map.camps.filter(function (camp) { return camp.spotted >= 1; }).length;
    // Every failed attempt argues for going better prepared.
    var failed = objective.attempts;
    // Breaking a camp means fighting all of it, so the rounds go up with the size the board reports.
    var fight = objective.type === 'clear' ? objective.size * cfg.objectives.ammoPerScav : 0;
    return {
      food: tripFood,
      // A stash also has to feed whoever waits there for the next window.
      stockFood: tripFood + Math.ceil(p.shelterSeconds / secondsPerFood),
      ammo: Math.min(p.ammoCap + fight, Math.max(0, p.ammoBase + r.temper.ammo + lessons.ammoExtra + campsOnMap * p.ammoPerCamp + failed * p.ammoPerFailure + fight)),
      med: Math.min(p.medCap, p.medBase + lessons.medExtra + Math.floor(failed / p.failuresPerMed) + (objective.type === 'clear' ? 1 : 0))
    };
  }

  // Share of what's needed that's already there, from 0 to 1.
  function readiness(need, have) {
    var total = 0;
    var count = 0;
    ['food', 'ammo', 'med'].forEach(function (kind) {
      if (need[kind] <= 0) return;
      total += Math.min(1, have[kind] / need[kind]);
      count++;
    });
    return count ? total / count : 1;
  }

  // Known camps near a spot, each counting for more once it has beaten the line.
  function dangerNear(r, spot, radius) {
    var danger = 0;
    r.map.camps.forEach(function (camp) {
      if (camp.spotted < 1) return;
      var dx = camp.x - spot.x;
      var dy = camp.y - spot.y;
      if (dx * dx + dy * dy <= radius * radius) danger += 1 + (camp.beatUs || 0);
    });
    return danger;
  }

  var REACH_LABELS = {
    survey: function (o) { return 'Reach ' + o.name; },
    clear: function (o) { return 'Break the camp at ' + o.name; },
    retrieve: function (o) { return 'Pick up ' + o.name + (o.near ? ' near ' + o.near : ''); }
  };

  // The checklist the journal keeps for each objective, so the next ranger can pick it up.
  function checklist(o, staging, need, have) {
    if (!staging) return [{ text: 'A known way there', done: false }];
    if (o.type === 'stock') {
      return ['food', 'ammo', 'med'].map(function (kind) {
        return { text: (kind === 'med' ? 'meds' : kind) + ' ' + Math.min(have[kind], need[kind]) + '/' + need[kind], done: have[kind] >= need[kind] };
      });
    }
    var stock = { food: need.stockFood, ammo: need.ammo, med: need.med };
    return [
      { text: 'Start from ' + staging.place.name, done: true },
      { text: staging.place.name + ' stocked: ' + stockLine(have, stock), done: readiness(stock, have) >= 1 },
      { text: REACH_LABELS[o.type](o), done: !!o.reached, step: 'reach' },
      { text: o.type === 'retrieve' ? 'Bring it home' : 'Back under gold', done: !!o.done }
    ];
  }

  // How the line rates one objective against the others right now. Tempers change the weights.
  function rate(r, book, o, current) {
    var cfg = r.cfg;
    var w = cfg.objectives.weigh;
    var t = r.temper.board || {};
    var staging = stagingFor(r, book, o);
    if (!staging) {
      o.checks = checklist(o, null);
      return { objective: o, staging: null, score: -Infinity, note: 'no known way there' };
    }
    var need = missionNeeds(r, book, staging, o);
    var have = ledger(book, staging.place);
    var ready = readiness({ food: need.stockFood, ammo: need.ammo, med: need.med }, have);
    var walk = staging.seconds;
    if (o.type === 'stock') {
      var haul = RZ.legSeconds(r, book.places[0], staging.place);
      walk = haul ? haul.seconds : 0;
    }
    var danger = dangerNear(r, o, w.dangerRadius);
    var reward = RZ.rewardValue(cfg, o, book.places[0]);
    var prefer = (t.prefer && t.prefer[o.type]) || 0;
    var score = w.reward * (t.reward || 1) * reward + w.ready * ready - w.walk * walk -
      w.danger * (t.danger || 1) * danger + prefer + (o === current ? w.stick : 0);
    o.checks = checklist(o, staging, need, have);
    var bits = [Math.round(ready * 100) + '% ready', secs(walk) + (o.type === 'stock' ? ' haul' : ' from ' + staging.place.name)];
    if (danger) bits.push(danger + ' danger');
    if (prefer) bits.push(prefer > 0 ? 'suits a ' + r.temperName + ' ranger' : 'not for a ' + r.temperName + ' ranger');
    if (o === current) bits.push('already on it');
    return { objective: o, staging: staging, score: score, note: bits.join(', ') };
  }

  // Picks what to work on from the board. The current objective has a head start, so the line
  // doesn't drop one half-stocked to start another.
  function chooseObjective(r, book, act, clock) {
    var open = book.objectives.filter(function (o) { return !o.done; });
    if (!open.length) return null;
    var current = book.mission && !book.mission.done ? book.mission : null;
    var options = open.map(function (o) { return rate(r, book, o, current); });
    options.sort(function (a, b) { return b.score - a.score; });
    if (brief) {
      brief.options = options.map(function (option) {
        return { id: option.objective.id, title: option.objective.title, score: option.staging ? Math.round(option.score) : null, note: option.note };
      });
    }
    var best = options[0];
    if (!best.staging) return null;
    var runner = options[1] && options[1].staging ? options[1] : null;
    weigh('Next on the board', best.objective.title + ': ' + best.note +
      (runner ? ' (over ' + runner.objective.title + ', ' + Math.round(best.score) + ' to ' + Math.round(runner.score) + ')' : ''), true);
    if (best.objective !== book.mission) {
      var was = book.mission;
      book.mission = best.objective;
      if (was && !was.done && was.startTick !== undefined) {
        journalPlan(r, book, clock, { kind: 'plan' }, 'focus' + best.objective.id,
          'Leaving ' + was.title + ' for now. ' + best.objective.title + ' looks the better bet: ' + best.note + '.');
      } else {
        journalPlan(r, book, clock, { kind: 'plan' }, 'focus' + best.objective.id,
          'Next on the board: ' + best.objective.title + '. ' + best.note.charAt(0).toUpperCase() + best.note.slice(1) + '.');
      }
    }
    act.focus(best.objective.id);
    if (brief) brief.mission = { id: best.objective.id, name: best.objective.name, title: best.objective.title, type: best.objective.type };
    return best;
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

  // The reasoning behind a plan, kept for the view: each question the planner asked, the answer, and
  // whether it passed. Nothing in the sim reads it back, so it can't change what happens.
  // tools/checks.js holds the code to that.
  var trace = null;
  var brief = null;

  function weigh(question, answer, ok) {
    if (trace) trace.push({ q: question, a: answer, ok: ok });
  }

  function task(text) {
    if (brief) brief.task = text;
  }

  function secs(seconds) {
    return Math.round(seconds) + 's';
  }

  function stockLine(have, need) {
    return ['food', 'ammo', 'med'].map(function (kind) {
      return (kind === 'med' ? 'meds' : kind) + ' ' + have[kind] + '/' + need[kind];
    }).join(' · ');
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

  var WAIT_TASKS = {
    done: 'Nothing left on the board. Wait',
    'no route': 'No known way there. Wait',
    tide: 'Wait out the tide under gold',
    window: 'Wait for a longer window',
    stores: 'Wait for the next ration at home'
  };

  function waitPlan(clock, why) {
    task(WAIT_TASKS[why] || 'Wait');
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
    if (text) RZ.writeEntry(book, clock, plan.attempt ? 'plan-big' : 'plan', lead + text);
  }

  function tryRecoverBody(r, book, here, act, clock, left) {
    var body = book.body;
    if (!body) return null;
    var p = r.cfg.planner;
    var question = body.first + '\'s gear';
    if (body.worth < p.bodyWorth * (r.temperName === 'greedy' ? 0.5 : 1)) {
      weigh(question, 'not worth the walk', false);
      return null;
    }
    var out = RZ.legSeconds(r, here, body);
    var back = out ? RZ.nearestSafe(r, book, body) : null;
    if (!out || !back) {
      weigh(question, 'no known way there', false);
      return null;
    }
    var trip = out.seconds + back.seconds + p.buffer;
    if (trip > left) {
      weigh(question, 'need ' + secs(trip) + ', have ' + secs(left), false);
      return null;
    }
    weigh(question, secs(trip) + ' there and back, have ' + secs(left), true);
    task('Recover ' + body.first + '\'s gear');
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

  // The steps of an attempt at each kind of objective. Each ends back at the staging post.
  function attemptSteps(cfg, mission, here) {
    var back = { do: 'go', x: here.x, y: here.y, near: cfg.safe.radius - 1 };
    if (mission.type === 'clear') {
      return [
        { do: 'go', x: mission.x, y: mission.y, near: 2 },
        { do: 'linger', ticks: cfg.objectives.clearLinger },
        { do: 'clear' },
        back
      ];
    }
    if (mission.type === 'retrieve') {
      return [{ do: 'go', x: mission.x, y: mission.y, near: 0 }, { do: 'take' }, back];
    }
    return [{ do: 'go', x: mission.x, y: mission.y, near: cfg.planner.surveyReach }, { do: 'survey' }, back];
  }

  var ATTEMPT_WORDS = {
    survey: { first: 'Setting out for {name}', again: 'Attempt {n} at {name}', task: 'Survey {name} and come back to {here}' },
    clear: { first: 'Going to break the camp at {name}', again: 'Attempt {n} at the camp at {name}', task: 'Break the camp at {name}, then back to {here}' },
    retrieve: { first: 'Going for {name}', again: 'Attempt {n} at bringing in {name}', task: 'Fetch {name}, then back to {here}' }
  };

  function fill(text, words) {
    return text.replace(/\{(\w+)\}/g, function (all, key) { return words[key]; });
  }

  function attemptPlan(r, book, here, staging, act, clock, need) {
    var cfg = r.cfg;
    var mission = book.mission;
    var have = r.pack;
    loadUp(r, act, shortfall(need, have));
    act.takeBestWeapon();
    mission.attempts++;
    mission.lastTry = clock.tick;
    book.patience = Math.max(0, book.patience - r.cfg.planner.patienceSpent);
    var plan = makeSteps(mission.type, attemptSteps(cfg, mission, here));
    plan.attempt = true;
    var words = ATTEMPT_WORDS[mission.type];
    var fills = { name: mission.name, n: mission.attempts, here: here.name };
    task(fill(words.task, fills));
    if (mission.type === 'survey') act.say(mission.attempts === 1 ? 'setout_survey' : 'setout_again', { attempt: mission.attempts });
    else if (mission.type === 'clear') act.say('setout_clear', { attempt: mission.attempts });
    else act.say('setout_retrieve', { attempt: mission.attempts });
    var extra = RZ.attemptNote(book, r.map);
    journalPlan(r, book, clock, plan, mission.id + ':' + mission.attempts,
      fill(mission.attempts === 1 ? words.first : words.again, fills) + (mission.near ? ' near ' + mission.near : '') +
      ' from ' + here.name + ' with ' + describeGoods(r.pack) + '.' + (extra ? ' ' + extra : ''));
    return plan;
  }

  // Carrying a relic home from wherever the attempt ended.
  function deliverPlan(r, book, here, act, clock, left) {
    var home = book.places[0];
    var relic = openRetrieve(book);
    var name = relic ? relic.name : 'it';
    var leg = RZ.legSeconds(r, here, home);
    var walk = leg ? leg.seconds * (1 + r.cfg.planner.routeSlack) + r.cfg.planner.buffer : Infinity;
    weigh('Carrying ' + name + ' home', leg ? 'need ' + secs(walk) + ', have ' + secs(left) : 'no known way', walk <= left);
    if (walk > left) return waitPlan(clock, 'window');
    task('Carry ' + name + ' home');
    var plan = makeSteps('deliver', [{ do: 'go', x: home.x, y: home.y, near: r.cfg.safe.radius - 1 }]);
    act.say('setout_deliver', { site: name });
    journalPlan(r, book, clock, plan, 'deliver' + (relic ? relic.id : ''), 'Taking ' + name + ' the rest of the way home from ' + here.name + '.');
    return plan;
  }

  function openRetrieve(book) {
    for (var n = 0; n < book.objectives.length; n++) {
      var o = book.objectives[n];
      if (o.type === 'retrieve' && !o.done) return o;
    }
    return null;
  }

  // Everything in the pack that the board wants at this outpost goes into its stash, bar a little
  // to walk home on.
  function unloadForBoard(r, act, mission) {
    var p = r.cfg.planner;
    var keep = { food: p.travelFood, ammo: r.weapon ? p.forageRounds : 0, med: 0 };
    ['food', 'ammo', 'med'].forEach(function (kind) {
      var spare = r.pack[kind] - keep[kind];
      if (spare > 0 && mission.goods[kind] > 0) act.put(kind, spare);
    });
  }

  function stockPlan(r, book, here, staging, act, clock, short) {
    var taken = loadUp(r, act, short);
    act.takeBestWeapon();
    var cargo = {
      food: taken.food, ammo: taken.ammo, med: taken.med
    };
    if (cargo.food + cargo.ammo + cargo.med === 0) {
      weigh('Anything here to haul', 'nothing ' + here.name + ' can spare', false);
      return null;
    }
    weigh('Anything here to haul', describeGoods(cargo), true);
    task('Haul ' + describeGoods(cargo) + ' to ' + staging.place.name);
    var forBoard = book.mission.type === 'stock';
    if (forBoard) book.mission.attempts++;
    var plan = makeSteps('stock', [
      { do: 'go', x: staging.place.x, y: staging.place.y, near: r.cfg.safe.radius - 1 },
      { do: 'stash', goods: cargo }
    ]);
    journalPlan(r, book, clock, plan, 'stock' + staging.place.id + describeGoods(cargo),
      'Moving ' + describeGoods(cargo) + ' to ' + staging.place.name + '. ' +
      (forBoard ? 'The board wants ' + staging.place.name + ' stocked.' : RZ.stockReason(book)));
    act.say('setout_stock', { place: staging.place.name });
    return plan;
  }

  function fetchPlan(r, book, here, clock, act) {
    var home = book.places[0];
    task('Go home for more supplies');
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
    if (!target) {
      weigh('Somewhere to scavenge', 'nowhere in reach', false);
      return null;
    }
    weigh('Somewhere to scavenge', target.name || 'unmapped ground', true);
    task(target.name ? 'Search ' + target.name + ' for supplies' : 'Search unmapped ground for supplies');
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
    if (usable < p.forageMinimum) {
      weigh('Time for a short trip', secs(usable) + ' to spare, not enough', false);
      return otherwise;
    }
    var target = forageTarget(r, book, here, usable);
    if (!target) {
      weigh('Time for a short trip', 'nothing worth it within ' + secs(usable / 2), false);
      return otherwise;
    }
    var aim = target.name || (target.near === 0 ? 'something seen nearby' : 'unmapped ground');
    weigh('Time for a short trip', secs(usable) + ' to spare: ' + aim, true);
    task('Look around ' + (target.name || here.name) + ' while there\'s time');
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
      weigh('Zero\'s mark', out ? 'need ' + secs(out.seconds * 2 + p.buffer) + ', have ' + secs(left) : 'no known way there', false);
      act.say('no_time');
      return null;
    }
    weigh('Zero\'s mark', secs(out.seconds * 2 + p.buffer) + ' there and back, have ' + secs(left), true);
    task(spot.crate ? 'Fetch Zero\'s crate' : 'Check the spot Zero marked');
    act.say('setout_errand');
    return makeSteps('errand', [
      { do: 'go', x: spot.x, y: spot.y, near: spot.crate ? 0 : 1 },
      { do: spot.crate ? 'open' : 'look', x: spot.x, y: spot.y },
      { do: 'go', x: here.x, y: here.y, near: r.cfg.safe.radius - 1 }
    ]);
  }

  // Called at a safe house when the ranger has nothing left to do. Always returns a plan, even if
  // the plan is to wait for the tide. The plan carries its reasoning: `trace` lists the questions
  // asked, and `brief` the numbers the view needs for the checklist and the outpost stores.
  RZ.makePlan = function (r, book, here, act, clock) {
    trace = [];
    brief = {
      from: here.id,
      fromName: here.name,
      mission: { id: book.mission.id, name: book.mission.name, siteNo: book.siteAt + 1, sites: book.sites.length },
      tick: clock.tick,
      task: null
    };
    var plan = decide(r, book, here, act, clock, 0);
    plan.trace = trace;
    plan.brief = brief;
    trace = null;
    brief = null;
    return plan;
  };

  function decide(r, book, here, act, clock, depth) {
    var cfg = r.cfg;
    var p = cfg.planner;
    var left = RZ.timeLeft(book, clock.seconds, r);
    dropLoot(r, act);
    act.takeBestWeapon();

    // A relic in the pack only counts once it's home.
    if (r.pack.relic > 0) {
      var relic = openRetrieve(book);
      if (here.isHome && relic && act.deliverRelic(relic.id)) {
        weigh('Carrying ' + relic.name, 'home at last', true);
        RZ.completeObjective(r, book, act, clock, relic);
        if (depth < 2) return decide(r, book, here, act, clock, depth + 1);
      } else if (!here.isHome && relic) {
        if (left < p.minimumWindow) return waitPlan(clock, 'tide');
        return deliverPlan(r, book, here, act, clock, left);
      }
    }

    var open = book.objectives.filter(function (o) { return !o.done; });
    if (!open.length) {
      weigh('Anything left on the board', 'no, every objective is done', false);
      return waitPlan(clock, 'done');
    }
    var choice = chooseObjective(r, book, act, clock);
    if (!choice) {
      weigh('A way to anything on the board', 'none known yet', false);
      return waitPlan(clock, 'no route');
    }
    var mission = book.mission;

    // An outpost the board wants stocked is finished the moment it holds enough.
    if (mission.type === 'stock' && here.id === mission.placeId) {
      unloadForBoard(r, act, mission);
      if (act.stockMet(mission.id)) {
        weigh(here.name + ' stocked to the board', 'yes', true);
        RZ.completeObjective(r, book, act, clock, mission);
        if (depth < 2) return decide(r, book, here, act, clock, depth + 1);
        return waitPlan(clock, 'done');
      }
    }

    var staging = stagingPost(r, book);
    if (!staging) {
      weigh('Somewhere to start from', 'no known way to ' + mission.name, false);
      return waitPlan(clock, 'no route');
    }
    weigh('Start from', staging.place.name + ', ' + secs(staging.seconds) + ' from ' + mission.name, true);
    var need = missionNeeds(r, book, staging);
    brief.staging = { id: staging.place.id, name: staging.place.name, seconds: staging.seconds };
    brief.targets = { food: need.stockFood, ammo: need.ammo, med: need.med };
    // Stores will never be perfect. After long enough without an attempt, the line goes with what it has.
    var since = mission.lastTry === undefined ? mission.startTick : mission.lastTry;
    var waited = (clock.tick - (since === undefined ? clock.tick : since)) / cfg.sim.ticksPerSecond;
    // The board's numbers for an outpost are the numbers. Nobody stocks it roughly.
    var hurry = !need.exact && waited > p.stockPatience;
    var stashHere = act.stashHere();
    brief.left = left;

    if (left < p.minimumWindow) {
      weigh('Time before the tide', left > 0 ? secs(left) + ' by the journal, too short' : 'none, it\'s due', false);
      journalPlan(r, book, clock, { kind: 'wait' }, 'hold', null);
      return waitPlan(clock, 'tide');
    }
    weigh('Time before the tide', secs(left) + ' by the journal', true);

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
      var ready = need.exact ? !anyShort(short) : closeEnough(short, need, p, r);
      brief.stock = { id: here.id, name: here.name, have: available, need: { food: need.food, ammo: need.ammo, med: need.med }, source: 'here' };
      var homeWillDo = here.isHome && !need.exact;
      var verdict = !anyShort(short) ? 'all there' : ready ? 'close enough' : homeWillDo ? 'home is as good as it gets' : hurry ? 'waited ' + secs(waited) + ', going with it' : 'short';
      weigh(need.exact ? 'Stores the board wants' : 'Stores for the attempt', stockLine(available, need) + ': ' + verdict, ready || homeWillDo || hurry);
      if (!need.exact && (ready || homeWillDo || hurry)) {
        var trip = staging.seconds * 2 * (1 + p.routeSlack) + p.buffer;
        var nerve = book.patience * p.patienceSeconds;
        brief.trip = trip;
        weigh('Window for the round trip', 'need ' + secs(trip) + ', have ' + secs(left) + (nerve ? ' + ' + secs(nerve) + ' of patience' : ''), trip <= left + nerve);
        if (trip <= left + nerve) return attemptPlan(r, book, here, staging, act, clock, need);
        return forageOr(r, book, here, clock, left, act, holdForWindow(r, book, clock));
      }
      var homeLeg = RZ.legSeconds(r, here, book.places[0]);
      var homeOk = homeLeg && homeLeg.seconds + p.buffer <= left;
      weigh('Home for more', homeLeg ? secs(homeLeg.seconds) + ' walk, have ' + secs(left) : 'no known way', !!homeOk);
      if (homeOk) return fetchPlan(r, book, here, clock, act);
      return forageOr(r, book, here, clock, left, act, waitPlan(clock, 'window'));
    }

    var toStaging = RZ.legSeconds(r, here, staging.place);
    if (!toStaging) {
      weigh('Walk to ' + staging.place.name, 'no known way', false);
      return waitPlan(clock, 'no route');
    }
    var walk = toStaging.seconds * (1 + p.routeSlack) + p.buffer;
    weigh('Walk to ' + staging.place.name, 'need ' + secs(walk) + ', have ' + secs(left), walk <= left);
    if (walk > left) return forageOr(r, book, here, clock, left, act, waitPlan(clock, 'window'));

    var ahead = ledger(book, staging.place);
    var stockNeed = { food: need.stockFood, ammo: need.ammo, med: need.med };
    var gap = shortfall(stockNeed, ahead);
    var stocked = !anyShort(gap) || (!need.exact && closeEnough(gap, need, p, r));
    brief.stock = { id: staging.place.id, name: staging.place.name, have: { food: ahead.food, ammo: ahead.ammo, med: ahead.med }, need: stockNeed, source: 'journal' };
    weigh(staging.place.name + ' stocked, by the journal', stockLine(ahead, stockNeed) +
      (stocked ? (anyShort(gap) ? ': close enough' : '') : hurry ? ': short, but waited ' + secs(waited) : ': short'), stocked || hurry);
    if (!stocked && !hurry) {
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
    task((staging.place.isHome ? 'Go home' : 'Move up to ' + staging.place.name) + ', ready for ' + mission.name);
    var plan = makeSteps('advance', [{ do: 'go', x: staging.place.x, y: staging.place.y, near: cfg.safe.radius - 1 }]);
    act.say('setout_advance', { place: staging.place.name });
    journalPlan(r, book, clock, plan, 'advance' + staging.place.id + mission.attempts,
      (staging.place.isHome ? 'Going home. ' : 'Going up to ' + staging.place.name + '. ') + 'That\'s the place to start for ' + mission.name + ' from.');
    return plan;
  }
})();
