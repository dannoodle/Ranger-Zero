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

  // Picks up everything on the ranger's cell that fits. Returns what was taken.
  RZ.pickUp = function (sim, r) {
    var cfg = sim.cfg;
    var taken = [];
    var spilled = [];
    sim.items = sim.items.filter(function (item) {
      if (item.x !== r.x || item.y !== r.y) return true;
      var spare = r.capacity - RZ.packWeight(cfg, r.pack);
      if (item.kind === 'crate') {
        spilled.push(item);
        taken.push('a crate');
        return false;
      }
      if (item.kind === 'weapon') {
        if (r.pack.weapons.indexOf(item.weapon) >= 0 || cfg.items.weapons[item.weapon].weight > spare) return true;
        r.pack.weapons.push(item.weapon);
        taken.push(item.weapon);
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
