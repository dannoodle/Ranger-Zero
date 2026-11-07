// What a ranger knows, and how they find things out.
//
// This is the only bridge between the real world and a ranger's head. sense() looks at the real
// world with line of sight and returns a percept. Ranger logic (brain.js, planner.js) receives the
// percept, their own map and the journal, and is never handed the sim.

var RZ = RZ || {};

(function () {
  // The ranger's map. Unseen ground has an assumed cost, so a route can cross it on a guess.
  RZ.makeKnowledge = function (cfg, w, h) {
    var map = {
      w: w,
      h: h,
      seen: new Uint8Array(w * h),
      cost: new Float32Array(w * h),
      elev: new Float32Array(w * h),
      route: new Float32Array(w * h),   // cost plus danger; what routes are planned over
      items: {},                        // cell index to a remembered item
      camps: [],
      patrols: [],                      // places a patrol has been seen walking
      anomalies: [],
      villages: {},
      warnings: [],                     // spots Zero has warned about
      dangerDirty: true,
      version: 0                        // goes up whenever the map changes
    };
    map.cost.fill(cfg.ranger.unknownCost);
    map.elev.fill(-1);
    return map;
  };

  RZ.copyKnowledge = function (map) {
    return {
      w: map.w,
      h: map.h,
      seen: map.seen.slice(),
      cost: map.cost.slice(),
      elev: map.elev.slice(),
      route: map.route.slice(),
      items: JSON.parse(JSON.stringify(map.items)),
      camps: JSON.parse(JSON.stringify(map.camps)),
      patrols: JSON.parse(JSON.stringify(map.patrols || [])),
      anomalies: JSON.parse(JSON.stringify(map.anomalies)),
      villages: JSON.parse(JSON.stringify(map.villages)),
      warnings: JSON.parse(JSON.stringify(map.warnings)),
      dangerDirty: true,
      version: 0
    };
  };

  // Marks every cell the ranger can see right now, stopping sight lines at ridges, trees and huts.
  function viewshed(sim, r) {
    var world = sim.world;
    var c = sim.cfg.ranger;
    var w = world.w;
    var h = world.h;
    var view = sim.view;
    view.generation++;
    view.count = 0;
    var eye = heightAt(world, r.x + r.y * w, c.heightScale) + c.eyeHeight;
    mark(view, r.x + r.y * w);
    for (var ray = 0; ray < c.rays; ray++) {
      var angle = (ray / c.rays) * Math.PI * 2;
      var dx = Math.cos(angle);
      var dy = Math.sin(angle);
      var horizon = -Infinity;
      for (var d = 1; d <= r.sight; d++) {
        var x = Math.round(r.x + dx * d);
        var y = Math.round(r.y + dy * d);
        if (x < 0 || y < 0 || x >= w || y >= h) break;
        var i = x + y * w;
        var ground = heightAt(world, i, c.heightScale);
        if ((ground - eye) / d >= horizon - 0.02) mark(view, i);
        var top = ground + (world.trees[i] ? c.treeHeight : 0) + (world.huts[i] ? c.hutHeight : 0);
        var slope = (top - eye) / d;
        if (slope > horizon) horizon = slope;
      }
    }
  }

  function heightAt(world, i, scale) {
    return Math.max(world.elev[i], world.seaLevel) * scale;
  }

  function mark(view, i) {
    if (view.stamp[i] === view.generation) return;
    view.stamp[i] = view.generation;
    view.cells[view.count++] = i;
  }

  // Ground the ranger is looking at goes on their map.
  function learnTerrain(sim, r) {
    var view = sim.view;
    var world = sim.world;
    var map = r.map;
    for (var n = 0; n < view.count; n++) {
      var i = view.cells[n];
      if (map.seen[i]) continue;
      map.seen[i] = 1;
      map.version++;
      r.freshGround++;
      map.cost[i] = world.moveCost[i];
      map.elev[i] = world.elev[i];
      map.dangerDirty = map.dangerDirty || world.moveCost[i] === Infinity;
      map.route[i] = world.moveCost[i];
      if (world.moveCost[i] === Infinity) r.pathSuspect = true;
    }
  }

  RZ.canSee = function (sim, x, y) {
    return sim.view.stamp[x + y * sim.world.w] === sim.view.generation;
  };

  // Everything the ranger notices this moment, built only from cells in view.
  RZ.sense = function (sim, r) {
    var world = sim.world;
    var view = sim.view;
    // Standing still, the view can't change, so the last one is still good.
    if (view.x !== r.x || view.y !== r.y || view.owner !== r.no) {
      view.x = r.x;
      view.y = r.y;
      view.owner = r.no;
      viewshed(sim, r);
      learnTerrain(sim, r);
    }
    var percept = { enemies: [], items: [], bodies: [], tide: null, hutsSeen: [], tellsSeen: [], radio: r.inbox, underfoot: null };
    r.inbox = [];
    var feet = r.x + r.y * world.w;
    percept.underfoot = world.water[feet] ? 'water' : (world.trees[feet] ? 'forest' : 'open');

    // The nearest tide in view. Rangers can always see it coming.
    if (RZ.tideActive(sim)) {
      var nearest = Infinity;
      for (var n = 0; n < view.count; n++) {
        var i = view.cells[n];
        if (!RZ.tideCovers(sim, i)) continue;
        var dx = (i % world.w) - r.x;
        var dy = Math.floor(i / world.w) - r.y;
        var d = dx * dx + dy * dy;
        if (d < nearest) {
          nearest = d;
          percept.tide = { x: r.x + dx, y: r.y + dy, distance: Math.sqrt(d) };
        }
      }
    }

    RZ.senseItems(sim, r, percept);
    RZ.senseBodies(sim, r, percept);
    RZ.senseEnemies(sim, r, percept);
    RZ.senseAnomalies(sim, r, percept);

    world.villages.forEach(function (village) {
      if (r.map.villages[village.id]) return;
      for (var h = 0; h < village.huts.length; h++) {
        if (view.stamp[village.huts[h]] === view.generation) {
          percept.hutsSeen.push({ id: village.id, name: village.name, x: village.x, y: village.y });
          break;
        }
      }
    });
    return percept;
  };
})();
