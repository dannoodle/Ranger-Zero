// The side panel and the bar over the map: who the ranger is, how the trip stands, the radio and the
// journal. Reads sim state. The only thing it sends back is what the player does on the radio.

var RZ = RZ || {};

(function () {
  var MODE_WORDS = {
    plan: 'thinking it over',
    wait: 'waiting under gold',
    travel: 'on the move',
    fight: 'fighting',
    flee: 'running',
    shelter: 'running for gold',
    climb: 'climbing for high ground'
  };

  var PLAN_WORDS = {
    survey: 'on the survey run',
    stock: 'carrying stores forward',
    fetch: 'going for supplies',
    advance: 'moving up',
    scavenge: 'scavenging',
    forage: 'having a look around',
    recover: 'going for a body',
    errand: 'following your mark',
    wait: 'waiting'
  };

  var TIDE_WORDS = { calm: 'calm', surge: 'surging', hold: 'at full flood', retreat: 'pulling back' };

  function clockText(tick, cfg) {
    var seconds = Math.floor(tick / cfg.sim.ticksPerSecond);
    var minutes = Math.floor(seconds / 60);
    return minutes + ':' + String(seconds % 60).padStart(2, '0');
  }

  function meter(name, value, max, type) {
    var share = Math.max(0, Math.min(1, value / max));
    return '<div class="meter"><span>' + name + '</span><span class="bar"><span class="fill ' + type +
      '" style="width:' + Math.round(share * 100) + '%"></span></span><span class="value">' + Math.round(value) + '</span></div>';
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function Panel(sim, getView) {
    this.sim = sim;
    this.getView = getView;
    this.journalNode = byId('journal');
    this.logNode = byId('radioLog');
    this.portrait = byId('portrait');
    this.written = 0;
    this.logged = 0;
    this.lastStatus = -100;
    this.lastHud = -1;
    this.faceKey = '';
  }

  Panel.prototype.updateFace = function (r) {
    var cfg = this.sim.cfg;
    var hurt = r.alive ? 1 - r.hp / cfg.ranger.hpMax : 0;
    var key = r.name + (hurt > 0.65 ? 2 : hurt > 0.4 ? 1 : 0) + r.alive;
    if (key === this.faceKey) return;
    this.faceKey = key;
    RZ.drawPortrait(this.portrait, r, cfg.look.temper[r.temperName], { hurt: hurt, dead: !r.alive });
  };

  Panel.prototype.updateStatus = function () {
    var sim = this.sim;
    var cfg = sim.cfg;
    var r = sim.ranger;
    this.updateFace(r);
    byId('rRank').textContent = 'Ranger ' + r.no;
    byId('rName').textContent = r.name;
    var traits = byId('rTraits');
    traits.textContent = r.temperName + ', ' + r.quirkLabel;
    traits.style.color = cfg.look.temper[r.temperName];
    traits.title = r.past;
    var doing = r.alive ? (MODE_WORDS[r.mode] || r.mode) : 'dead';
    if (r.alive && r.plan && r.mode === 'travel') doing = PLAN_WORDS[r.plan.kind] || doing;
    var node = byId('rDoing');
    node.textContent = doing;
    node.className = r.alive && (r.mode === 'fight' || r.mode === 'flee' || r.mode === 'shelter' || r.mode === 'climb') ? 'doing urgent' : 'doing';
    var html = '';
    if (r.alive) {
      html += meter('health', r.hp, cfg.ranger.hpMax, 'hp');
      html += meter('food', r.energy, cfg.ranger.energyMax, 'energy');
    }
    byId('rMeters').innerHTML = html;
    byId('rPack').textContent = r.alive
      ? (r.pack.weapons.length ? r.pack.weapons.join(' + ') : 'unarmed') + ', ' + r.pack.ammo + ' rounds, ' +
        (r.pack.grenade ? r.pack.grenade + (r.pack.grenade === 1 ? ' grenade, ' : ' grenades, ') : '') +
        r.pack.food + ' food, ' + r.pack.med + ' med'
      : '';
  };

  // Seconds until the tide truly reaches this cell. Only Zero can know this.
  function tideArrival(sim, cell) {
    var c = sim.cfg.tide;
    var tide = sim.tide;
    var front = Math.min(1, tide.front[cell]);
    if (tide.phase === 'calm') return tide.timer / sim.cfg.sim.ticksPerSecond + front * c.surge;
    if (tide.phase === 'surge') return Math.max(0, (front - tide.level) * c.surge);
    return 0;
  }

  // The moment Zero exists for: the ranger thinks they have time, and they don't.
  RZ.wontMakeIt = function (sim) {
    var r = sim.ranger;
    if (!r.alive || r.mode === 'shelter' || r.mode === 'climb') return false;
    var cell = r.x + r.y * sim.world.w;
    if (sim.world.safeMask[cell] || sim.tide.phase === 'retreat' || sim.tide.phase === 'hold') return false;
    var shelter = RZ.nearestSafe(r, sim.book, { x: r.x, y: r.y });
    if (!shelter) return false;
    return tideArrival(sim, cell) < shelter.seconds * 1.15 + 4;
  };

  // A danger on the ranger's route that they don't know about.
  RZ.hiddenThreat = function (sim) {
    var r = sim.ranger;
    if (!r.alive || !r.path) return null;
    var world = sim.world;
    var map = r.map;
    var known = function (a) { return map.anomalies.some(function (k) { return k.x === a.x && k.y === a.y; }); };
    var warned = function (a) {
      return map.warnings.some(function (mark) { return Math.abs(mark.x - a.x) <= 6 && Math.abs(mark.y - a.y) <= 6; });
    };
    var last = Math.min(r.path.length, r.pathAt + 36);
    for (var i = r.pathAt; i < last; i += 2) {
      var x = r.path[i] % world.w;
      var y = Math.floor(r.path[i] / world.w);
      for (var n = 0; n < sim.anomalies.length; n++) {
        var a = sim.anomalies[n];
        if (a.spent || known(a) || warned(a)) continue;
        if (Math.abs(a.x - x) <= 2 && Math.abs(a.y - y) <= 2) return { x: a.x, y: a.y, kind: 'pocket' };
      }
    }
    return null;
  };

  // The sum every trip depends on: time left, against the walk home.
  Panel.prototype.updateHud = function () {
    var sim = this.sim;
    var cfg = sim.cfg;
    var r = sim.ranger;
    var book = sim.book;
    var tide = sim.tide;
    var zeroSees = this.getView() !== 'ranger';
    var now = sim.tick / cfg.sim.ticksPerSecond;
    var chapter = sim.chapter;
    var mission = book.mission;

    byId('hudChapter').textContent = 'Chapter ' + chapter.no + '  ·  tide ' + Math.max(0, tide.number - chapter.startTide) + ' of ' + cfg.chapter.tides;
    byId('hudMission').textContent = 'Survey ' + mission.name + (mission.attempts ? ', attempt ' + mission.attempts : '') +
      '  ·  ' + (chapter.surveyed ? chapter.surveyed.length : 0) + ' of ' + book.sites.length + ' sites';

    var bar = byId('windowBar');
    var fill = byId('windowFill');
    var walkMark = byId('windowWalk');
    var trueMark = byId('windowTrue');
    var left = byId('hudLeft');
    var right = byId('hudTrue');
    var span = book.tide.window;

    var alarm = byId('hudAlarm');
    var turnBack = document.querySelector('button[data-call="turnback"]');
    var warnButton = document.querySelector('button[data-call="warn"]');
    var late = zeroSees && RZ.wontMakeIt(sim);
    var threat = zeroSees ? RZ.hiddenThreat(sim) : null;
    this.threat = threat;
    this.late = late;
    turnBack.classList.toggle('alarm', late);
    warnButton.classList.toggle('alarm', !!threat);
    if (late) alarm.textContent = r.first + ' won\'t make it back.';
    else if (threat) alarm.textContent = 'There\'s a pocket on ' + r.first + '\'s route. They can\'t see it.';
    else alarm.textContent = '';
    alarm.className = late || threat ? 'show' : '';

    if (!r.alive) {
      bar.className = 'dead';
      fill.style.width = '0%';
      walkMark.style.display = 'none';
      trueMark.style.display = 'none';
      left.textContent = 'No ranger in the field';
      right.textContent = '';
      return;
    }

    var cell = r.x + r.y * sim.world.w;
    var underGold = sim.world.safeMask[cell] === 1;
    var shelter = underGold ? null : RZ.nearestSafe(r, book, { x: r.x, y: r.y });
    var walkText = shelter ? Math.ceil(shelter.seconds) + 's walk to ' + shelter.place.name : 'under gold';

    if (tide.phase !== 'calm') {
      bar.className = 'tide';
      fill.style.width = Math.round(Math.min(1, tide.level) * 100) + '%';
      walkMark.style.display = 'none';
      trueMark.style.display = 'none';
      var gap = sim.tide.front[cell] - tide.level;
      var words = (tide.greater ? 'Greater tide, ' : 'Tide ') + TIDE_WORDS[tide.phase];
      if (underGold) left.textContent = words + '. ' + r.first + ' is under gold.';
      else if (gap > 0 && tide.phase === 'surge') left.textContent = words + '. ' + walkText + '.';
      else left.textContent = words + '.';
      right.textContent = !underGold && zeroSees && gap > 0 && tide.phase === 'surge' ? 'reaches ' + r.first + ' in ' + Math.ceil(tideArrival(sim, cell)) + 's' : '';
      return;
    }

    var seconds = RZ.timeLeft(book, now, r);
    var shown = Math.max(0, seconds);
    fill.style.width = Math.round(Math.min(1, shown / span) * 100) + '%';
    var state = 'good';
    if (shelter) {
      var margin = seconds - shelter.seconds * (1 + cfg.planner.routeSlack) - cfg.planner.buffer;
      if (margin < 0) state = 'late';
      else if (margin < 10) state = 'tight';
      walkMark.style.display = 'block';
      walkMark.style.left = Math.min(100, shelter.seconds / span * 100) + '%';
    } else {
      walkMark.style.display = 'none';
    }
    bar.className = state;
    var trueSeconds = tideArrival(sim, cell);
    if (zeroSees) {
      trueMark.style.display = 'block';
      trueMark.style.left = Math.min(100, trueSeconds / span * 100) + '%';
      right.textContent = 'reaches ' + r.first + ' in ' + Math.ceil(trueSeconds) + 's';
    } else {
      trueMark.style.display = 'none';
      right.textContent = '';
    }
    var estimate = seconds > 0 ? Math.ceil(seconds) + 's by the journal' : 'overdue by the journal';
    left.textContent = estimate + (shelter ? '  ·  ' + walkText : '');
  };

  // Call buttons show their cost, and whether this ranger would go along with it.
  Panel.prototype.updateRadio = function () {
    var sim = this.sim;
    var r = sim.ranger;
    var book = sim.book;
    var cfg = sim.cfg;
    var zero = book.zero;
    var pips = '';
    for (var n = 0; n < cfg.radio.signalMax; n++) pips += '<i class="' + (n < sim.signal ? 'on' : '') + '"></i>';
    byId('signal').innerHTML = pips;
    var trust = byId('trustFill');
    trust.style.width = zero.trust + '%';
    trust.className = zero.trust >= 60 ? 'high' : zero.trust < 35 ? 'low' : '';
    byId('trustText').textContent = 'trust ' + Math.round(zero.trust) + (zero.right + zero.wrong ? ',  ' + zero.right + ' right, ' + zero.wrong + ' wrong' : '');
    document.querySelectorAll('#radioControls button[data-call]').forEach(function (button) {
      var type = button.dataset.call;
      var can = RZ.canCall(sim, type);
      button.disabled = !can;
      var cost = RZ.callCost(cfg, type);
      if (!cost) return;
      var note = button.querySelector('small');
      if (r.alive) {
        var will = RZ.willHeed(r, book, type);
        note.textContent = will ? 'will heed' : 'may refuse';
        note.className = will ? 'will' : 'wont';
      } else {
        note.textContent = '';
      }
    });
  };

  Panel.prototype.updateLog = function () {
    var sim = this.sim;
    if (this.logged >= sim.talkSeq) return;
    var node = this.logNode;
    var self = this;
    var pinned = node.scrollHeight - node.scrollTop - node.clientHeight < 30;
    sim.talk.forEach(function (line) {
      if (line.seq <= self.logged) return;
      self.logged = line.seq;
      var p = document.createElement('p');
      p.className = line.kind + (line.last ? ' last' : '');
      var who = document.createElement('b');
      who.textContent = line.who;
      p.appendChild(who);
      p.appendChild(document.createTextNode(line.text));
      node.appendChild(p);
    });
    while (node.childNodes.length > 80) node.removeChild(node.firstChild);
    if (pinned) node.scrollTop = node.scrollHeight;
  };

  Panel.prototype.updateJournal = function () {
    var entries = this.sim.book.entries;
    if (this.written >= entries.length) return;
    var node = this.journalNode;
    var pinned = node.scrollHeight - node.scrollTop - node.clientHeight < 40;
    for (; this.written < entries.length; this.written++) {
      var entry = entries[this.written];
      var line = document.createElement('p');
      line.className = entry.kind;
      var stamp = document.createElement('time');
      stamp.textContent = clockText(entry.tick, this.sim.cfg);
      line.appendChild(stamp);
      line.appendChild(document.createTextNode(entry.text));
      node.appendChild(line);
    }
    while (node.childNodes.length > this.sim.cfg.look.journalLines) node.removeChild(node.firstChild);
    if (pinned) node.scrollTop = node.scrollHeight;
  };

  Panel.prototype.update = function () {
    this.updateJournal();
    this.updateLog();
    if (Math.abs(this.sim.tick - this.lastStatus) < 3) return;
    this.lastStatus = this.sim.tick;
    this.updateStatus();
    this.updateHud();
    this.updateRadio();
  };

  // The text panels start over, because the first ranger was swapped before anything happened.
  Panel.prototype.restart = function () {
    this.journalNode.innerHTML = '';
    this.logNode.innerHTML = '';
    this.written = 0;
    this.logged = 0;
    this.faceKey = '';
    this.refresh();
  };

  // A pause still needs the panel to catch up with what was just pressed.
  Panel.prototype.refresh = function () {
    this.lastStatus = -100;
    this.update();
  };

  RZ.makePanel = function (sim, getView) {
    return new Panel(sim, getView);
  };

  RZ.clockText = clockText;
})();
