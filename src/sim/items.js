// Items: what lies on the map, what a ranger carries, what's held in stashes.

var RZ = RZ || {};

(function () {
  // A relic is the thing a Retrieve objective is after. It's carried like any other good.
  var GOODS = ['food', 'ammo', 'med', 'loot', 'grenade', 'relic'];
  RZ.GOODS = GOODS;

  RZ.emptyPack = function () {
    return { food: 0, ammo: 0, med: 0, loot: 0, grenade: 0, relic: 0, weapons: [] };
  };

  RZ.packWeight = function (cfg, pack) {
    var c = cfg.items;
    var weight = 0;
    GOODS.forEach(function (kind) { weight += pack[kind] * c.weights[kind]; });
    pack.weapons.forEach(function (name) { weight += c.weapons[name].weight; });
    return weight;
  };

  // Gear counts for the respawn rule; loot doesn't.
  RZ.holdsGear = function (pack) {
    return pack.food + pack.ammo + pack.med + pack.grenade > 0 || pack.weapons.length > 0;
  };

  // Somewhere a ranger can start out with nothing: gear to go on, and food to wait on.
  RZ.canStartAt = function (stash) {
    return !!stash && stash.food > 0 && RZ.holdsGear(stash);
  };

  RZ.bestWeapon = function (cfg, weapons) {
    var best = null;
    weapons.forEach(function (name) {
      if (!best || cfg.items.weapons[name].rank > cfg.items.weapons[best].rank) best = name;
    });
    return best;
  };

  // Expected damage per second from one gun at this distance, allowing for the rounds left.
  RZ.gunRate = function (gun, distance, ammo) {
    if (distance > gun.range || ammo <= 0) return 0;
    var rounds = Math.min(gun.burst || 1, ammo);
    var perRound = gun.hit * (1 - gun.falloff * (distance / gun.range)) * (gun.damageMin + gun.damageMax) / 2;
    return perRound * rounds / gun.reload;
  };

  // The carried gun that does the most at this distance, or null if none reach.
  RZ.pickWeapon = function (cfg, weapons, distance, ammo) {
    var best = null;
    var bestRate = 0;
    weapons.forEach(function (name) {
      var rate = RZ.gunRate(cfg.items.weapons[name], distance, ammo);
      if (rate > bestRate) { best = name; bestRate = rate; }
    });
    return best;
  };

  // How far the furthest-reaching carried gun can shoot.
  RZ.gunReach = function (cfg, weapons) {
    var reach = 0;
    weapons.forEach(function (name) { reach = Math.max(reach, cfg.items.weapons[name].range); });
    return reach;
  };

  function addItem(sim, x, y, kind, qty, weapon) {
    sim.items.push({ id: sim.nextItemId++, x: x, y: y, kind: kind, qty: qty, weapon: weapon || null });
  }
  RZ.addItem = addItem;

  function rollItem(sim, rng, x, y) {
    var c = sim.cfg.items;
    var total = 0;
    var kinds = Object.keys(c.finds);
    kinds.forEach(function (kind) { total += c.finds[kind].chance; });
    var roll = rng.range(0, total);
    for (var k = 0; k < kinds.length; k++) {
      var find = c.finds[kinds[k]];
      roll -= find.chance;
      if (roll > 0) continue;
      if (c.weapons[kinds[k]]) addItem(sim, x, y, 'weapon', 1, kinds[k]);
      else addItem(sim, x, y, kinds[k], rng.int(find.min, find.max));
      return;
    }
  }

  function dryLandNear(sim, rng, x, y, radius) {
    var world = sim.world;
    for (var tries = 0; tries < 12; tries++) {
      var cx = x + rng.int(-radius, radius);
      var cy = y + rng.int(-radius, radius);
      if (cx < 0 || cy < 0 || cx >= world.w || cy >= world.h) continue;
      var i = cx + cy * world.w;
      if (!world.water[i] && !world.huts[i] && !world.safeMask[i] && world.reach[i]) return { x: cx, y: cy };
    }
    return null;
  }

  // Picking up a crate spills it straight into the pack. What doesn't fit stays on the ground.
  function openCrate(sim, r, item) {
    var cfg = sim.cfg;
    var goods = cfg.radio.crate;
    GOODS.forEach(function (kind) {
      var amount = goods[kind] || 0;
      var spare = r.capacity - RZ.packWeight(cfg, r.pack);
      var fits = Math.min(amount, Math.floor(spare / cfg.items.weights[kind] + 1e-6));
      r.pack[kind] += fits;
      if (fits < amount) addItem(sim, item.x, item.y, kind, amount - fits);
    });
  }

  // Each tide leaves salvage behind: the villages turn up more, and a little is scattered in the open.
  RZ.spawnSalvage = function (sim) {
    var c = sim.cfg.items;
    var world = sim.world;
    var rng = sim.itemRng;
    world.villages.forEach(function (village) {
      for (var n = 0; n < c.villageFinds; n++) {
        var spot = dryLandNear(sim, rng, village.x, village.y, sim.cfg.map.villageRadius);
        if (spot) rollItem(sim, rng, spot.x, spot.y);
      }
    });
    for (var s = 0; s < c.scatterFinds; s++) {
      var open = dryLandNear(sim, rng, rng.int(0, world.w - 1), rng.int(0, world.h - 1), 2);
      if (open) rollItem(sim, rng, open.x, open.y);
    }
  };

  // The tide eats anything left in the open as it passes, except a relic, which it can't digest.
  RZ.digest = function (sim) {
    var world = sim.world;
    sim.items = sim.items.filter(function (item) { return item.kind === 'relic' || !RZ.tideCovers(sim, item.x + item.y * world.w); });
    sim.bodies = sim.bodies.filter(function (body) {
      if (!RZ.tideCovers(sim, body.x + body.y * world.w)) return true;
      sim.stats.bodiesLost++;
      RZ.raiseOldSelf(sim, body);
      return false;
    });
  };

  RZ.senseItems = function (sim, r, percept) {
    var w = sim.world.w;
    var remembered = r.map.items;
    var here = {};
    sim.items.forEach(function (item) {
      if (!RZ.canSee(sim, item.x, item.y)) return;
      var cell = item.x + item.y * w;
      here[cell] = true;
      remembered[cell] = { x: item.x, y: item.y, kind: item.kind, qty: item.qty, weapon: item.weapon };
      percept.items.push(remembered[cell]);
    });
    Object.keys(remembered).forEach(function (key) {
      var cell = Number(key);
      if (!here[cell] && sim.view.stamp[cell] === sim.view.generation) delete remembered[key];
    });
  };

  RZ.senseBodies = function (sim, r, percept) {
    sim.bodies.forEach(function (body) {
      if (!RZ.canSee(sim, body.x, body.y)) return;
      percept.bodies.push({ x: body.x, y: body.y, no: body.no, first: body.first });
    });
  };

  // Where a gun a ranger picks up would go: into the pack if it adds something and fits, or else into
  // the spare slot, which carries one gun of any weight on the way to the next safe house. Not a pistol: there
  // are pistols in every stash already. Null if it goes nowhere.
  RZ.slotFor = function (cfg, r, name) {
    var gun = cfg.items.weapons[name];
    var free = r.capacity - RZ.packWeight(cfg, r.pack);
    var adds = r.pack.weapons.indexOf(name) < 0 && RZ.spareGuns(cfg, r.pack.weapons.concat([name])).indexOf(name) < 0;
    if (adds && gun.weight <= free) return 'pack';
    if (!r.spare && name !== 'pistol') return 'spare';
    return null;
  };

  // Worth leaving loot or spare rounds behind for. So is a better gun.
  RZ.MAKES_ROOM = { food: true, med: true, grenade: true };

  // Guns that another carried gun beats at every distance, so they're only weight. A rifle makes a
  // pistol spare. Nothing makes a shotgun spare, because nothing hits as hard up close.
  RZ.spareGuns = function (cfg, weapons) {
    var guns = cfg.items.weapons;
    return weapons.filter(function (name) {
      var gun = guns[name];
      return weapons.some(function (other) {
        if (other === name || guns[other].rank <= gun.rank) return false;
        for (var d = 1; d <= gun.range; d++) {
          if (RZ.gunRate(guns[other], d, 99) < RZ.gunRate(gun, d, 99)) return false;
        }
        return true;
      });
    });
  };

  // Weight a ranger could free by leaving loot, spare guns and any rounds over `keep`.
  RZ.roomToMake = function (cfg, pack, keep) {
    var w = cfg.items.weights;
    var guns = 0;
    RZ.spareGuns(cfg, pack.weapons).forEach(function (name) { guns += cfg.items.weapons[name].weight; });
    return pack.loot * w.loot + guns + Math.max(0, pack.ammo - keep) * w.ammo;
  };

  // Makes room for what's on this cell, leaving loot first, then spare guns, then spare rounds. Returns
  // a function that puts them on the ground, called after the pick-up so they aren't taken straight back.
  function makeRoom(sim, r, keep) {
    var cfg = sim.cfg;
    var w = cfg.items.weights;
    var wanted = 0;
    sim.items.forEach(function (item) {
      if (item.x !== r.x || item.y !== r.y) return;
      if (item.kind === 'weapon') {
        var gun = cfg.items.weapons[item.weapon];
        var better = !r.weapon || gun.rank > cfg.items.weapons[r.weapon].rank;
        if (better && r.pack.weapons.indexOf(item.weapon) < 0) wanted += gun.weight;
      } else if (RZ.MAKES_ROOM[item.kind]) wanted += item.qty * w[item.kind];
    });
    var short = wanted - (r.capacity - RZ.packWeight(cfg, r.pack));
    if (short <= 0) return null;
    var loot = Math.min(r.pack.loot, Math.ceil(short / w.loot - 1e-6));
    short -= loot * w.loot;
    var guns = [];
    RZ.spareGuns(cfg, r.pack.weapons).forEach(function (name) {
      if (short <= 0) return;
      guns.push(name);
      short -= cfg.items.weapons[name].weight;
    });
    var rounds = short > 0 ? Math.min(Math.max(0, r.pack.ammo - keep), Math.ceil(short / w.ammo - 1e-6)) : 0;
    r.pack.loot -= loot;
    r.pack.ammo -= rounds;
    r.pack.weapons = r.pack.weapons.filter(function (name) { return guns.indexOf(name) < 0; });
    return function () {
      if (loot > 0) addItem(sim, r.x, r.y, 'loot', loot);
      if (rounds > 0) addItem(sim, r.x, r.y, 'ammo', rounds);
      guns.forEach(function (name) { addItem(sim, r.x, r.y, 'weapon', 1, name); });
    };
  }

  // Picks up everything on the ranger's cell that fits. Given `keep`, loot and any rounds over that
  // number are left behind to make room for food, medkits, grenades or a better gun. Returns what was taken.
  RZ.pickUp = function (sim, r, keep) {
    var cfg = sim.cfg;
    var taken = [];
    var spilled = [];
    var leave = keep === undefined ? null : makeRoom(sim, r, keep);
    sim.items = sim.items.filter(function (item) {
      if (item.x !== r.x || item.y !== r.y) return true;
      var spare = r.capacity - RZ.packWeight(cfg, r.pack);
      if (item.kind === 'crate') {
        spilled.push(item);
        taken.push('a crate');
        return false;
      }
      if (item.kind === 'weapon') {
        var slot = RZ.slotFor(cfg, r, item.weapon);
        if (!slot) return true;
        if (slot === 'pack') {
          r.pack.weapons.push(item.weapon);
          taken.push(item.weapon);
        } else {
          r.spare = item.weapon;
          taken.push('a spare ' + item.weapon);
        }
        return false;
      }
      // A ranger always makes room for a relic.
      var fits = item.kind === 'relic' ? item.qty : Math.min(item.qty, Math.floor(spare / cfg.items.weights[item.kind]));
      if (fits <= 0) return true;
      r.pack[item.kind] += fits;
      if (item.kind === 'relic') {
        taken.push('relic');
        RZ.relicTaken(sim, item);
      } else if (item.kind === 'grenade') taken.push(fits === 1 ? 'a grenade' : fits + ' grenades');
      else taken.push(fits + ' ' + item.kind);
      item.qty -= fits;
      return item.qty > 0;
    });
    spilled.forEach(function (item) { openCrate(sim, r, item); });
    if (leave) leave();
    return taken;
  };

  RZ.makeStash = function (start) {
    var stash = RZ.emptyPack();
    if (start) {
      GOODS.forEach(function (kind) { stash[kind] = start[kind] || 0; });
    }
    return stash;
  };

  RZ.copyPack = function (pack) {
    return { food: pack.food, ammo: pack.ammo, med: pack.med, loot: pack.loot, grenade: pack.grenade || 0, relic: pack.relic || 0, weapons: pack.weapons.slice() };
  };
})();
