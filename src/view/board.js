// The board: every objective in this land, how far along each one is, and how the line rates
// them. A box over the map holds the list and Zero's two switches, and each objective has a mark on
// the map. Reads sim state. The switches go back as radio calls.

var RZ = RZ || {};

(function () {
  var P = RZ.Renderer.prototype;
  var GLYPHS = { survey: '△', clear: '✕', retrieve: '◇', stock: '▣' };
  var ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function BoardBox(sim, send) {
    this.sim = sim;
    this.node = document.getElementById('board');
    this.key = '';
    // On a narrow screen the board would cover most of the map, so it starts folded.
    this.folded = !!(window.matchMedia && window.matchMedia('(max-width: 960px)').matches);
    var self = this;
    this.node.addEventListener('click', function (event) {
      var button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.switch === 'hold') send({ type: 'hold', on: !sim.hold });
      else if (button.dataset.switch === 'board') send({ type: 'board' });
      else if (button.dataset.switch === 'fold') {
        self.folded = !self.folded;
        self.key = '';
        self.update();
      }
    });
  }

  BoardBox.prototype.update = function () {
    var sim = this.sim;
    var book = sim.book;
    var memory = RZ.planMemory(sim);
    var options = memory.plan && memory.plan.brief.options ? memory.plan.brief.options : [];
    var scores = {};
    options.forEach(function (option, rank) { scores[option.id] = { score: option.score, rank: rank, note: option.note }; });
    var current = book.mission;
    var key = JSON.stringify([book.board, sim.hold, this.folded, current && current.id, scores,
      book.objectives.map(function (o) { return [o.done, o.reached, o.attempts, o.checks]; })]);
    if (key === this.key) return;
    this.key = key;

    var node = this.node;
    node.innerHTML = '';
    var done = book.objectives.filter(function (o) { return o.done; }).length;
    var head = element('div', 'board-head');
    var fold = element('button', 'board-title', 'Board ' + done + '/' + book.objectives.length);
    fold.type = 'button';
    fold.dataset.switch = 'fold';
    fold.title = this.folded ? 'Show the board' : 'Fold the board away';
    head.appendChild(fold);
    var hold = element('button', sim.hold ? 'on' : '', sim.hold ? 'land held' : 'hold land');
    hold.type = 'button';
    hold.dataset.switch = 'hold';
    hold.title = sim.hold ? 'The land stays until the board is done. Click to let the tides decide.'
      : 'Keep this land until every objective is done, however many tides it takes.';
    head.appendChild(hold);
    var fresh = element('button', '', 'new board');
    fresh.type = 'button';
    fresh.dataset.switch = 'board';
    fresh.title = 'Scrap this board and post a new one. Progress on it is lost. Stashes stay.';
    head.appendChild(fresh);
    node.appendChild(head);
    if (this.folded) return;

    var list = element('ol', 'board-list');
    book.objectives.forEach(function (o) {
      var focus = current && current.id === o.id && !o.done;
      var item = element('li', o.done ? 'done' : focus ? 'focus' : '');
      var line = element('div', 'board-line');
      line.appendChild(element('i', 'glyph ' + o.type, GLYPHS[o.type]));
      line.appendChild(element('span', 'board-name', o.title));
      var ticks = o.checks.filter(function (check) { return check.done; }).length;
      var state = o.done ? '✓' : o.checks.length ? ticks + '/' + o.checks.length : '';
      var rated = scores[o.id];
      line.appendChild(element('span', 'board-state', state));
      // Where the line ranks it now, best first. The reasons are on hover.
      var rank = !o.done && rated && rated.score !== null ? ORDINALS[rated.rank] || '' : '';
      line.appendChild(element('span', 'board-rank' + (rated && rated.rank === 0 ? ' top' : ''), rank));
      if (rated) line.title = rated.note + (rated.score !== null ? ' (score ' + rated.score + ')' : '');
      item.appendChild(line);
      if (focus && o.checks.length) {
        var checks = element('ul', 'board-checks');
        o.checks.forEach(function (check) {
          checks.appendChild(element('li', check.done ? 'ticked' : '', (check.done ? '✓ ' : '○ ') + check.text));
        });
        item.appendChild(checks);
      }
      list.appendChild(item);
    });
    node.appendChild(list);
    var tide = sim.tide.number - sim.chapter.startTide;
    var note = sim.hold ? 'Held: no greater tide until the board is done.'
      : 'Greater tide after ' + sim.cfg.chapter.tides + ' tides, or once the board is done. ' + Math.max(0, sim.cfg.chapter.tides - tide) + ' left.';
    node.appendChild(element('p', 'board-note', note));
  };

  RZ.makeBoardBox = function (sim, send) {
    return new BoardBox(sim, send);
  };

  // Marks for the board's objectives. Done ones get a gold tick, and the one the line is on is brighter.
  P.drawObjectives = function () {
    var self = this;
    var sim = this.sim;
    var book = sim.book;
    var look = this.look;
    var ctx = this.ctx;
    var dpr = this.dpr;
    var current = book.mission;
    var onBoard = {};
    book.objectives.forEach(function (o) { if (o.type === 'survey') onBoard[o.name] = true; });

    // Survey sites that aren't on this board, dim.
    sim.world.sites.forEach(function (site) {
      if (onBoard[site.name]) return;
      self.drawSite(site.x, site.y, look.siteOff, 4, false);
    });

    book.objectives.forEach(function (o) {
      var focus = current && current.id === o.id && !o.done;
      var color = o.done ? look.gold : focus ? look.siteActive : look.site;
      var x = self.toX(o.x);
      var y = self.toY(o.y);
      if (o.type === 'survey') {
        self.drawSite(o.x, o.y, color, focus ? 6 : 4.5, o.done);
        self.label(o.name, x, y + 14 * dpr, color, 11);
      } else if (o.type === 'clear') {
        var radius = (sim.cfg.map.villageRadius + 2) * self.scale;
        ctx.strokeStyle = o.done ? look.gold : look.clearMark;
        ctx.globalAlpha = focus ? 1 : 0.7;
        ctx.lineWidth = 1.6 * dpr;
        ctx.setLineDash([4 * dpr, 4 * dpr]);
        ctx.beginPath();
        ctx.arc(x, y, Math.max(radius, 10 * dpr), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        self.label((o.done ? '✓ ' : '✕ ') + 'clear', x, y - Math.max(radius, 10 * dpr) - 7 * dpr, o.done ? look.gold : look.clearMark, 11);
      } else if (o.type === 'retrieve') {
        if (o.done) return;
        var size = (focus ? 6 : 5) * dpr;
        ctx.strokeStyle = look.itemColors.relic;
        ctx.globalAlpha = o.reached ? 0.35 : 1;
        ctx.lineWidth = 1.6 * dpr;
        ctx.beginPath();
        ctx.moveTo(x, y - size);
        ctx.lineTo(x + size, y);
        ctx.lineTo(x, y + size);
        ctx.lineTo(x - size, y);
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = 1;
        self.label(o.reached ? o.name + ' (picked up)' : o.name, x, y + 13 * dpr, o.reached ? look.labelDim : look.itemColors.relic, 11);
      } else if (o.type === 'stock') {
        self.label((o.done ? '✓ ' : '▣ ') + 'stock', x, self.toY(o.y - sim.cfg.safe.radius - 3.2), o.done ? look.gold : look.paper, 10);
      }
    });
  };

  P.drawSite = function (cx, cy, color, size, done) {
    var ctx = this.ctx;
    var x = this.toX(cx);
    var y = this.toY(cy);
    size *= this.dpr;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6 * this.dpr;
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size, y + size * 0.8);
    ctx.lineTo(x - size, y + size * 0.8);
    ctx.closePath();
    ctx.stroke();
    if (done) {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.35;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  };

  // A slow gold shimmer around anything a finished objective left on the ground.
  P.drawRewards = function () {
    var self = this;
    var sim = this.sim;
    var ctx = this.ctx;
    var ranger = this.mode === 'ranger';
    var phase = (performance.now() / 700) % (Math.PI * 2);
    sim.items.forEach(function (item) {
      if (!item.reward && item.kind !== 'relic') return;
      if (ranger && !self.knownMap().items[item.x + item.y * sim.world.w]) return;
      var x = self.toX(item.x);
      var y = self.toY(item.y);
      ctx.strokeStyle = self.look.gold;
      ctx.globalAlpha = 0.45 + Math.sin(phase + item.x) * 0.25;
      ctx.lineWidth = 1.2 * self.dpr;
      ctx.beginPath();
      ctx.arc(x, y, 7 * self.dpr, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  };
})();
