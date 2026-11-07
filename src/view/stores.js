// What each safe house holds: a row of counts under its name on the map, and a card when it's clicked.
// The ranger view shows what the journal says is there. Zero's views show what's really there, and
// mark where the journal has it wrong. Reads sim state only.

var RZ = RZ || {};

(function () {
  var P = RZ.Renderer.prototype;
  var KINDS = ['food', 'ammo', 'med', 'grenade', 'loot'];
  var GLYPHS = { food: 'f', ammo: 'a', med: '+', grenade: 'g', loot: '$' };
  var NAMES = { food: 'food', ammo: 'ammo', med: 'medkits', grenade: 'grenades', loot: 'loot' };

  function sameWeapons(a, b) {
    return a.slice().sort().join() === b.slice().sort().join();
  }

  // Everything known about one safe house's stash: the truth, the journal's ledger, and the target
  // the planner set if it's the staging post.
  RZ.storeReport = function (sim, safe) {
    var memory = RZ.planMemory(sim);
    var truth = sim.stashes[safe.id] || RZ.emptyPack();
    // A stash nobody has written down counts as empty, the same as the planner reads it.
    var written = !!sim.book.stashes[safe.id];
    var ledger = sim.book.stashes[safe.id] || RZ.emptyPack();
    var staging = !!(memory.brief && memory.brief.staging && memory.brief.staging.id === safe.id);
    var wrong = {};
    var anyWrong = false;
    KINDS.forEach(function (kind) {
      wrong[kind] = ledger[kind] !== truth[kind];
      if (wrong[kind]) anyWrong = true;
    });
    wrong.weapons = !sameWeapons(ledger.weapons, truth.weapons);
    if (wrong.weapons) anyWrong = true;
    return {
      safe: safe,
      truth: truth,
      ledger: ledger,
      written: written,
      wrong: wrong,
      anyWrong: anyWrong,
      staging: staging,
      targets: staging ? memory.brief.targets : null,
      mission: staging ? memory.brief.mission.name : null
    };
  };

  RZ.safeAtCell = function (sim, cell) {
    var reach = sim.cfg.safe.radius + 1;
    var found = null;
    sim.world.safe.forEach(function (safe) {
      var dx = safe.x - cell.x;
      var dy = safe.y - cell.y;
      if (dx * dx + dy * dy <= reach * reach) found = safe;
    });
    return found;
  };

  // A row of counts under each safe house's name. Counts short of the staging target are drawn in red.
  P.drawStores = function () {
    var self = this;
    var sim = this.sim;
    var look = this.look;
    var ctx = this.ctx;
    var dpr = this.dpr;
    var zeroSees = this.mode !== 'ranger';
    var size = 10.5 * dpr;
    ctx.font = size + 'px Consolas, Menlo, monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.lineJoin = 'round';
    sim.world.safe.forEach(function (safe) {
      var report = RZ.storeReport(sim, safe);
      var shown = zeroSees ? report.truth : report.ledger;
      var parts = [];
      if (!zeroSees && !report.written) {
        parts.push({ text: 'not checked yet', color: look.labelDim });
      } else {
        KINDS.forEach(function (kind) {
          var target = report.targets && report.targets[kind] !== undefined ? report.targets[kind] : null;
          if (!shown[kind] && !target) return;
          parts.push({ text: GLYPHS[kind], color: look.itemColors[kind] });
          var short = target !== null && shown[kind] < target;
          parts.push({ text: String(shown[kind]), color: short ? look.storeShort : look.paper });
          if (target !== null) parts.push({ text: '/' + target, color: look.labelDim });
          if (zeroSees && report.wrong[kind]) parts.push({ text: '*', color: look.storeWrong });
          parts.push({ text: ' ', color: look.paper });
        });
        if (shown.weapons.length) {
          var marks = shown.weapons.map(function (name) { return look.weaponMarks[name] || '?'; }).join('');
          parts.push({ text: marks, color: look.itemColors.weapon });
          if (zeroSees && report.wrong.weapons) parts.push({ text: '*', color: look.storeWrong });
        }
        if (!parts.length) parts.push({ text: 'empty', color: look.labelDim });
      }
      var width = 0;
      parts.forEach(function (part) { width += ctx.measureText(part.text).width; });
      var x = self.toX(safe.x) - width / 2;
      var y = self.toY(safe.y + sim.cfg.safe.radius + 1.4);
      ctx.fillStyle = 'rgba(8, 12, 15, 0.72)';
      ctx.fillRect(x - 4 * dpr, y - size * 0.75, width + 8 * dpr, size * 1.5);
      parts.forEach(function (part) {
        ctx.fillStyle = part.color;
        ctx.fillText(part.text, x, y);
        x += ctx.measureText(part.text).width;
      });
    });
  };

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // The card for one safe house: every count, side by side with what the journal says.
  function StoreCard(sim, getView) {
    this.sim = sim;
    this.getView = getView;
    this.node = document.getElementById('storeCard');
    this.open = null;
    this.key = '';
    var self = this;
    this.node.addEventListener('click', function (event) {
      if (event.target.closest('.store-close')) self.show(null);
    });
  }

  StoreCard.prototype.show = function (safe) {
    this.open = safe ? safe.id : null;
    this.key = '';
    this.node.classList.toggle('open', !!safe);
    this.update();
  };

  StoreCard.prototype.toggle = function (safe) {
    this.show(safe && safe.id !== this.open ? safe : null);
  };

  StoreCard.prototype.update = function () {
    if (!this.open) return;
    var sim = this.sim;
    var safe = null;
    sim.world.safe.forEach(function (place) { if (place.id === this.open) safe = place; }, this);
    if (!safe) {
      this.show(null);
      return;
    }
    var report = RZ.storeReport(sim, safe);
    var zeroSees = this.getView() !== 'ranger';
    var key = JSON.stringify([report.truth, report.ledger, report.written, report.targets, zeroSees]);
    if (key === this.key) return;
    this.key = key;

    var node = this.node;
    node.innerHTML = '';
    var head = element('div', 'store-head');
    head.appendChild(element('strong', '', safe.name));
    head.appendChild(element('button', 'store-close', '×'));
    head.lastChild.type = 'button';
    head.lastChild.title = 'Close';
    node.appendChild(head);
    var role = safe.isHome ? 'Home. A free kit is always here.' : 'Outpost.';
    if (report.staging) role += ' The staging post for ' + report.mission + '.';
    node.appendChild(element('p', 'store-role', role));

    var table = element('table');
    var header = element('tr');
    header.appendChild(element('th', '', ''));
    if (zeroSees) header.appendChild(element('th', '', 'stored'));
    header.appendChild(element('th', '', 'journal'));
    header.appendChild(element('th', '', 'target'));
    table.appendChild(header);
    KINDS.forEach(function (kind) {
      var row = element('tr', zeroSees && report.wrong[kind] ? 'wrong' : '');
      row.appendChild(element('td', '', NAMES[kind]));
      var target = report.targets && report.targets[kind] !== undefined ? report.targets[kind] : null;
      var have = zeroSees ? report.truth[kind] : report.ledger[kind];
      if (zeroSees) row.appendChild(element('td', target !== null && have < target ? 'short' : '', String(report.truth[kind])));
      row.appendChild(element('td', !zeroSees && target !== null && have < target ? 'short' : '', report.written ? String(report.ledger[kind]) : '?'));
      row.appendChild(element('td', 'dim', target === null ? '' : String(target)));
      table.appendChild(row);
    });
    var guns = element('tr', zeroSees && report.wrong.weapons ? 'wrong' : '');
    guns.appendChild(element('td', '', 'guns'));
    if (zeroSees) guns.appendChild(element('td', '', report.truth.weapons.join(', ') || 'none'));
    guns.appendChild(element('td', '', report.written ? report.ledger.weapons.join(', ') || 'none' : '?'));
    guns.appendChild(element('td', 'dim', ''));
    table.appendChild(guns);
    node.appendChild(table);

    var notes = [];
    if (!report.written) notes.push('Nobody has written this stash down yet.');
    else if (zeroSees && report.anyWrong) notes.push('The journal is out of date here. A ranger finds out when they arrive.');
    if (report.targets) notes.push('Targets are what the planner wants here before the next attempt.');
    notes.forEach(function (text) { node.appendChild(element('p', 'store-note', text)); });
  };

  RZ.makeStoreCard = function (sim, getView) {
    return new StoreCard(sim, getView);
  };
})();
