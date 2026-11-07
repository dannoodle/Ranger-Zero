// Chapters. After enough tides, or once a land is fully surveyed, a greater tide comes. It wipes the
// land: stashes are carried home, a new map rises, and the journal's map is blank again. Lessons,
// trust and the ranger under gold all survive it.

var RZ = RZ || {};

(function () {
  // Checked when a tide starts.
  RZ.greaterDue = function (sim) {
    var chapter = sim.chapter;
    return chapter.landDone || sim.tide.number - chapter.startTide >= sim.cfg.chapter.tides;
  };

  function landNames(world) {
    return world.safe.filter(function (safe) { return !safe.isHome; }).map(function (safe) { return safe.name; });
  }

  function rememberNames(sim) {
    var used = sim.usedNames;
    sim.world.safe.concat(sim.world.villages, sim.world.sites).forEach(function (place) { used[place.name] = true; });
  }

  function newWorld(sim, chapterNo) {
    var cfg = sim.cfg;
    rememberNames(sim);
    var world = null;
    for (var attempt = 0; attempt < 8; attempt++) {
      world = RZ.generateMap(cfg, sim.seed + chapterNo * cfg.chapter.seedStep + attempt * 7, sim.usedNames);
      if (!world.problems.length) break;
    }
    return world;
  }

  function shipHome(sim) {
    var home = sim.stashes.home;
    Object.keys(sim.stashes).forEach(function (id) {
      if (id === 'home') return;
      var stash = sim.stashes[id];
      RZ.GOODS.forEach(function (kind) { home[kind] += stash[kind]; });
      stash.weapons.forEach(function (name) { home.weapons.push(name); });
    });
    return home;
  }

  function closeChapter(sim) {
    var chapter = sim.chapter;
    var book = sim.book;
    var lost = sim.rangers.filter(function (record) { return record.chapter === chapter.no && record.cause; });
    var summary = {
      no: chapter.no,
      places: landNames(sim.world),
      tides: sim.tide.number - chapter.startTide,
      rangers: sim.rangers.filter(function (record) { return record.chapter === chapter.no; }).length,
      lost: lost.map(function (record) { return record.first; }),
      surveyed: chapter.surveyed || [],
      sites: book.sites.length,
      complete: chapter.landDone
    };
    sim.chapters.push(summary);
    return summary;
  }

  RZ.newLand = function (sim) {
    var cfg = sim.cfg;
    var summary = closeChapter(sim);
    var chapterNo = sim.chapter.no + 1;
    var world = newWorld(sim, chapterNo);
    var home = shipHome(sim);

    sim.world = world;
    sim.stashes = {};
    world.safe.forEach(function (safe) {
      sim.stashes[safe.id] = safe.isHome ? home : RZ.makeStash(null);
    });
    sim.view.stamp.fill(0);
    sim.view.count = 0;
    sim.view.x = null;
    sim.items = [];
    sim.scavs = [];
    sim.olds = [];
    sim.crates = [];
    sim.camps = [];
    sim.anomalies = [];
    sim.bodies = [];
    sim.lastSafe = null;
    sim.chapter = { no: chapterNo, startTide: sim.tide.number, startRanger: sim.rangerCount, landDone: false, surveyed: [] };

    RZ.newLandBook(sim.book, cfg, world, sim.tick);
    sim.book.mission.startRanger = sim.rangerCount;
    sim.book.mission.startTide = sim.tide.number;
    RZ.rebuildFront(sim);
    RZ.setupCamps(sim);
    RZ.spawnSalvage(sim);
    RZ.placeAnomalies(sim);

    var r = sim.ranger;
    var clock = { tick: sim.tick, seconds: sim.tick / cfg.sim.ticksPerSecond };
    var carried = r && r.alive;
    RZ.writeEntry(sim.book, clock, 'chapter', 'The greater tide. Everything we mapped is gone. What was under gold has been carried home, and there is new land out there.');
    if (carried) RZ.relocate(sim, r, world.safe[0]);
    RZ.emit(sim, 'chapter', { summary: summary, chapter: chapterNo, places: landNames(world) });
  };
})();
