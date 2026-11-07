// Drawing. Reads sim state and never changes it. Everything here can be replaced without touching the sim.

var RZ = RZ || {};

(function () {
  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  function tintFor(look, e) {
    var stops = look.tint;
    var at = Math.max(0, Math.min(0.9999, e)) * (stops.length - 1);
    var i = Math.floor(at);
    return mix(hexToRgb(stops[i]), hexToRgb(stops[i + 1]), at - i);
  }

  // A lightly smoothed copy of the elevation, so contour lines flow rather than jitter.
  function smoothField(world, passes) {
    var w = world.w;
    var h = world.h;
    var field = Float32Array.from(world.elev);
    var next = new Float32Array(field.length);
    for (var p = 0; p < passes; p++) {
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var sum = 0;
          var n = 0;
          for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
              var nx = x + dx;
              var ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
              sum += field[nx + ny * w];
              n++;
            }
          }
          next[x + y * w] = sum / n;
        }
      }
      var swap = field;
      field = next;
      next = swap;
    }
    return field;
  }

  function drawTint(ctx, world, look, px) {
    var image = new ImageData(world.w, world.h);
    for (var i = 0; i < world.elev.length; i++) {
      var rgb = tintFor(look, world.elev[i]);
      if (world.water[i] === 2) rgb = hexToRgb(look.deep);
      else if (world.water[i] === 1) rgb = hexToRgb(look.shallow);
      image.data[i * 4] = rgb[0];
      image.data[i * 4 + 1] = rgb[1];
      image.data[i * 4 + 2] = rgb[2];
      image.data[i * 4 + 3] = 255;
    }
    var small = document.createElement('canvas');
    small.width = world.w;
    small.height = world.h;
    small.getContext('2d').putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small, 0, 0, world.w * px, world.h * px);
  }

  // Marching squares over the smoothed elevation.
  function drawContours(ctx, world, field, look, px) {
    var w = world.w;
    var h = world.h;
    var index = 0;
    for (var level = look.contourStep; level < 1; level += look.contourStep) {
      index++;
      var major = index % look.contourMajorEvery === 0;
      ctx.strokeStyle = major ? look.contourMajor : look.contourMinor;
      ctx.lineWidth = (major ? look.contourMajorWidth : look.contourMinorWidth) * px / 10;
      ctx.beginPath();
      for (var y = 0; y < h - 1; y++) {
        for (var x = 0; x < w - 1; x++) {
          var a = field[x + y * w];
          var b = field[x + 1 + y * w];
          var c = field[x + 1 + (y + 1) * w];
          var d = field[x + (y + 1) * w];
          if (a < world.seaLevel && b < world.seaLevel && c < world.seaLevel && d < world.seaLevel) continue;
          var points = [];
          if ((a < level) !== (b < level)) points.push([x + (level - a) / (b - a), y]);
          if ((b < level) !== (c < level)) points.push([x + 1, y + (level - b) / (c - b)]);
          if ((d < level) !== (c < level)) points.push([x + (level - d) / (c - d), y + 1]);
          if ((a < level) !== (d < level)) points.push([x, y + (level - a) / (d - a)]);
          for (var p = 0; p + 1 < points.length; p += 2) {
            ctx.moveTo((points[p][0] + 0.5) * px, (points[p][1] + 0.5) * px);
            ctx.lineTo((points[p + 1][0] + 0.5) * px, (points[p + 1][1] + 0.5) * px);
          }
        }
      }
      ctx.stroke();
    }
  }

  // The shoreline is a contour of a softened water mask, so it curves instead of following the grid.
  function drawShore(ctx, world, look, px) {
    var w = world.w;
    var h = world.h;
    var mask = new Float32Array(w * h);
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var sum = 0;
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) sum += world.water[x + dx + (y + dy) * w] > 0 ? 1 : 0;
        }
        mask[x + y * w] = sum / 9;
      }
    }
    var level = look.shoreLevel;
    ctx.strokeStyle = look.shore;
    ctx.lineWidth = look.shoreWidth * px / 10;
    ctx.beginPath();
    for (var cy = 0; cy < h - 1; cy++) {
      for (var cx = 0; cx < w - 1; cx++) {
        var a = mask[cx + cy * w];
        var b = mask[cx + 1 + cy * w];
        var c = mask[cx + 1 + (cy + 1) * w];
        var d = mask[cx + (cy + 1) * w];
        var points = [];
        if ((a < level) !== (b < level)) points.push([cx + (level - a) / (b - a), cy]);
        if ((b < level) !== (c < level)) points.push([cx + 1, cy + (level - b) / (c - b)]);
        if ((d < level) !== (c < level)) points.push([cx + (level - d) / (c - d), cy + 1]);
        if ((a < level) !== (d < level)) points.push([cx, cy + (level - a) / (d - a)]);
        for (var p = 0; p + 1 < points.length; p += 2) {
          ctx.moveTo((points[p][0] + 0.5) * px, (points[p][1] + 0.5) * px);
          ctx.lineTo((points[p + 1][0] + 0.5) * px, (points[p + 1][1] + 0.5) * px);
        }
      }
    }
    ctx.stroke();
  }

  function drawTrees(ctx, world, look, px) {
    var w = world.w;
    ctx.fillStyle = look.tree;
    ctx.strokeStyle = look.treeEdge;
    ctx.lineWidth = 0.7 * px / 10;
    for (var i = 0; i < world.trees.length; i++) {
      if (!world.trees[i]) continue;
      var x = (i % w + 0.5) * px;
      var y = (Math.floor(i / w) + 0.5) * px;
      var r = px * (0.26 + ((i * 2654435761) >>> 28) / 60);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  function drawHuts(ctx, world, look, px) {
    ctx.fillStyle = look.hut;
    ctx.strokeStyle = look.hutEdge;
    ctx.lineWidth = px / 10;
    world.villages.forEach(function (village) {
      village.huts.forEach(function (i) {
        var x = (i % world.w + 0.14) * px;
        var y = (Math.floor(i / world.w) + 0.14) * px;
        ctx.fillRect(x, y, px * 0.72, px * 0.72);
        ctx.strokeRect(x, y, px * 0.72, px * 0.72);
      });
    });
  }

  // The land never changes, so it's drawn once into its own canvas.
  function buildBase(world, cfg) {
    var look = cfg.look;
    var px = look.basePixelsPerCell;
    var canvas = document.createElement('canvas');
    canvas.width = world.w * px;
    canvas.height = world.h * px;
    var ctx = canvas.getContext('2d');
    drawTint(ctx, world, look, px);
    drawContours(ctx, world, smoothField(world, 2), look, px);
    drawShore(ctx, world, look, px);
    drawTrees(ctx, world, look, px);
    drawHuts(ctx, world, look, px);
    return canvas;
  }

  // Fine vein texture for the tide: ridged noise, 0 in the gaps and 1 along a vein.
  function buildVeins(width, height, seed) {
    var rng = RZ.makeRng(seed).fork('look-veins');
    var noise = RZ.makeNoise(rng);
    var veins = new Float32Array(width * height);
    for (var y = 0; y < height; y++) {
      for (var x = 0; x < width; x++) {
        var a = 1 - Math.abs(noise(x / 11, y / 11)) * 3.2;
        var b = 1 - Math.abs(noise(x / 4.5 + 40, y / 4.5 + 9)) * 3.2;
        veins[x + y * width] = Math.max(0, Math.max(a * a * a, b * b * b * 0.55));
      }
    }
    return veins;
  }

  // Mould rings are many soft blobs, so they look grown rather than drawn.
  function buildGoldRings(world, cfg) {
    var look = cfg.look;
    var px = look.basePixelsPerCell;
    var canvas = document.createElement('canvas');
    canvas.width = world.w * px;
    canvas.height = world.h * px;
    var ctx = canvas.getContext('2d');
    var rng = RZ.makeRng(world.seed).fork('look-gold');
    world.safe.forEach(function (safe) {
      var cx = (safe.x + 0.5) * px;
      var cy = (safe.y + 0.5) * px;
      var radius = (cfg.safe.radius + 0.4) * px;
      var glow = ctx.createRadialGradient(cx, cy, radius * 0.35, cx, cy, radius * 1.3);
      glow.addColorStop(0, 'rgba(232, 185, 58, 0)');
      glow.addColorStop(0.72, 'rgba(232, 185, 58, 0.15)');
      glow.addColorStop(1, 'rgba(232, 185, 58, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.3, 0, Math.PI * 2);
      ctx.fill();
      for (var n = 0; n < look.goldBlobs; n++) {
        var angle = rng.range(0, Math.PI * 2);
        var reach = radius + rng.range(-0.7, 0.5) * px;
        var size = rng.range(0.12, 0.42) * px;
        ctx.fillStyle = rng.chance(0.3) ? look.goldBright : look.goldDeep;
        ctx.globalAlpha = rng.range(0.45, 0.95);
        ctx.beginPath();
        ctx.arc(cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    });
    return canvas;
  }

  function Renderer(canvas, sim, camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sim = sim;
    this.camera = camera;
    this.look = sim.cfg.look;
    this.fx = RZ.makeFx(this);
    this.builtFor = null;
    this.highlight = null;
    this.buildLayers();
    this.mode = 'dual';
    this.scale = 1;
    this.originX = 0;
    this.originY = 0;
    this.dpr = 1;

    var world = sim.world;
    this.tideScale = 2;
    this.tideWidth = world.w * this.tideScale;
    this.tideHeight = world.h * this.tideScale;
    this.tideCanvas = document.createElement('canvas');
    this.tideCanvas.width = this.tideWidth;
    this.tideCanvas.height = this.tideHeight;
    this.tideContext = this.tideCanvas.getContext('2d');
    this.tideImage = this.tideContext.createImageData(this.tideWidth, this.tideHeight);
    this.veins = buildVeins(this.tideWidth, this.tideHeight, world.seed);
    this.fineFront = null;
    this.frontSource = null;
    this.tideDirty = false;

    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = world.w;
    this.fogCanvas.height = world.h;
    this.fogContext = this.fogCanvas.getContext('2d');
    this.fogImage = this.fogContext.createImageData(world.w, world.h);
    this.fogStamp = -1;
    this.fogMode = null;
  }

  // The land only changes at a greater tide, so these layers are drawn once for each map.
  Renderer.prototype.buildLayers = function () {
    var sim = this.sim;
    if (this.builtFor === sim.world) return;
    this.builtFor = sim.world;
    this.base = buildBase(sim.world, sim.cfg);
    this.gold = buildGoldRings(sim.world, sim.cfg);
    this.frontSource = null;
    this.fogStamp = -1;
  };

  Renderer.prototype.fit = function () {
    var rect = this.canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var width = Math.round(rect.width * dpr);
    var height = Math.round(rect.height * dpr);
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    var world = this.sim.world;
    var camera = this.camera;
    this.dpr = dpr;
    this.width = width;
    this.height = height;
    // Zoom 1 shows the whole map. Past that the map fills the frame, so no empty margins show.
    var fitAll = Math.min(width / world.w, height / world.h);
    var fill = Math.max(width / world.w, height / world.h);
    var blend = Math.min(1, camera.zoom - 1);
    var floor = fitAll + (fill - fitAll) * blend;
    this.scale = Math.max(floor, fitAll * camera.zoom);
    var viewW = width / this.scale;
    var viewH = height / this.scale;
    var cx = viewW >= world.w ? world.w / 2 : Math.max(viewW / 2, Math.min(world.w - viewW / 2, camera.x + 0.5));
    // A little overscroll at the top keeps the ranger out from under the bar.
    var overscroll = 96 * dpr / this.scale;
    var cy = viewH >= world.h ? world.h / 2 : Math.max(viewH / 2 - overscroll, Math.min(world.h - viewH / 2, camera.y + 0.5));
    if (camera.mode !== 'auto' && camera.mode !== 'map') {
      camera.x = cx - 0.5;
      camera.y = cy - 0.5;
    }
    this.originX = Math.round(width / 2 - cx * this.scale + camera.shakeX * dpr);
    this.originY = Math.round(height / 2 - cy * this.scale + camera.shakeY * dpr);
  };

  // Screen position to map cell.
  Renderer.prototype.toCell = function (clientX, clientY) {
    var rect = this.canvas.getBoundingClientRect();
    var px = (clientX - rect.left) * this.dpr;
    var py = (clientY - rect.top) * this.dpr;
    var world = this.sim.world;
    var x = Math.floor((px - this.originX) / this.scale);
    var y = Math.floor((py - this.originY) / this.scale);
    if (x < 0 || y < 0 || x >= world.w || y >= world.h) return null;
    return { x: x, y: y };
  };

  Renderer.prototype.toX = function (x) { return this.originX + (x + 0.5) * this.scale; };
  Renderer.prototype.toY = function (y) { return this.originY + (y + 0.5) * this.scale; };

  Renderer.prototype.label = function (text, x, y, color, size, align) {
    var ctx = this.ctx;
    ctx.font = (size * this.dpr) + 'px Georgia, "Times New Roman", serif';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    // Names near the edge of the map stay on it.
    var half = ctx.measureText(text).width / 2 + 2 * this.dpr;
    var mapRight = Math.min(this.width, this.originX + this.sim.world.w * this.scale);
    x = Math.max(Math.max(0, this.originX) + half, Math.min(mapRight - half, x));
    ctx.lineWidth = 3 * this.dpr;
    ctx.strokeStyle = this.look.labelHalo;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  };

  // What the current view is allowed to show of a place or thing.
  Renderer.prototype.knownMap = function () {
    var sim = this.sim;
    return sim.ranger && sim.ranger.alive ? sim.ranger.map : sim.book.map;
  };

  Renderer.prototype.visibleNow = function (x, y) {
    var sim = this.sim;
    if (!sim.ranger || !sim.ranger.alive) return false;
    return sim.view.stamp[x + y * sim.world.w] === sim.view.generation;
  };

  // Spreads the tide front onto the finer grid, once for each new front.
  Renderer.prototype.refreshFront = function () {
    var front = this.sim.tide.front;
    if (this.frontSource === front) return;
    this.frontSource = front;
    var world = this.sim.world;
    var w = world.w;
    var h = world.h;
    var s = this.tideScale;
    var fine = this.fineFront || new Float32Array(this.tideWidth * this.tideHeight);
    for (var y = 0; y < this.tideHeight; y++) {
      var cy = y / s;
      var y0 = Math.floor(cy);
      var y1 = Math.min(h - 1, y0 + 1);
      var ty = cy - y0;
      for (var x = 0; x < this.tideWidth; x++) {
        var cx = x / s;
        var x0 = Math.floor(cx);
        var x1 = Math.min(w - 1, x0 + 1);
        var tx = cx - x0;
        var top = front[x0 + y0 * w] * (1 - tx) + front[x1 + y0 * w] * tx;
        var bottom = front[x0 + y1 * w] * (1 - tx) + front[x1 + y1 * w] * tx;
        fine[x + y * this.tideWidth] = top * (1 - ty) + bottom * ty;
      }
    }
    this.fineFront = fine;
  };

  // The tide: a glow ahead of the front, a bright edge, and dark mould shot through with veins.
  Renderer.prototype.drawTide = function () {
    var sim = this.sim;
    var tide = sim.tide;
    if (tide.level <= 0) return;
    this.refreshFront();
    var look = this.look;
    var level = tide.level;
    var band = look.tideEdgeBand;
    var glow = look.tideGlowBand;
    var data = this.tideImage.data;
    var fine = this.fineFront;
    var veins = this.veins;
    var width = this.tideWidth;
    var height = this.tideHeight;
    var ranger = this.mode === 'ranger';
    var stamp = sim.view.stamp;
    var generation = sim.view.generation;
    var world = sim.world;
    var s = this.tideScale;
    var pulse = 0.85 + 0.15 * Math.sin(sim.tick * 0.11);
    var dark = look.tideDark;
    var mid = look.tideMid;
    var bright = look.tideBright;

    for (var y = 0, at = 0; y < height; y++) {
      for (var x = 0; x < width; x++, at += 4) {
        var i = x + y * width;
        var depth = level - fine[i];
        var alpha = 0;
        if (depth > -glow && fine[i] < 1.5) {
          if (!ranger || stamp[Math.floor(x / s) + Math.floor(y / s) * world.w] === generation) {
            var r, g, b;
            if (depth <= 0) {
              var ahead = 1 + depth / glow;
              alpha = ahead * ahead * look.tideGlowAlpha;
              r = bright[0]; g = bright[1]; b = bright[2];
            } else {
              var edge = Math.max(0, 1 - depth / band);
              var vein = veins[i] * pulse * (look.tideVeinDepth + (1 - look.tideVeinDepth) * Math.max(0, 1 - depth / look.tideVeinFade));
              var light = Math.min(1, edge * edge + vein * look.tideVeinStrength);
              alpha = look.tideBodyAlpha + (1 - look.tideBodyAlpha) * Math.min(1, light);
              var from = light < 0.5 ? dark : mid;
              var to = light < 0.5 ? mid : bright;
              var mixAt = light < 0.5 ? light * 2 : (light - 0.5) * 2;
              r = from[0] + (to[0] - from[0]) * mixAt;
              g = from[1] + (to[1] - from[1]) * mixAt;
              b = from[2] + (to[2] - from[2]) * mixAt;
            }
            data[at] = r;
            data[at + 1] = g;
            data[at + 2] = b;
          }
        }
        data[at + 3] = alpha * 255;
      }
    }
    this.tideContext.putImageData(this.tideImage, 0, 0);
    this.ctx.drawImage(this.tideCanvas, this.originX, this.originY, world.w * this.scale, world.h * this.scale);
  };

  // Fog over the map. Ranger view hides the unknown; dual view just dims it.
  Renderer.prototype.refreshFog = function () {
    var sim = this.sim;
    if (this.fogStamp === sim.view.generation && this.fogMode === this.mode) return;
    this.fogStamp = sim.view.generation;
    this.fogMode = this.mode;
    var look = this.look;
    var map = this.knownMap();
    var world = sim.world;
    var data = this.fogImage.data;
    var stamp = sim.view.stamp;
    var generation = sim.view.generation;
    var ranger = this.mode === 'ranger';
    var alive = sim.ranger && sim.ranger.alive;
    var unknown = ranger ? look.fogUnknownRanger : look.fogUnknownDual;
    var remembered = ranger ? look.fogRememberedRanger : look.fogRememberedDual;
    var ink = look.fogColor;
    for (var i = 0, at = 0; i < map.seen.length; i++, at += 4) {
      data[at] = ink[0];
      data[at + 1] = ink[1];
      data[at + 2] = ink[2];
      var inView = alive && stamp[i] === generation;
      data[at + 3] = (inView ? 0 : (map.seen[i] ? remembered : unknown)) * 255;
    }
    this.fogContext.putImageData(this.fogImage, 0, 0);
  };

  Renderer.prototype.drawFog = function () {
    if (this.mode === 'full') return;
    this.refreshFog();
    var world = this.sim.world;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.drawImage(this.fogCanvas, this.originX, this.originY, world.w * this.scale, world.h * this.scale);
  };

  Renderer.prototype.drawPlaces = function () {
    var ctx = this.ctx;
    var look = this.look;
    var sim = this.sim;
    var world = sim.world;
    var self = this;
    var map = this.knownMap();
    var hideUnknown = this.mode === 'ranger';
    var mission = sim.book.mission;

    world.safe.forEach(function (safe) {
      self.label(safe.name, self.toX(safe.x), self.toY(safe.y - sim.cfg.safe.radius - 1.6), look.gold, 12);
    });
    world.villages.forEach(function (village) {
      if (hideUnknown && !map.villages[village.id]) return;
      self.label(village.name, self.toX(village.x), self.toY(village.y + 6), look.labelDim, 11);
    });
    world.sites.forEach(function (site) {
      var active = mission && site.id === mission.id;
      var x = self.toX(site.x);
      var y = self.toY(site.y);
      var size = (active ? 6 : 4) * self.dpr;
      ctx.strokeStyle = active ? look.siteActive : look.site;
      ctx.lineWidth = 1.6 * self.dpr;
      ctx.beginPath();
      ctx.moveTo(x, y - size);
      ctx.lineTo(x + size, y + size * 0.8);
      ctx.lineTo(x - size, y + size * 0.8);
      ctx.closePath();
      ctx.stroke();
      self.label(site.name, x, y + 14 * self.dpr, active ? look.siteActive : look.site, 11);
    });
  };

  var ITEM_MARKS = { food: 'f', ammo: 'a', med: '+', loot: '$', weapon: 'R', crate: '#', grenade: 'g' };

  Renderer.prototype.drawItemMark = function (kind, x, y, alpha, weapon) {
    var ctx = this.ctx;
    ctx.globalAlpha = alpha;
    ctx.font = 'bold ' + (Math.max(10, Math.min(15, this.scale / this.dpr * 0.8)) * this.dpr) + 'px Consolas, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.look.itemColors[kind];
    var mark = kind === 'weapon' && weapon ? this.look.weaponMarks[weapon] || ITEM_MARKS.weapon : ITEM_MARKS[kind];
    ctx.fillText(mark, this.toX(x), this.toY(y));
    ctx.globalAlpha = 1;
  };

  Renderer.prototype.drawItems = function () {
    var sim = this.sim;
    var self = this;
    var w = sim.world.w;
    if (this.mode === 'ranger') {
      var remembered = this.knownMap().items;
      Object.keys(remembered).forEach(function (key) {
        var item = remembered[key];
        self.drawItemMark(item.kind, item.x, item.y, self.visibleNow(item.x, item.y) ? 1 : 0.55, item.weapon);
      });
      return;
    }
    var known = this.knownMap();
    sim.items.forEach(function (item) {
      var noticed = known.items[item.x + item.y * w] || self.visibleNow(item.x, item.y);
      self.drawItemMark(item.kind, item.x, item.y, self.mode === 'dual' && !noticed ? 0.45 : 1, item.weapon);
    });
  };

  Renderer.prototype.drawScavengers = function () {
    var ctx = this.ctx;
    var look = this.look;
    var sim = this.sim;
    var self = this;
    var r = sim.ranger;
    var size = this.figureSize() * 0.85;
    sim.scavs.forEach(function (s) {
      var seen = self.visibleNow(s.x, s.y);
      if (self.mode === 'ranger' && !seen) return;
      var cover = RZ.tideCovers(sim, s.x + s.y * sim.world.w);
      ctx.globalAlpha = cover ? 0.25 : (self.mode === 'dual' && !seen ? 0.6 : 1);
      var angle = s.alert > 0 && r ? Math.atan2(r.y - s.y, r.x - s.x) : (s.id * 1.7 + sim.tick * 0.004);
      self.figure(self.toX(s.x), self.toY(s.y), angle, size, look.scavCoat, look.scav);
    });
    sim.olds.forEach(function (old) {
      var seen = self.visibleNow(old.x, old.y);
      if (self.mode === 'ranger' && !seen) return;
      var x = self.toX(old.x) + Math.sin(sim.tick * 0.31 + old.id) * self.dpr;
      var y = self.toY(old.y);
      ctx.globalAlpha = self.mode === 'dual' && !seen ? 0.65 : 1;
      var angle = r && r.alive ? Math.atan2(r.y - old.y, r.x - old.x) : old.id;
      ctx.fillStyle = 'rgba(176, 107, 255, 0.16)';
      ctx.beginPath();
      ctx.arc(x, y, size * 2.1, 0, Math.PI * 2);
      ctx.fill();
      self.figure(x, y, angle, size, look.oldCoat, look.old);
      self.label(old.first, x, y + size * 2.1, look.old, 10);
    });
    ctx.globalAlpha = 1;
  };

  Renderer.prototype.drawAnomalies = function () {
    var ctx = this.ctx;
    var look = this.look;
    var sim = this.sim;
    var self = this;
    var phase = sim.tick * 0.14;
    function ring(a, strength) {
      var x = self.toX(a.x);
      var y = self.toY(a.y);
      var r = (3 + Math.sin(phase + a.x) * 1.2) * self.dpr;
      ctx.strokeStyle = look.anomaly;
      ctx.globalAlpha = strength;
      ctx.lineWidth = 1.3 * self.dpr;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, r * 0.4, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (this.mode !== 'ranger') {
      sim.anomalies.forEach(function (a) { if (!a.spent) ring(a, self.mode === 'full' ? 0.9 : 0.5); });
    }
    this.knownMap().anomalies.forEach(function (a) { ring(a, 1); });
    ctx.globalAlpha = 1;
  };

  Renderer.prototype.drawBodies = function () {
    var ctx = this.ctx;
    var look = this.look;
    var self = this;
    var size = 3.5 * this.dpr;
    this.sim.bodies.forEach(function (body) {
      var x = self.toX(body.x);
      var y = self.toY(body.y);
      ctx.strokeStyle = look.body;
      ctx.lineWidth = 2 * self.dpr;
      ctx.beginPath();
      ctx.moveTo(x - size, y - size);
      ctx.lineTo(x + size, y + size);
      ctx.moveTo(x + size, y - size);
      ctx.lineTo(x - size, y + size);
      ctx.stroke();
      self.label(body.first, x, y + 11 * self.dpr, look.body, 10);
    });
  };

  Renderer.prototype.drawRoute = function () {
    var r = this.sim.ranger;
    if (!r || !r.alive) return;
    var ctx = this.ctx;
    var look = this.look;
    var self = this;
    var w = this.sim.world.w;

    if (r.path && r.pathAt < r.path.length) {
      ctx.strokeStyle = look.routeLine;
      ctx.lineWidth = 1.2 * this.dpr;
      ctx.setLineDash([3 * this.dpr, 4 * this.dpr]);
      ctx.beginPath();
      ctx.moveTo(this.toX(r.x), this.toY(r.y));
      for (var i = r.pathAt; i < r.path.length; i++) {
        var cell = r.path[i];
        ctx.lineTo(self.toX(cell % w), self.toY(Math.floor(cell / w)));
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };

  Renderer.prototype.setMode = function (mode) {
    this.mode = mode;
  };

  Renderer.prototype.draw = function (dt) {
    var ctx = this.ctx;
    this.buildLayers();
    var world = this.sim.world;
    this.fit();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.look.background;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.base, this.originX, this.originY, world.w * this.scale, world.h * this.scale);
    this.drawFog();
    this.drawTide();
    ctx.drawImage(this.gold, this.originX, this.originY, world.w * this.scale, world.h * this.scale);
    this.drawTrack();
    this.drawGraves();
    this.drawItems();
    this.drawBodies();
    this.drawAnomalies();
    this.drawMarks();
    this.drawThreat();
    this.drawCrates();
    this.drawScavengers();
    this.drawPlaces();
    this.drawRoute();
    this.drawRanger(dt);
    this.fx.draw(dt);
    this.drawSpeech(dt);
    this.drawMood();
  };

  RZ.Renderer = Renderer;

  RZ.makeRenderer = function (canvas, sim, camera) {
    return new Renderer(canvas, sim, camera);
  };
})();
