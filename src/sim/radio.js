// Zero on the radio. The player is Ranger Zero: the voice at home who can see the whole map.
//
// A call is an input to the sim. It's queued, applied on a tick and logged, so a run with calls can
// be replayed exactly. Calls reach the ranger only through the percept (see sense.js), as something
// they've been told. They can refuse, and if Zero is wrong they find out. Trust lives in the journal,
// so it passes down the line.

var RZ = RZ || {};

(function () {
  var SAYS = {
    turnback: 'Turn back. Now.',
    pushon: 'Push on.',
    warn: 'Keep clear of the spot I\'m marking.',
    send: 'Go to the spot I\'m marking.',
    crate: 'Crate coming down. Marking it for you.',
    how: 'How are you holding up?',
    plan: 'What\'s the plan?',
    know: 'What do you know?',
    zero: 'Do you trust me?',
    hold: 'We\'re staying in this land until the board is done.',
    release: 'The land goes when the tides say it goes.',
    board: 'Scrap the board. New orders coming through.'
  };

  RZ.callCost = function (cfg, type) {
    return cfg.radio.costs[type] || 0;
  };

  // Whether a call can be made right now. The view uses this for its buttons.
  RZ.canCall = function (sim, type) {
    if (!sim.ranger || !sim.ranger.alive) return false;
    return sim.signal >= RZ.callCost(sim.cfg, type);
  };

  // Whether the ranger would go along with it, as things stand.
  RZ.willHeed = function (r, book, type) {
    return book.zero.trust + (r.temper.heed[type] || 0) >= r.cfg.radio.heedAt;
  };

  // The nearest spot a crate could land.
  RZ.dropSpot = function (sim, x, y) {
    var world = sim.world;
    for (var radius = 0; radius <= 4; radius++) {
      for (var dy = -radius; dy <= radius; dy++) {
        for (var dx = -radius; dx <= radius; dx++) {
          var cx = x + dx;
          var cy = y + dy;
          if (cx < 0 || cy < 0 || cx >= world.w || cy >= world.h) continue;
          var i = cx + cy * world.w;
          if (world.reach[i] && !world.water[i] && !world.huts[i]) return { x: cx, y: cy };
        }
      }
    }
    return null;
  };

  // Calls come from the view or from a replay script, and wait for the next tick.
  RZ.queueCall = function (sim, call) {
    sim.callQueue.push(call);
  };

  function applyCall(sim, call) {
    sim.callLog.push(Object.assign({ tick: sim.tick }, call));
    if (call.type === 'recruit') {
      RZ.chooseRecruit(sim, call.pick);
      return;
    }
    // The two switches on the board cost nothing, and work whether or not anyone is out there.
    if (call.type === 'hold') {
      if (sim.hold === !!call.on) return;
      sim.hold = !!call.on;
      RZ.addTalk(sim, 'zero', SAYS[sim.hold ? 'hold' : 'release'], 'Zero');
      RZ.writeEntry(sim.book, { tick: sim.tick }, 'chapter', sim.hold
        ? 'Zero is holding this land. No greater tide until the board is done.'
        : 'Zero let go of this land. The greater tide comes when it comes.');
      if (sim.ranger.alive) sim.ranger.inbox.push({ type: sim.hold ? 'hold' : 'release' });
      return;
    }
    if (call.type === 'board') {
      RZ.addTalk(sim, 'zero', SAYS.board, 'Zero');
      RZ.newBoard(sim);
      if (sim.ranger.alive) sim.ranger.inbox.push({ type: 'board' });
      return;
    }
    if (!RZ.canCall(sim, call.type)) return;
    sim.signal -= RZ.callCost(sim.cfg, call.type);
    sim.book.zero.calls++;
    var r = sim.ranger;
    RZ.addTalk(sim, 'zero', SAYS[call.type] || '...', 'Zero');
    var message = { type: call.type, topic: call.topic, x: call.x, y: call.y };
    if (call.type === 'how' || call.type === 'plan' || call.type === 'know' || call.type === 'zero') {
      message.type = 'ask';
      message.topic = call.type;
    }
    if (call.type === 'crate') {
      var spot = RZ.dropSpot(sim, call.x, call.y);
      if (!spot) return;
      var world = sim.world;
      var cell = spot.x + spot.y * world.w;
      var owner = world.safeMask[cell] ? world.safe[world.safeOwner[cell]].id : null;
      message.x = spot.x;
      message.y = spot.y;
      message.stash = owner;
      sim.crates.push({ x: spot.x, y: spot.y, stash: owner, lands: sim.tick + Math.round(sim.cfg.radio.crateFall * sim.cfg.sim.ticksPerSecond) });
      RZ.emit(sim, 'crate', { x: spot.x, y: spot.y });
    }
    r.inbox.push(message);
  }

  RZ.applyCalls = function (sim) {
    if (sim.script) {
      while (sim.scriptAt < sim.script.length && sim.script[sim.scriptAt].tick === sim.tick) {
        sim.callQueue.push(sim.script[sim.scriptAt++]);
      }
    }
    while (sim.callQueue.length) applyCall(sim, sim.callQueue.shift());
  };

  RZ.stepCrates = function (sim) {
    if (!sim.crates.length) return;
    sim.crates = sim.crates.filter(function (crate) {
      if (sim.tick < crate.lands) return true;
      var goods = sim.cfg.radio.crate;
      if (crate.stash) {
        var stash = sim.stashes[crate.stash];
        if (stash) RZ.GOODS.forEach(function (kind) { stash[kind] += goods[kind] || 0; });
      } else {
        RZ.addItem(sim, crate.x, crate.y, 'crate', 1);
      }
      RZ.emit(sim, 'crate-land', { x: crate.x, y: crate.y });
      return false;
    });
  };

  // Zero was right or wrong, and the line remembers. Called from ranger logic, so it takes the book.
  RZ.judgeZero = function (book, cfg, clock, right, amount, text) {
    var zero = book.zero;
    if (right) zero.right++;
    else zero.wrong++;
    zero.trust = Math.max(cfg.radio.trustMin, Math.min(cfg.radio.trustMax, zero.trust + (right ? amount : -amount)));
    if (text) RZ.writeEntry(book, clock, right ? 'zero-good' : 'zero-bad', text);
  };

  RZ.afterTideSignal = function (sim) {
    var c = sim.cfg.radio;
    sim.signal = Math.min(c.signalMax, sim.signal + c.signalPerTide);
  };
})();
