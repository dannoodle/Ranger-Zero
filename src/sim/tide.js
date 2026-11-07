// The violet tide. Each cell has a threshold: how far the tide must rise to reach it. Thresholds are
// spread out from the map's edges, slowed by height, so valleys flood first and ridges last.

var RZ = RZ || {};

(function () {
  RZ.makeTide = function (sim) {
    var tide = {
      phase: 'calm',
      level: 0,
      number: 0,
      timer: 0,
      front: null,
      rng: sim.rng.fork('tide')
    };
    tide.timer = calmTicks(sim, tide);
    buildFront(sim, tide);
    return tide;
  };

  function ticks(sim, seconds) {
    return Math.round(seconds * sim.cfg.sim.ticksPerSecond);
  }

  function calmTicks(sim, tide) {
    var c = sim.cfg.tide;
    return ticks(sim, c.calm * (1 + tide.rng.range(-c.calmJitter, c.calmJitter)));
  }

  // A new front every tide, so each one finds a slightly different way in.
  function buildFront(sim, tide) {
    var world = sim.world;
    var c = sim.cfg.tide;
    var w = world.w;
    var h = world.h;
    var noise = RZ.makeNoise(tide.rng);
    var spread = new Float32Array(w * h);
    var sources = [];
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i = x + y * w;
        if (world.safeMask[i]) {
          spread[i] = Infinity;
          continue;
        }
        var height = Math.max(0, world.elev[i] - world.seaLevel);
        var wobble = (noise(x / c.noiseScale, y / c.noiseScale) + 1) * c.noiseDrag;
        spread[i] = (1 + height * c.elevationDrag + wobble) * (world.water[i] ? c.waterDrag : 1);
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) sources.push(i);
      }
    }
    var field = RZ.costField(w, h, spread, sources);
    var most = 0;
    for (var n = 0; n < field.length; n++) if (field[n] !== Infinity && field[n] > most) most = field[n];
    for (var m = 0; m < field.length; m++) field[m] = field[m] === Infinity ? 2 : field[m] / most;
    tide.front = field;
  }

  RZ.rebuildFront = function (sim) {
    buildFront(sim, sim.tide);
  };

  RZ.tideActive = function (sim) {
    return sim.tide.phase !== 'calm';
  };

  RZ.tideCovers = function (sim, i) {
    return sim.tide.level > sim.tide.front[i];
  };

  RZ.stepTide = function (sim) {
    var tide = sim.tide;
    var c = sim.cfg.tide;
    tide.timer--;

    if (tide.phase === 'surge') tide.level = Math.min(1.001, tide.level + 1.001 / ticks(sim, c.surge));
    else if (tide.phase === 'retreat') tide.level = Math.max(0, tide.level - 1.001 / ticks(sim, c.retreat));

    if (tide.phase !== 'calm' && sim.tick % 5 === 0) RZ.digest(sim);
    if (tide.timer > 0) return;

    if (tide.phase === 'calm') {
      tide.phase = 'surge';
      tide.number++;
      tide.greater = RZ.greaterDue(sim);
      tide.timer = ticks(sim, c.surge);
      RZ.emit(sim, 'tide', { number: tide.number, greater: tide.greater });
    } else if (tide.phase === 'surge') {
      tide.phase = 'hold';
      tide.timer = ticks(sim, c.hold);
    } else if (tide.phase === 'hold') {
      tide.phase = 'retreat';
      tide.timer = ticks(sim, c.retreat);
      if (tide.greater) {
        tide.greater = false;
        RZ.newLand(sim);
      }
    } else {
      tide.phase = 'calm';
      tide.level = 0;
      tide.timer = calmTicks(sim, tide);
      buildFront(sim, tide);
      RZ.afterTide(sim);
    }
  };
})();
