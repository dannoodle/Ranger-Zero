// Everything that sits over the map: the opening card, the card for a death, who walks next, the
// chapter card, passing banners, the strip of rangers along the bottom and the history screen.

var RZ = RZ || {};

(function () {
  var CAUSES = {
    tide: 'Caught by the tide',
    scavenger: 'Shot by scavengers',
    anomaly: 'Walked into a pocket',
    starved: 'Starved',
    oldself: 'Killed by an old self'
  };

  var MARKS = { tide: '~', scavenger: '+', anomaly: '*', starved: 'o', oldself: '?' };

  function byId(id) {
    return document.getElementById(id);
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function portraitOf(person, cfg, size, dead) {
    var canvas = element('canvas', 'face');
    canvas.width = size * 2;
    canvas.height = size * 2;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    RZ.drawPortrait(canvas, person, cfg.look.temper[person.temper], { dead: dead });
    return canvas;
  }

  function tidesLived(record, sim) {
    var end = record.deathTide === undefined ? sim.tide.number : record.deathTide;
    var n = end - record.bornTide;
    if (n <= 0) return 'Lived less than a tide';
    return 'Lived ' + n + (n === 1 ? ' tide' : ' tides');
  }

  function Overlays(sim, hooks) {
    this.sim = sim;
    this.hooks = hooks;           // resume(), onPick(), showTrack(record)
    this.root = byId('overlay');
    this.toastNode = byId('toast');
    this.lineNode = byId('line');
    this.historyNode = byId('history');
    this.card = null;
    this.timer = 0;
    this.timerNode = null;
    this.onExpire = null;
    this.chips = 0;
    this.lastLiving = null;
    this.toastTime = 0;
  }

  Overlays.prototype.holding = function () {
    return !!this.card;
  };

  Overlays.prototype.close = function () {
    this.root.innerHTML = '';
    this.root.className = '';
    this.card = null;
    this.onExpire = null;
    this.timerNode = null;
    this.hooks.resume();
  };

  Overlays.prototype.open = function (node, seconds, onExpire) {
    this.root.innerHTML = '';
    this.root.className = 'open';
    this.root.appendChild(node);
    this.card = node;
    this.timer = seconds;
    this.onExpire = onExpire;
  };

  // Cards close by themselves, so the sim still runs unattended.
  Overlays.prototype.tick = function (dt) {
    if (this.toastTime > 0) {
      this.toastTime -= dt;
      if (this.toastTime <= 0) this.toastNode.className = '';
    }
    if (!this.card) return;
    this.timer -= dt;
    if (this.timerNode) this.timerNode.textContent = Math.max(0, Math.ceil(this.timer));
    if (this.timer <= 0 && this.onExpire) this.onExpire();
  };

  Overlays.prototype.toast = function (text, kind, seconds) {
    this.toastNode.textContent = text;
    this.toastNode.className = 'show ' + (kind || '');
    this.toastTime = seconds || 3.4;
  };

  // Three people at the gate.
  Overlays.prototype.recruitRow = function (people, pick) {
    var cfg = this.sim.cfg;
    var row = element('div', 'recruits');
    people.forEach(function (person, n) {
      var button = element('button', 'recruit');
      button.type = 'button';
      button.appendChild(portraitOf(person, cfg, 64));
      var text = element('div', 'recruit-text');
      text.appendChild(element('strong', '', person.name));
      var temper = element('span', 'temper', person.temper);
      temper.style.color = cfg.look.temper[person.temper];
      text.appendChild(temper);
      var quirk = cfg.people.quirks[person.quirk];
      text.appendChild(element('span', 'quirk', quirk.label + ': ' + quirk.note));
      text.appendChild(element('em', '', person.past));
      button.appendChild(text);
      button.addEventListener('click', function () { pick(n); });
      row.appendChild(button);
    });
    return row;
  };

  Overlays.prototype.countdown = function (parent, before) {
    var note = element('p', 'count');
    note.appendChild(document.createTextNode(before));
    this.timerNode = element('span', '', '');
    note.appendChild(this.timerNode);
    note.appendChild(document.createTextNode('s'));
    parent.appendChild(note);
  };

  Overlays.prototype.showIntro = function () {
    var self = this;
    var sim = this.sim;
    var card = element('div', 'card intro');
    card.appendChild(element('p', 'eyebrow', 'Ranger-Zero'));
    card.appendChild(element('h1', '', 'The rangers are numbered from one. You are Zero.'));
    card.appendChild(element('p', 'lede', 'You\'re the voice on the radio at home. You can see the whole map, and they can\'t. ' +
      'You can warn them, send them, drop them a crate or tell them to run. They don\'t have to listen, and the journal remembers what you told them.'));
    card.appendChild(element('p', 'keys', 'T turn back · P push on · W warn · S send · C crate · H history · M map · N sound · Space pause'));
    card.appendChild(element('h2', '', 'Who walks first?'));
    var pick = function (n) {
      RZ.queueCall(sim, { type: 'recruit', pick: n });
      self.hooks.onFirstPick();
      self.chips = 0;
      self.close();
    };
    card.appendChild(this.recruitRow(sim.firstChoice, pick));
    this.open(card, 45, function () { pick(0); });
    this.countdown(card, 'The first of them goes in ');
  };

  Overlays.prototype.showDeath = function (record, instant) {
    var self = this;
    var sim = this.sim;
    var cfg = sim.cfg;
    var card = element('div', 'card death');
    var head = element('div', 'death-head');
    head.appendChild(portraitOf(record, cfg, 92, true));
    var who = element('div', '');
    who.appendChild(element('p', 'eyebrow', 'Ranger ' + record.no));
    who.appendChild(element('h1', '', record.name));
    var temper = element('p', 'temper', record.temper + ', ' + record.quirk);
    temper.style.color = cfg.look.temper[record.temper];
    who.appendChild(temper);
    head.appendChild(who);
    card.appendChild(head);
    if (record.words) card.appendChild(element('blockquote', '', record.words));
    var summary = [CAUSES[record.cause] || 'Died', record.place ? 'near ' + record.place + '.' : '.'].join(' ');
    var bits = [tidesLived(record, sim) + '.'];
    if (record.kills) bits.push(record.kills + (record.kills === 1 ? ' kill.' : ' kills.'));
    if (record.deeds.length) bits.push(record.deeds[record.deeds.length - 1].charAt(0).toUpperCase() + record.deeds[record.deeds.length - 1].slice(1) + '.');
    card.appendChild(element('p', 'summary', summary + ' ' + bits.join(' ')));
    card.appendChild(element('h2', '', 'Who walks next?'));
    var pick = function (n) {
      RZ.queueCall(sim, { type: 'recruit', pick: n });
      self.hooks.onPick();
      self.close();
    };
    card.appendChild(this.recruitRow(sim.recruits, pick));
    this.open(card, instant ? 1 : cfg.look.cardSeconds, function () { pick(0); });
    this.countdown(card, 'The first of them goes in ');
  };

  Overlays.prototype.showChapter = function (event) {
    var self = this;
    var summary = event.summary;
    var card = element('div', 'card chapter');
    card.appendChild(element('p', 'eyebrow', 'The greater tide'));
    card.appendChild(element('h1', '', summary.complete ? 'That land is finished.' : 'That land is gone.'));
    var places = summary.places.join(', ');
    card.appendChild(element('p', 'lede', places + ': all under the violet now. ' +
      summary.tides + ' tides. ' + summary.surveyed.length + ' of ' + summary.sites + ' sites surveyed.'));
    if (summary.lost.length) card.appendChild(element('p', 'summary', 'We lost ' + summary.lost.join(', ') + '.'));
    else card.appendChild(element('p', 'summary', 'Nobody died in that land.'));
    card.appendChild(element('h2', '', 'Chapter ' + event.chapter));
    card.appendChild(element('p', 'lede', 'New ground. The stores came home. New posts at ' + event.places.join(', ') + '.'));
    var go = element('button', 'go', 'Carry on');
    go.type = 'button';
    go.addEventListener('click', function () { self.close(); });
    card.appendChild(go);
    this.open(card, this.sim.cfg.look.cardSeconds, function () { self.close(); });
    this.countdown(card, 'Carrying on in ');
  };

  // The strip along the bottom: everyone who has walked.
  Overlays.prototype.updateLine = function () {
    var sim = this.sim;
    var self = this;
    var node = this.lineNode;
    var cfg = sim.cfg;
    var living = sim.ranger.alive ? sim.ranger.no : null;
    if (this.chips === sim.rangers.length && this.lastLiving === living) return;
    this.chips = sim.rangers.length;
    this.lastLiving = living;
    node.innerHTML = '';
    node.appendChild(element('span', 'line-label', 'the line'));
    sim.rangers.forEach(function (record) {
      var chip = element('button', 'chip' + (record.cause ? '' : ' alive'));
      chip.type = 'button';
      chip.style.borderBottomColor = cfg.look.temper[record.temper];
      chip.title = record.name + (record.cause ? '. ' + (CAUSES[record.cause] || '') : '');
      chip.appendChild(element('span', 'no', record.no));
      chip.appendChild(document.createTextNode(record.first));
      if (record.cause) chip.appendChild(element('span', 'mark', MARKS[record.cause] || 'x'));
      chip.addEventListener('click', function () { self.toggleHistory(true, record); });
      node.appendChild(chip);
    });
    node.scrollLeft = node.scrollWidth;
  };

  function historyEntry(self, record) {
    var sim = self.sim;
    var cfg = sim.cfg;
    var row = element('button', 'entry');
    row.type = 'button';
    row.appendChild(portraitOf(record, cfg, 54, !!record.cause));
    var text = element('div', 'entry-text');
    text.appendChild(element('strong', '', record.no + '. ' + record.name));
    var temper = element('span', 'temper', record.temper + ', ' + record.quirk);
    temper.style.color = cfg.look.temper[record.temper];
    text.appendChild(temper);
    var fate = record.cause
      ? (CAUSES[record.cause] || 'Died') + (record.place ? ' near ' + record.place : '') + '. ' + tidesLived(record, sim) + '.'
      : 'Still walking. ' + tidesLived(record, sim) + ' so far.';
    text.appendChild(element('span', 'fate', fate));
    var deeds = record.deeds.slice();
    if (record.carried) deeds.push('carried ' + record.carried + ' rounds forward');
    var kills = record.cause ? record.kills : sim.ranger.kills;
    if (kills) deeds.push(kills + (kills === 1 ? ' kill' : ' kills'));
    if (deeds.length) text.appendChild(element('span', 'deeds', deeds.join(', ') + '.'));
    if (record.words) text.appendChild(element('em', '', record.words));
    row.appendChild(text);
    row.addEventListener('mouseenter', function () { self.hooks.showTrack(record); });
    row.addEventListener('focus', function () { self.hooks.showTrack(record); });
    row.addEventListener('click', function () { self.hooks.showTrack(record); });
    return row;
  }

  Overlays.prototype.toggleHistory = function (force, record) {
    var node = this.historyNode;
    var open = force === undefined ? !node.classList.contains('open') : force;
    node.classList.toggle('open', open);
    document.getElementById('stage').classList.toggle('reading', open);
    if (!open) {
      this.hooks.showTrack(null);
      return;
    }
    var self = this;
    var sim = this.sim;
    node.innerHTML = '';
    var head = element('div', 'history-head');
    head.appendChild(element('h2', '', 'The line'));
    var deaths = sim.rangers.filter(function (entry) { return entry.cause; }).length;
    var sites = sim.stats.missions.length;
    head.appendChild(element('p', '', sim.rangers.length + (sim.rangers.length === 1 ? ' ranger, ' : ' rangers, ') + deaths + ' dead, ' +
      sites + (sites === 1 ? ' site' : ' sites') + ' surveyed, chapter ' + sim.chapter.no + '.'));
    var close = element('button', 'history-close', 'close');
    close.type = 'button';
    close.addEventListener('click', function () { self.toggleHistory(false); });
    head.appendChild(close);
    node.appendChild(head);
    var list = element('div', 'history-list');
    sim.rangers.slice().reverse().forEach(function (entry) {
      var row = historyEntry(self, entry);
      list.appendChild(row);
      if (record && record.no === entry.no) {
        self.hooks.showTrack(record);
        row.classList.add('picked');
        setTimeout(function () { row.scrollIntoView({ block: 'nearest' }); }, 0);
      }
    });
    node.appendChild(list);
  };

  RZ.makeOverlays = function (sim, hooks) {
    return new Overlays(sim, hooks);
  };
})();
