// Seeded random numbers. All randomness in the sim comes from here, never Math.random.
// Each system forks its own named stream, so a change to combat can't reshuffle the map.

var RZ = RZ || {};

(function () {
  function hashString(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function Rng(seed, label) {
    this.seedValue = seed;
    this.label = label;
    // mulberry32 state
    this.state = (hashString(String(seed) + ':' + label) + 0x9e3779b9) >>> 0;
    for (var i = 0; i < 4; i++) this.next();
  }

  Rng.prototype.next = function () {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    var t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // A float in [low, high).
  Rng.prototype.range = function (low, high) {
    return low + this.next() * (high - low);
  };

  // A whole number from low to high, both included.
  Rng.prototype.int = function (low, high) {
    return low + Math.floor(this.next() * (high - low + 1));
  };

  Rng.prototype.chance = function (p) {
    return this.next() < p;
  };

  Rng.prototype.pick = function (list) {
    return list[Math.floor(this.next() * list.length)];
  };

  Rng.prototype.shuffle = function (list) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(this.next() * (i + 1));
      var swap = list[i];
      list[i] = list[j];
      list[j] = swap;
    }
    return list;
  };

  // A separate stream with its own sequence, derived from the same seed.
  Rng.prototype.fork = function (label) {
    return new Rng(this.seedValue, this.label + '/' + label);
  };

  RZ.makeRng = function (seed) {
    return new Rng(seed, 'root');
  };

  RZ.hashString = hashString;
})();
