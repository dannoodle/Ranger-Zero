// Anomalies: pockets of mould the tide leaves behind. Each gives a visible tell at close range, if
// the ranger catches it in time. They move every tide, so a known position goes stale.

var RZ = RZ || {};

(function () {
  RZ.placeAnomalies = function (sim) {
    var c = sim.cfg.anomaly;
    var world = sim.world;
    var rng = sim.anomalyRng;
    sim.anomalies = [];

    function place(x, y) {
      if (x < 1 || y < 1 || x >= world.w - 1 || y >= world.h - 1) return false;
      var i = x + y * world.w;
      if (world.water[i] === 2 || world.huts[i] || world.nearSafe[i]) return false;
      sim.anomalies.push({ id: sim.nextAnomalyId++, x: x, y: y, spent: false });
      return true;
    }

    // The far points are the worst: pockets gather around each survey site.
    world.sites.forEach(function (site) {
      var wanted = c.aroundSite;
      for (var tries = wanted * 12; tries > 0 && wanted > 0; tries--) {
        var angle = rng.range(0, Math.PI * 2);
        var reach = rng.range(c.aroundSiteMin, c.aroundSiteMax);
        if (place(Math.round(site.x + Math.cos(angle) * reach), Math.round(site.y + Math.sin(angle) * reach))) wanted--;
      }
    });

    // Elsewhere they thicken with distance from home, since the tide comes from the edges.
    var left = c.count;
    for (var attempts = c.count * 30; attempts > 0 && left > 0; attempts--) {
      var x = rng.int(1, world.w - 2);
      var y = rng.int(1, world.h - 2);
      var dx = (x - world.home.x) / c.outerReach;
      var dy = (y - world.home.y) / c.outerReach;
      if (rng.next() > Math.min(1, dx * dx + dy * dy)) continue;
      if (place(x, y)) left--;
    }
  };

  // Stepping into a pocket hurts badly, and spends it.
  RZ.stepAnomalies = function (sim) {
    var r = sim.ranger;
    if (!r || !r.alive) return;
    var c = sim.cfg.anomaly;
    for (var i = 0; i < sim.anomalies.length; i++) {
      var a = sim.anomalies[i];
      if (a.spent) continue;
      if (Math.abs(a.x - r.x) > c.strikeRadius || Math.abs(a.y - r.y) > c.strikeRadius) continue;
      a.spent = true;
      r.struck = { x: a.x, y: a.y };
      RZ.emit(sim, 'strike', { x: a.x, y: a.y });
      RZ.hurtRanger(sim, r, sim.anomalyRng.int(c.damageMin, c.damageMax), 'anomaly');
      if (!r.alive) return;
      RZ.speak(sim, r, 'struck');
    }
  };

  RZ.senseAnomalies = function (sim, r, percept) {
    var c = sim.cfg.anomaly;
    var chance = r.careful ? c.carefulNoticeChance : c.noticeChance;
    var warnRadius = sim.cfg.radio.warnRadius;
    for (var i = 0; i < sim.anomalies.length; i++) {
      var a = sim.anomalies[i];
      if (a.spent) continue;
      if (Math.abs(a.x - r.x) > c.tellRange || Math.abs(a.y - r.y) > c.tellRange) continue;
      if (!RZ.canSee(sim, a.x, a.y)) continue;
      // A warned ranger is looking harder, so a warning near a pocket helps them spot its tell.
      var warned = r.map.warnings.some(function (mark) {
        return Math.abs(mark.x - r.x) <= warnRadius && Math.abs(mark.y - r.y) <= warnRadius;
      });
      if (sim.anomalyRng.chance(warned ? sim.cfg.radio.warnNoticeChance : chance)) percept.tellsSeen.push({ x: a.x, y: a.y });
    }
  };
})();
