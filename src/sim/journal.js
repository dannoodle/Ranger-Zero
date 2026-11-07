// The journal: what the line of rangers has learned, passed from each to the next.
// It holds the shared map, a ledger of stashes, tide timings, the lessons from every failure, and
// the written log. It's built from plain copies, so ranger logic can't reach the real world through it.

var RZ = RZ || {};

(function () {
  RZ.makeBook = function (cfg, world, rng) {
    var book = {
      map: RZ.makeKnowledge(cfg, world.w, world.h),
      places: world.safe.map(function (safe) {
        return { id: safe.id, name: safe.name, x: safe.x, y: safe.y, isHome: safe.isHome };
      }),
      sites: world.sites.map(function (site) {
        return { id: site.id, name: site.name, x: site.x, y: site.y };
      }),
      siteAt: 0,
      landDone: false,
      round: 1,
      mission: null,
      stashes: {},
      tide: {
        active: false,
        lastClear: 0,
        window: cfg.planner.tideGuess,
        samples: 0,
        lastSeen: -1000
      },
      lessons: { tideMargin: cfg.lessons.tideMarginStart, nerve: 1, foodExtra: 0, ammoExtra: 0, medExtra: 0, careful: false },
      patience: 0,
      zero: { trust: cfg.radio.trustStart, right: 0, wrong: 0, calls: 0 },
      graves: [],
      lastName: null,
      body: null,
      pendingLesson: null,
      lastLoss: null,
      entries: [],
      rng: rng
    };
    startMission(book, 0);
    return book;
  };

  // New land: nothing the journal knew about the ground still holds, but the lessons do.
  RZ.newLandBook = function (book, cfg, world, tick) {
    book.map = RZ.makeKnowledge(cfg, world.w, world.h);
    book.places = world.safe.map(function (safe) {
      return { id: safe.id, name: safe.name, x: safe.x, y: safe.y, isHome: safe.isHome };
    });
    book.sites = world.sites.map(function (site) {
      return { id: site.id, name: site.name, x: site.x, y: site.y };
    });
    book.siteAt = 0;
    book.landDone = false;
    book.stashes = {};
    book.graves = [];
    book.body = null;
    book.patience = 0;
    book.lastLoss = null;
    book.zero.turnback = null;
    startMission(book, tick);
  };

  function startMission(book, tick) {
    var site = book.sites[book.siteAt];
    book.mission = {
      id: site.id, name: site.name, x: site.x, y: site.y,
      attempts: 0, startTick: tick
    };
  }

  RZ.nextMission = function (book, tick) {
    book.siteAt++;
    if (book.siteAt >= book.sites.length) {
      book.siteAt = 0;
      book.round++;
    }
    startMission(book, tick);
  };

  RZ.writeEntry = function (book, clock, kind, text) {
    book.entries.push({ tick: clock.tick, kind: kind, text: text });
  };

  function times(n) {
    if (n === 1) return 'once';
    if (n === 2) return 'twice';
    return n + ' times';
  }

  // A span of ticks in the unit rangers think in.
  RZ.tideSpan = function (cfg, ticks) {
    var c = cfg.tide;
    var seconds = ticks / cfg.sim.ticksPerSecond;
    var tides = Math.max(1, Math.round(seconds / (c.calm + c.surge + c.hold + c.retreat)));
    return tides === 1 ? 'one tide' : tides + ' tides';
  };

  // The name of the closest place the journal knows.
  RZ.nearestName = function (book, map, x, y) {
    var bestName = null;
    var best = Infinity;
    function consider(place, label) {
      var dx = place.x - x;
      var dy = place.y - y;
      var d = dx * dx + dy * dy;
      if (d < best) { best = d; bestName = label; }
    }
    book.places.forEach(function (place) { consider(place, place.name); });
    consider(book.mission, book.mission.name);
    Object.keys(map.villages).forEach(function (id) { consider(map.villages[id], map.villages[id].name); });
    return bestName;
  };

  function say(book, options) {
    return book.rng.pick(options);
  }

  function campNear(map, x, y, reach) {
    var found = null;
    var best = reach * reach;
    map.camps.forEach(function (camp) {
      var dx = camp.x - x;
      var dy = camp.y - y;
      var d = dx * dx + dy * dy;
      if (d <= best) { best = d; found = camp; }
    });
    return found;
  }
  RZ.campNear = campNear;

  // A death is written down, and the journal decides what the next ranger should do differently.
  // The lesson is what makes the next plan change: the planner reads book.lessons.
  RZ.learnFromDeath = function (book, cfg, r, cause, clock) {
    var c = cfg.lessons;
    var lessons = book.lessons;
    var place = RZ.nearestName(book, r.map, r.x, r.y);
    var low = r.pack.ammo < c.lowAmmo;
    var lesson = '';
    var headline = '';

    if (cause === 'tide') {
      headline = RZ.who(r) + ', was caught by the tide near ' + place + '.';
      lessons.tideMargin = Math.min(c.tideMarginMax, lessons.tideMargin + c.tideMarginStep);
      lessons.nerve = Math.max(c.nerveMin, lessons.nerve * c.nerveLoss);
      lesson = say(book, ['The tide comes sooner than we allow for. Keeping a wider margin.',
                          'We cut it too fine. Turning back earlier from now on.',
                          'Giving the tide more respect. Leaving more time to get under gold.']);
    } else if (cause === 'starved') {
      headline = RZ.who(r) + ', starved near ' + place + '.';
      lessons.foodExtra = Math.min(c.foodExtraMax, lessons.foodExtra + 1);
      lesson = 'Food ran out too far from a stash. Carrying ' + lessons.foodExtra + ' more than the walk should need.';
    } else if (cause === 'scavenger') {
      var camp = campNear(r.map, r.x, r.y, 22);
      var name = camp ? 'the ' + camp.name + ' camp' : 'scavengers';
      headline = RZ.who(r) + ', was shot by ' + name + ' near ' + place + '.';
      if (camp) {
        camp.beatUs = (camp.beatUs || 0) + 1;
        if (low) camp.lowAmmo = (camp.lowAmmo || 0) + 1;
        r.map.dangerDirty = true;
      }
      if (low) {
        lessons.ammoExtra = Math.min(c.ammoExtraMax, lessons.ammoExtra + c.ammoStep);
        var wording = '';
        if (camp) {
          var every = camp.lowAmmo === camp.beatUs;
          if (camp.beatUs === 1) wording = ', and we were low on ammo';
          else if (camp.beatUs === 2 && every) wording = ', both times low on ammo';
          else if (every) wording = ', every time low on ammo';
          else wording = ', ' + times(camp.lowAmmo) + ' low on ammo';
        }
        lesson = (camp ? name.charAt(0).toUpperCase() + name.slice(1) + ' has beaten us ' + times(camp.beatUs) + wording + '. '
                       : 'Ran dry in a fight. ') +
                 'Moving ' + (cfg.planner.ammoBase + lessons.ammoExtra) + ' rounds forward first.';
      } else if (r.pack.med === 0 && lessons.medExtra < c.medExtraMax) {
        lessons.medExtra++;
        lesson = 'Had rounds left but nothing to stop the bleeding. Carrying ' + (cfg.planner.medBase + lessons.medExtra) + ' medkits from now on.';
      } else {
        lesson = camp ? 'We lost that fight with gear to spare. Going around ' + camp.name + ' next time.'
                      : 'Nothing to do but go around them.';
      }
    } else if (cause === 'anomaly') {
      headline = RZ.who(r) + ', walked into a pocket near ' + place + '.';
      if (!lessons.careful) {
        lessons.careful = true;
        lesson = 'Never saw the tell. Walking slower on ground the tide has crossed, and watching for the shimmer.';
      } else {
        lessons.medExtra = Math.min(c.medExtraMax, lessons.medExtra + 1);
        lesson = 'Careful wasn\'t enough. One more medkit in the pack for the next pocket.';
      }
    } else if (cause === 'oldself') {
      headline = RZ.who(r) + ', was killed by something wearing a ranger\'s coat near ' + place + '.';
      lesson = 'What the tide takes doesn\'t always stay down. Burn nothing, leave nothing, and shoot first.';
    } else {
      headline = RZ.who(r) + ', died near ' + place + '.';
    }

    if (r.orderedOn) {
      RZ.judgeZero(book, cfg, clock, false, cfg.radio.trustPushDeath,
        'Zero told ' + r.first + ' to push on. ' + r.first + ' is dead. Whoever reads this, remember that.');
    }

    RZ.writeEntry(book, clock, 'death', headline);
    book.pendingLesson = lesson;
    book.lastLoss = { no: r.no, first: r.first, cause: cause, place: place, camp: cause === 'scavenger' ? campNear(r.map, r.x, r.y, 22) : null };
    book.lastName = r.first;
    book.graves.push({ x: r.x, y: r.y, no: r.no, first: r.first, name: r.name, cause: cause });
    return place;
  };

  // Why this stocking run matters, in words that follow from what went wrong last.
  RZ.stockReason = function (book) {
    var loss = book.lastLoss;
    var site = book.mission.name;
    if (loss && loss.camp && loss.camp.beatUs > 0) {
      return say(book, ['The ' + loss.camp.name + ' camp has cost us ' + times(loss.camp.beatUs) + ' already, so whoever goes next goes loaded.',
                        'Not going near ' + loss.camp.name + ' again without it.']);
    }
    if (loss && loss.cause === 'anomaly') {
      return say(book, [loss.first + ' lost everything to a pocket. It all has to be carried up again.',
                        'The pockets out past ' + loss.place + ' keep taking our gear.']);
    }
    if (loss && loss.cause === 'tide') {
      return say(book, [loss.first + ' left everything in the violet. Starting that stash again.',
                        'The tide took the last load with ' + loss.first + '.']);
    }
    return say(book, [site + ' is too far from home, so that stash has to carry the attempt.',
                      'Nobody reaches ' + site + ' from home in one go.',
                      'The stash there is what makes ' + site + ' possible.']);
  };

  // A note on how this attempt differs from the ones that failed.
  RZ.attemptNote = function (book, map) {
    var avoided = map.camps.filter(function (camp) { return (camp.beatUs || 0) > 0; });
    var notes = [];
    var last = avoided[avoided.length - 1];
    if (last && last.name !== book.mission.name) notes.push('Going around ' + last.name + ' this time.');
    else if (last) notes.push('The camp there has beaten us ' + times(last.beatUs) + '.');
    if (book.lessons.careful) notes.push('Watching for the shimmer.');
    return notes.join(' ');
  };

  RZ.commitMap = function (book, r) {
    book.map = RZ.copyKnowledge(r.map);
  };
})();
