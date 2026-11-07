// The camera. In auto it stays near the ranger and pulls back for the tide, so the whole map is on
// screen only when that's the interesting thing to look at. Drawing only: it reads sim state.

var RZ = RZ || {};

(function () {
  function Camera(sim) {
    this.sim = sim;
    this.mode = 'auto';      // auto, map or free
    this.follow = true;      // in free mode, whether it still tracks the ranger
    this.zoom = 1.6;
    this.zoomGoal = 1.6;
    this.x = sim.ranger.x;
    this.y = sim.ranger.y;
    this.shake = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.lastFocus = { x: sim.ranger.x, y: sim.ranger.y };
    this.wide = 0;           // seconds left of a forced wide shot
  }

  // Where the action is, and how close to stand.
  Camera.prototype.aim = function () {
    var sim = this.sim;
    var z = sim.cfg.look.zoom;
    var r = sim.ranger;
    var world = sim.world;
    var centre = { x: world.w / 2, y: world.h / 2 };
    if (this.wide > 0) return { x: centre.x, y: centre.y, zoom: 1 };
    if (!r.alive) return { x: this.lastFocus.x, y: this.lastFocus.y, zoom: z.dead };

    var focus = { x: r.x, y: r.y };
    if (r.path && r.pathAt < r.path.length) {
      var ahead = r.path[Math.min(r.path.length - 1, r.pathAt + 24)];
      focus.x += ((ahead % world.w) - r.x) * z.lookAhead;
      focus.y += (Math.floor(ahead / world.w) - r.y) * z.lookAhead;
    }
    this.lastFocus = { x: r.x, y: r.y };
    var cell = r.x + r.y * world.w;
    var inShelter = world.safeMask[cell] === 1;
    var tideOn = sim.tide.phase !== 'calm';
    if (inShelter && tideOn) {
      return { x: r.x + (centre.x - r.x) * 0.75, y: r.y + (centre.y - r.y) * 0.75, zoom: z.tide };
    }
    if (r.mode === 'fight' || r.mode === 'flee') return { x: focus.x, y: focus.y, zoom: z.fight };
    if (tideOn) return { x: focus.x, y: focus.y, zoom: z.caught };
    if (inShelter) return { x: focus.x, y: focus.y, zoom: z.shelter };
    return { x: focus.x, y: focus.y, zoom: z.road };
  };

  Camera.prototype.update = function (dt) {
    var z = this.sim.cfg.look.zoom;
    if (this.wide > 0) this.wide -= dt;
    var goal;
    if (this.mode === 'map') {
      goal = { x: this.sim.world.w / 2, y: this.sim.world.h / 2, zoom: 1 };
    } else if (this.mode === 'free') {
      var r = this.sim.ranger;
      goal = this.follow && r.alive ? { x: r.x, y: r.y, zoom: this.zoomGoal } : { x: this.x, y: this.y, zoom: this.zoomGoal };
    } else {
      goal = this.aim();
    }
    var pan = 1 - Math.exp(-dt * z.pan);
    var ease = 1 - Math.exp(-dt * z.ease);
    this.x += (goal.x - this.x) * pan;
    this.y += (goal.y - this.y) * pan;
    this.zoom += (goal.zoom - this.zoom) * ease;

    if (this.shake > 0.05) {
      var t = performance.now() * 0.05;
      this.shakeX = Math.sin(t * 1.3) * this.shake;
      this.shakeY = Math.cos(t * 1.7) * this.shake;
      this.shake *= Math.exp(-dt * 7);
    } else {
      this.shake = 0;
      this.shakeX = 0;
      this.shakeY = 0;
    }
  };

  Camera.prototype.bump = function (amount) {
    this.shake = Math.max(this.shake, amount);
  };

  Camera.prototype.setMode = function (mode) {
    this.mode = mode;
    if (mode === 'free') this.zoomGoal = this.zoom;
  };

  Camera.prototype.zoomBy = function (factor) {
    var z = this.sim.cfg.look.zoom;
    if (this.mode !== 'free') {
      this.mode = 'free';
      this.follow = true;
      this.zoomGoal = this.zoom;
    }
    this.zoomGoal = Math.max(z.min, Math.min(z.max, this.zoomGoal * factor));
  };

  Camera.prototype.drag = function (cellsX, cellsY) {
    if (this.mode !== 'free') {
      this.mode = 'free';
      this.zoomGoal = this.zoom;
    }
    this.follow = false;
    this.x -= cellsX;
    this.y -= cellsY;
  };

  RZ.makeCamera = function (sim) {
    return new Camera(sim);
  };
})();
