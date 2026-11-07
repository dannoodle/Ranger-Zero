// Map generation: elevation, water, trees, villages, home, outposts and survey sites.
// The result is the real map. Rangers never read it directly (see sense.js for what reaches them).

var RZ = RZ || {};

(function () {
  // Gradient noise, returning roughly -1..1.
  function makeNoise(rng) {
    var perm = [];
    for (var i = 0; i < 256; i++) perm.push(i);
    rng.shuffle(perm);
    perm = perm.concat(perm);
    var gradX = [1, -1, 1, -1, 1.41, -1.41, 0, 0];
    var gradY = [1, 1, -1, -1, 0, 0, 1.41, -1.41];

    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function corner(ix, iy, dx, dy) {
      var g = perm[(perm[ix & 255] + iy) & 511] & 7;
      return gradX[g] * dx + gradY[g] * dy;
    }

    return function (x, y) {
      var ix = Math.floor(x);
      var iy = Math.floor(y);
      var fx = x - ix;
      var fy = y - iy;
      var u = fade(fx);
      var v = fade(fy);
      var top = lerp(corner(ix, iy, fx, fy), corner(ix + 1, iy, fx - 1, fy), u);
      var bottom = lerp(corner(ix, iy + 1, fx, fy - 1), corner(ix + 1, iy + 1, fx - 1, fy - 1), u);
      return lerp(top, bottom, v);
    };
  }

  RZ.makeNoise = makeNoise;

  function fbm(noise, x, y, octaves) {
    var total = 0;
    var size = 1;
    var weight = 1;
    var sum = 0;
    for (var i = 0; i < octaves; i++) {
      total += noise(x * size + i * 17.3, y * size - i * 9.1) * weight;
      sum += weight;
      weight *= 0.5;
      size *= 2;
    }
    return total / sum;
  }

  function smoothstep(low, high, value) {
    var t = Math.max(0, Math.min(1, (value - low) / (high - low)));
    return t * t * (3 - 2 * t);
  }

  function percentile(field, fraction) {
    var sorted = Array.prototype.slice.call(field).sort(function (a, b) { return a - b; });
    return sorted[Math.floor(sorted.length * fraction)];
  }

  function buildElevation(world, cfg, rng) {
    var noise = makeNoise(rng);
    var m = cfg.map;
    var w = world.w;
    var h = world.h;
    var field = new Float32Array(w * h);
    var low = Infinity;
    var high = -Infinity;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var value = fbm(noise, x / m.elevationScale, y / m.elevationScale, m.elevationOctaves);
        field[x + y * w] = value;
        if (value < low) low = value;
        if (value > high) high = value;
      }
    }
    var homeX = world.home.x;
    var homeY = world.home.y;
    for (var i = 0; i < field.length; i++) {
      var e = (field[i] - low) / (high - low);
      var dx = (i % w) - homeX;
      var dy = Math.floor(i / w) - homeY;
      var near = 1 - smoothstep(m.homeFlatRadius * 0.6, m.homeFlatRadius * 1.6, Math.sqrt(dx * dx + dy * dy));
      field[i] = e + (m.homeElevation - e) * near;
    }
    world.elev = field;
  }

  function buildWater(world, cfg, rng) {
    var m = cfg.map;
    var w = world.w;
    var h = world.h;
    var water = new Uint8Array(w * h); // 0 land, 1 shallow, 2 deep
    world.seaLevel = percentile(world.elev, m.waterFraction);
    world.deepLevel = percentile(world.elev, m.deepFraction);
    for (var i = 0; i < water.length; i++) {
      if (world.elev[i] < world.deepLevel) water[i] = 2;
      else if (world.elev[i] < world.seaLevel) water[i] = 1;
    }
    world.water = water;

    // Rivers run downhill from high ground until they meet water or get stuck.
    var attempts = m.rivers * 12;
    var made = 0;
    while (attempts-- > 0 && made < m.rivers) {
      var x = rng.int(2, w - 3);
      var y = rng.int(2, h - 3);
      if (world.elev[x + y * w] < 0.62) continue;
      var course = traceRiver(world, x, y);
      if (course.length < m.riverMinLength) continue;
      for (var c = 0; c < course.length; c++) if (water[course[c]] === 0) water[course[c]] = 1;
      made++;
    }
  }

  function traceRiver(world, x, y) {
    var w = world.w;
    var h = world.h;
    var course = [];
    var visited = {};
    for (var step = 0; step < 300; step++) {
      var index = x + y * w;
      if (visited[index]) break;
      visited[index] = true;
      if (world.water[index] > 0) return course;
      course.push(index);
      var bestX = -1;
      var bestY = -1;
      var best = Infinity;
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          var nx = x + dx;
          var ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (visited[nx + ny * w]) continue;
          var e = world.elev[nx + ny * w];
          if (e < best) { best = e; bestX = nx; bestY = ny; }
        }
      }
      if (bestX < 0) break;
      x = bestX;
      y = bestY;
    }
    return course;
  }

  function buildTrees(world, cfg, rng) {
    var noise = makeNoise(rng);
    var m = cfg.map;
    var w = world.w;
    var trees = new Uint8Array(w * world.h);
    for (var i = 0; i < trees.length; i++) {
      if (world.water[i]) continue;
      var x = i % w;
      var y = Math.floor(i / w);
      var n = fbm(noise, x / m.forestScale, y / m.forestScale, 3) * 0.5 + 0.5;
      var density = smoothstep(m.forestLow, m.forestHigh, n) * m.forestDensity;
      density *= 1 - smoothstep(m.treelineElevation - 0.1, m.treelineElevation + 0.1, world.elev[i]);
      if (rng.chance(density)) trees[i] = 1;
    }
    world.trees = trees;
  }

  function buildSteepness(world, cfg) {
    var w = world.w;
    var h = world.h;
    var steep = new Float32Array(w * h);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var left = world.elev[Math.max(0, x - 1) + y * w];
        var right = world.elev[Math.min(w - 1, x + 1) + y * w];
        var up = world.elev[x + Math.max(0, y - 1) * w];
        var down = world.elev[x + Math.min(h - 1, y + 1) * w];
        steep[x + y * w] = Math.sqrt((right - left) * (right - left) + (down - up) * (down - up)) * 0.5 * cfg.terrain.steepnessScale;
      }
    }
    world.steep = steep;
  }

  // Marks everything a ranger could walk to from home.
  function reachableFrom(world, startIndex) {
    var w = world.w;
    var h = world.h;
    var seen = new Uint8Array(w * h);
    var stack = [startIndex];
    seen[startIndex] = 1;
    while (stack.length) {
      var index = stack.pop();
      var x = index % w;
      var y = Math.floor(index / w);
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          var nx = x + dx;
          var ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          var next = nx + ny * w;
          if (seen[next] || world.water[next] === 2) continue;
          seen[next] = 1;
          stack.push(next);
        }
      }
    }
    return seen;
  }

  // Good ground for a settlement or a site: dry, reachable, flat enough and away from the edge.
  function usable(world, cfg, reach, x, y, maxSteep) {
    var margin = cfg.map.edgeMargin;
    if (x < margin || y < margin || x >= world.w - margin || y >= world.h - margin) return false;
    var i = x + y * world.w;
    return reach[i] === 1 && world.water[i] === 0 && world.steep[i] <= maxSteep;
  }

  // Finds the nearest usable cell to (x, y), spiralling outwards.
  function nearestUsable(world, cfg, reach, x, y, maxSteep, limit) {
    for (var r = 0; r <= limit; r++) {
      for (var dy = -r; dy <= r; dy++) {
        for (var dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (usable(world, cfg, reach, x + dx, y + dy, maxSteep)) return { x: x + dx, y: y + dy };
        }
      }
    }
    return null;
  }

  function distance(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function clearTrees(world, x, y, radius) {
    for (var dy = -radius; dy <= radius; dy++) {
      for (var dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        var cx = x + dx;
        var cy = y + dy;
        if (cx < 0 || cy < 0 || cx >= world.w || cy >= world.h) continue;
        world.trees[cx + cy * world.w] = 0;
      }
    }
  }

  // Names not used in recent lands, as long as there are enough left to go round.
  function freshNames(world, list, wanted) {
    var fresh = list.filter(function (name) { return !world.usedNames[name]; });
    return fresh.length >= wanted ? fresh : list.slice();
  }

  function placeOutposts(world, cfg, rng, reach) {
    var m = cfg.map;
    var names = rng.shuffle(freshNames(world, cfg.names.outposts, m.outposts));
    var spin = rng.range(0, Math.PI * 2);
    for (var k = 0; k < m.outposts; k++) {
      var angle = spin + (k / m.outposts) * Math.PI * 2 + rng.range(-m.outpostJitter, m.outpostJitter);
      var x = Math.round(world.home.x + Math.cos(angle) * m.outpostRadius * m.outpostWidthStretch);
      var y = Math.round(world.home.y + Math.sin(angle) * m.outpostRadius);
      var spot = nearestUsable(world, cfg, reach, x, y, m.flatSteepness, 14) ||
                 nearestUsable(world, cfg, reach, x, y, 99, 30);
      if (!spot) {
        world.problems.push('no ground for outpost ' + k);
        continue;
      }
      world.safe.push({ id: 'o' + k, name: names[k], x: spot.x, y: spot.y, isHome: false });
    }
  }

  function placeVillages(world, cfg, rng, reach) {
    var m = cfg.map;
    var names = rng.shuffle(freshNames(world, cfg.names.villages, m.villages));
    var taken = world.safe.slice();
    var tries = 800;
    while (world.villages.length < m.villages && tries-- > 0) {
      var spot = { x: rng.int(m.edgeMargin, world.w - m.edgeMargin - 1), y: rng.int(m.edgeMargin, world.h - m.edgeMargin - 1) };
      if (!usable(world, cfg, reach, spot.x, spot.y, m.flatSteepness)) continue;
      if (distance(spot, world.home) < m.villageMinFromHome) continue;
      var crowded = false;
      for (var i = 0; i < taken.length; i++) if (distance(spot, taken[i]) < m.villageSpacing) crowded = true;
      if (crowded) continue;
      var village = { id: 'v' + world.villages.length, name: names[world.villages.length], x: spot.x, y: spot.y, huts: [] };
      buildHuts(world, cfg, rng, village);
      world.villages.push(village);
      taken.push(village);
    }
  }

  function buildHuts(world, cfg, rng, village) {
    var m = cfg.map;
    clearTrees(world, village.x, village.y, m.villageRadius + 1);
    var count = rng.int(m.hutsMin, m.hutsMax);
    for (var k = 0; k < count * 4 && village.huts.length < count; k++) {
      var x = village.x + rng.int(-m.villageRadius, m.villageRadius);
      var y = village.y + rng.int(-m.villageRadius, m.villageRadius);
      if (x < 0 || y < 0 || x >= world.w || y >= world.h) continue;
      var i = x + y * world.w;
      if (world.water[i] || world.huts[i]) continue;
      world.huts[i] = 1;
      village.huts.push(i);
    }
  }

  // Spreads survey sites far from home and far from each other.
  function placeSites(world, cfg, rng, reach) {
    var m = cfg.map;
    var names = rng.shuffle(freshNames(world, cfg.names.sites, m.surveySites));
    // Walking cost from the nearest safe house decides how hard a site is, not distance on the page.
    var sources = world.safe.map(function (safe) { return safe.x + safe.y * world.w; });
    var legCost = RZ.costField(world.w, world.h, world.moveCost, sources);
    var candidates = [];
    for (var k = 0; k < 2400; k++) {
      var spot = { x: rng.int(0, world.w - 1), y: rng.int(0, world.h - 1) };
      if (!usable(world, cfg, reach, spot.x, spot.y, 0.8)) continue;
      if (distance(spot, world.home) < m.surveyMinFromHome) continue;
      var leg = legCost[spot.x + spot.y * world.w];
      if (leg < m.surveyMinLeg || leg > m.surveyMaxLeg) continue;
      candidates.push(spot);
    }
    for (var s = 0; s < m.surveySites && candidates.length; s++) {
      var best = null;
      var bestScore = -1;
      for (var c = 0; c < candidates.length; c++) {
        var score = Infinity;
        for (var e = 0; e < world.sites.length; e++) score = Math.min(score, distance(candidates[c], world.sites[e]));
        for (var o = 1; o < world.safe.length; o++) score = Math.min(score, distance(candidates[c], world.safe[o]) * 1.5);
        if (score > bestScore) { bestScore = score; best = candidates[c]; }
      }
      world.sites.push({ id: 's' + s, name: names[s], x: best.x, y: best.y });
    }
    if (world.sites.length < m.surveySites) world.problems.push('only ' + world.sites.length + ' survey sites placed');
  }

  function buildMoveCost(world, cfg) {
    var t = cfg.terrain;
    var cost = new Float32Array(world.w * world.h);
    for (var i = 0; i < cost.length; i++) {
      if (world.water[i] === 2) { cost[i] = Infinity; continue; }
      var c = 1 + world.steep[i] * t.slopeCost;
      if (world.trees[i]) c *= t.treeCost;
      if (world.water[i] === 1) c *= t.shallowCost;
      if (world.huts[i]) c *= t.hutCost;
      cost[i] = c;
    }
    world.moveCost = cost;
  }

  // Marks the cells inside each safe house's ring, and a wider band that hazards keep clear of.
  function buildSafeMasks(world, cfg) {
    var w = world.w;
    var h = world.h;
    var radius = cfg.safe.radius;
    var clear = cfg.anomaly.clearOfSafe;
    world.safeMask = new Uint8Array(w * h);
    world.safeOwner = new Int8Array(w * h).fill(-1);
    world.nearSafe = new Uint8Array(w * h);
    world.safe.forEach(function (safe, owner) {
      for (var dy = -clear; dy <= clear; dy++) {
        for (var dx = -clear; dx <= clear; dx++) {
          var x = safe.x + dx;
          var y = safe.y + dy;
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          var d = Math.sqrt(dx * dx + dy * dy);
          var i = x + y * w;
          if (d <= clear) world.nearSafe[i] = 1;
          if (d <= radius) {
            world.safeMask[i] = 1;
            world.safeOwner[i] = owner;
          }
        }
      }
    });
  }

  RZ.generateMap = function (cfg, seed, usedNames) {
    var rng = RZ.makeRng(seed).fork('map');
    var w = cfg.map.width;
    var h = cfg.map.height;
    var world = {
      w: w,
      h: h,
      seed: seed,
      home: { x: Math.floor(w / 2), y: Math.floor(h / 2) },
      safe: [],
      villages: [],
      sites: [],
      huts: new Uint8Array(w * h),
      usedNames: usedNames || {},
      problems: []
    };
    buildElevation(world, cfg, rng.fork('elevation'));
    buildWater(world, cfg, rng.fork('water'));
    buildTrees(world, cfg, rng.fork('trees'));
    buildSteepness(world, cfg);

    var home = { id: 'home', name: 'Home', x: world.home.x, y: world.home.y, isHome: true };
    world.safe.push(home);
    world.water[home.x + home.y * w] = 0;
    var reach = reachableFrom(world, home.x + home.y * w);

    placeOutposts(world, cfg, rng.fork('outposts'), reach);
    placeVillages(world, cfg, rng.fork('villages'), reach);
    for (var s = 0; s < world.safe.length; s++) clearTrees(world, world.safe[s].x, world.safe[s].y, 4);
    buildMoveCost(world, cfg);
    placeSites(world, cfg, rng.fork('sites'), reach);
    buildSafeMasks(world, cfg);
    world.reach = reach;
    return world;
  };
})();
