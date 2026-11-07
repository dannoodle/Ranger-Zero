// Starts the app in the browser: reads URL options, runs the sim, draws frames and wires up the controls.
// The wall clock only decides how many fixed ticks to run. It never reaches the sim.

(function () {
  var SPEEDS = [0, 'auto', 1, 2, 5, 20, 60];
  var MAX_FRAME_SECONDS = 0.25;
  var MAX_STEP_MS = 24;
  var CARD_SPEED_LIMIT = 5;      // above this, deaths pass by without stopping for a card
  var FX_SPEED_LIMIT = 8;        // above this, effects would only be noise
  var VIEW_OPTIONS = ['seed', 'speed', 'view', 'skip', 'cards', 'camera'];  // everything else is a config override

  function readOptions() {
    var params = new URLSearchParams(location.search);
    params.forEach(function (value, key) {
      if (VIEW_OPTIONS.indexOf(key) >= 0) return;
      try {
        applyConfigOverride(CFG, key, value);
      } catch (error) {
        console.warn(error.message);
      }
    });
    var seed = Number(params.get('seed'));
    var wanted = params.get('speed');
    return {
      seed: params.has('seed') && !isNaN(seed) ? seed : CFG.seed,
      speed: wanted === null ? 'auto' : (wanted === 'auto' ? 'auto' : Number(wanted)),
      view: params.get('view'),
      skip: Number(params.get('skip')) || 0,
      cards: params.get('cards') !== '0',
      camera: params.get('camera')
    };
  }

  var options = readOptions();
  var sim = RZ.createSim(CFG, options.seed);
  var camera = RZ.makeCamera(sim);
  var renderer = RZ.makeRenderer(document.getElementById('map'), sim, camera);
  var audio = RZ.makeAudio();
  var viewMode = 'dual';
  var panel = RZ.makePanel(sim, function () { return viewMode; });
  var speed = SPEEDS.indexOf(options.speed) >= 0 && options.speed !== 0 ? options.speed : 'auto';
  var held = false;              // the sim waits while a card is up
  var beat = 0;                  // real seconds left of the pause after a death
  var pendingRecord = null;
  var talkHold = 0;              // real seconds left at talking pace
  var tool = null;               // the map mark waiting for a click
  var seenEvent = 0;
  var owed = 0;
  var lastTime = null;
  var mapHint = document.getElementById('mapHint');
  var storeCard = RZ.makeStoreCard(sim, function () { return viewMode; });
  var boardBox = RZ.makeBoardBox(sim, function (call) { sendCall(call); boardBox.update(); });
  var overlays = RZ.makeOverlays(sim, {
    resume: function () { held = false; },
    onPick: function () { audio.start(); panel.refresh(); },
    onFirstPick: function () {
      // The first ranger has been waiting at tick 0. Apply the pick now, then redraw the text.
      audio.start();
      RZ.stepSim(sim);
      panel.restart();
      seenEvent = sim.eventSeq;
    },
    showTrack: function (record) { renderer.highlight = record; }
  });

  // How fast auto runs: quick through the waiting, slow when someone might die.
  function autoSpeed() {
    var pace = CFG.look.pace;
    var r = sim.ranger;
    if (talkHold > 0) return pace.talk;
    // Zero can see something coming. Leave time to do something about it.
    if (panel.late || panel.threat) return pace.danger;
    if (!r.alive) return pace.tide;
    var world = sim.world;
    var cell = r.x + r.y * world.w;
    var underGold = world.safeMask[cell] === 1;
    var tideOn = sim.tide.phase !== 'calm';
    if (underGold && (r.mode === 'wait' || r.mode === 'plan')) return tideOn ? pace.tide : pace.wait;
    if (r.hp < CFG.ranger.hpMax * 0.3) return pace.crisis;
    if (tideOn && !underGold) {
      var gap = sim.tide.front[cell] - sim.tide.level;
      if (gap < 0.12) return pace.crisis;
      return pace.danger;
    }
    if (r.mode === 'fight' || r.mode === 'flee' || r.mode === 'shelter') return pace.danger;
    for (var i = 0; i < sim.scavs.length; i++) {
      var s = sim.scavs[i];
      if (Math.abs(s.x - r.x) <= r.sight && Math.abs(s.y - r.y) <= r.sight && RZ.canSee(sim, s.x, s.y)) return pace.danger;
    }
    return pace.road;
  }

  function currentSpeed() {
    if (held || beat > 0) return 0;
    return speed === 'auto' ? autoSpeed() : speed;
  }

  function buildSpeedButtons() {
    var holder = document.getElementById('speeds');
    SPEEDS.forEach(function (value) {
      var button = document.createElement('button');
      button.textContent = value === 0 ? 'pause' : (value === 'auto' ? 'auto' : value + 'x');
      if (value === 'auto') button.title = 'Fast through the waiting, slow when it matters';
      button.dataset.speed = value;
      button.addEventListener('click', function () { setSpeed(value); });
      holder.appendChild(button);
    });
  }

  function setSpeed(value) {
    speed = value;
    document.querySelectorAll('#speeds button').forEach(function (button) {
      button.classList.toggle('on', button.dataset.speed === String(value));
    });
  }

  var VIEWS = [
    { id: 'ranger', label: 'ranger', hint: 'What the ranger knows' },
    { id: 'full', label: 'full', hint: 'Everything' },
    { id: 'dual', label: 'dual', hint: 'Everything, with what the ranger knows laid over it' }
  ];

  function buildViewButtons() {
    var holder = document.getElementById('views');
    VIEWS.forEach(function (view, n) {
      var button = document.createElement('button');
      button.textContent = view.label;
      button.title = view.hint + '. Key ' + (n + 1);
      button.dataset.view = view.id;
      button.addEventListener('click', function () { setView(view.id); });
      holder.appendChild(button);
    });
  }

  function setView(id) {
    viewMode = id;
    renderer.setMode(id);
    document.querySelectorAll('#views button').forEach(function (button) {
      button.classList.toggle('on', button.dataset.view === id);
    });
    panel.refresh();
  }

  function setCamera(mode) {
    camera.setMode(mode);
    syncCameraButtons();
  }

  function syncCameraButtons() {
    document.querySelectorAll('#cameras button').forEach(function (button) {
      button.classList.toggle('on', button.dataset.camera === camera.mode);
    });
  }

  function buildCameraButtons() {
    var holder = document.getElementById('cameras');
    [['auto', 'auto', 'Stay close to the ranger. Key F'], ['map', 'map', 'The whole map. Key M']].forEach(function (entry) {
      var button = document.createElement('button');
      button.textContent = entry[1];
      button.title = entry[2];
      button.dataset.camera = entry[0];
      button.addEventListener('click', function () { setCamera(entry[0]); });
      holder.appendChild(button);
    });
  }

  function sendCall(call) {
    audio.start();
    RZ.queueCall(sim, call);
    talkHold = CFG.look.pace.talkSeconds;
  }

  var TOOL_HINTS = {
    warn: 'Click the map to warn {who} off a spot.',
    send: 'Click the map to send {who} to a spot.',
    crate: 'Click the map to drop a crate. Inside a gold ring it goes straight into the stash.'
  };

  function setTool(type) {
    tool = tool === type ? null : type;
    document.querySelectorAll('#radioControls button[data-tool]').forEach(function (button) {
      button.classList.toggle('on', button.dataset.tool === tool);
    });
    document.getElementById('stage').classList.toggle('aiming', !!tool);
    mapHint.textContent = tool ? TOOL_HINTS[tool].replace('{who}', sim.ranger.first) + ' Esc cancels.' : '';
    mapHint.className = tool ? 'show' : '';
  }

  function useButton(button) {
    if (button.disabled) return;
    if (button.dataset.tool) setTool(button.dataset.tool);
    else sendCall({ type: button.dataset.call });
  }

  function setupRadio() {
    document.querySelectorAll('#radioControls button[data-call]').forEach(function (button) {
      button.addEventListener('click', function () { useButton(button); });
    });
  }

  function setupMap() {
    var canvas = document.getElementById('map');
    var dragging = null;
    canvas.addEventListener('wheel', function (event) {
      event.preventDefault();
      camera.zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15);
      syncCameraButtons();
    }, { passive: false });
    canvas.addEventListener('pointerdown', function (event) {
      dragging = { x: event.clientX, y: event.clientY, moved: 0 };
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch (error) {
        // Only a real pointer can be captured. Dragging still works without it.
      }
    });
    canvas.addEventListener('pointermove', function (event) {
      if (!dragging) return;
      var dx = event.clientX - dragging.x;
      var dy = event.clientY - dragging.y;
      dragging.moved += Math.abs(dx) + Math.abs(dy);
      dragging.x = event.clientX;
      dragging.y = event.clientY;
      if (dragging.moved < 6) return;
      camera.drag(dx * renderer.dpr / renderer.scale, dy * renderer.dpr / renderer.scale);
      syncCameraButtons();
    });
    canvas.addEventListener('pointerup', function (event) {
      var click = dragging && dragging.moved < 6;
      dragging = null;
      if (!click) return;
      var cell = renderer.toCell(event.clientX, event.clientY);
      if (!cell) return;
      if (!tool) {
        storeCard.toggle(RZ.safeAtCell(sim, cell));
        return;
      }
      var type = tool;
      setTool(tool);
      sendCall({ type: type, x: cell.x, y: cell.y });
    });
  }

  function setupKeys() {
    var resume = 'auto';
    var byKey = { t: 'turnback', p: 'pushon', w: 'warn', s: 'send', c: 'crate' };
    document.addEventListener('pointerdown', function () { audio.start(); });
    document.addEventListener('keydown', function (event) {
      if (event.target.tagName === 'INPUT') return;
      audio.start();
      var key = event.key.toLowerCase();
      if (key === ' ') {
        event.preventDefault();
        if (speed !== 0) {
          resume = speed;
          setSpeed(0);
        } else {
          setSpeed(resume);
        }
      } else if (VIEWS[Number(key) - 1]) {
        setView(VIEWS[Number(key) - 1].id);
      } else if (key === 'escape') {
        if (tool) setTool(tool);
        overlays.toggleHistory(false);
        storeCard.show(null);
      } else if (key === 'f') {
        setCamera('auto');
      } else if (key === 'm') {
        setCamera(camera.mode === 'map' ? 'auto' : 'map');
      } else if (key === 'h') {
        overlays.toggleHistory();
      } else if (key === 'n') {
        toggleSound();
      } else if (byKey[key]) {
        var button = document.querySelector('#radioControls button[data-call="' + byKey[key] + '"]');
        if (button) useButton(button);
      }
    });
  }

  function toggleSound() {
    audio.start();
    audio.setMuted(!audio.muted);
    document.getElementById('sound').textContent = audio.muted ? 'sound off' : 'sound on';
  }

  function goToSeed(seed) {
    var params = new URLSearchParams(location.search);
    params.set('seed', seed);
    location.search = params.toString();
  }

  function setupSeedForm() {
    var input = document.getElementById('seed');
    input.value = options.seed;
    document.getElementById('seedForm').addEventListener('submit', function (event) {
      event.preventDefault();
      goToSeed(Number(input.value) || 0);
    });
    document.getElementById('newSeed').addEventListener('click', function () {
      goToSeed(Math.floor(Math.random() * 1000000));
    });
    document.getElementById('sound').addEventListener('click', toggleSound);
    document.getElementById('historyButton').addEventListener('click', function () { overlays.toggleHistory(); });
  }

  // The sim reports what happened. This decides what the viewer sees and hears of it.
  function handleEvent(event, running) {
    var calm = running <= FX_SPEED_LIMIT;
    if (calm) renderer.fx.handle(event);
    if (event.type === 'say') {
      if (event.kind === 'ranger') {
        if (sim.ranger.alive || sim.tick - event.tick < 2) renderer.showSpeech(event);
        if (calm) audio.play('blip');
      } else if (event.kind === 'zero') {
        audio.play('zero');
      } else if (event.kind === 'old') {
        renderer.showSpeech(event);
        if (calm) audio.play('static');
      }
    } else if (event.type === 'shot' && calm) {
      audio.play(event.by === 'ranger' ? 'shot' : 'far-shot', undefined, { weapon: event.weapon, delay: (event.round || 0) * 0.075 });
    } else if (event.type === 'blast' && calm) {
      audio.play('blast');
    } else if (event.type === 'hurt' && calm && event.cause !== 'tide') {
      audio.play('hit');
    } else if (event.type === 'strike') {
      audio.play('strike');
    } else if (event.type === 'crate') {
      audio.play('crate');
    } else if (event.type === 'crate-land') {
      audio.play('thud');
    } else if (event.type === 'death') {
      audio.play('death');
      var cards = options.cards && running <= CARD_SPEED_LIMIT && speed !== 0;
      if (cards) {
        beat = 1.7;
        pendingRecord = sim.rangers[sim.rangers.length - 1];
      } else {
        var who = sim.rangers[sim.rangers.length - 1];
        overlays.toast(who.name + ' is dead.', 'red');
      }
    } else if (event.type === 'triumph') {
      audio.play('triumph');
      overlays.toast((event.title || event.name) + ': done', 'gold', 5);
    } else if (event.type === 'tide') {
      audio.play('tide');
      if (event.greater) overlays.toast('The greater tide', 'violet', 5);
      else if (calm) overlays.toast('The tide is rising', 'violet', 2.6);
    } else if (event.type === 'land-done') {
      overlays.toast('The whole board is done', 'gold', 6);
    } else if (event.type === 'reward') {
      if (calm) overlays.toast(event.inStash ? 'A reward came into the stash' : 'A reward cache turned up', 'gold', 3.5);
      audio.play('crate');
    } else if (event.type === 'board') {
      overlays.toast('A new board', 'gold', 4);
    } else if (event.type === 'old-rise') {
      overlays.toast(event.name + ' got up', 'violet', 4);
      audio.play('static');
    } else if (event.type === 'old-down') {
      overlays.toast(event.name + ' is at rest', 'gold', 3.5);
    } else if (event.type === 'chapter') {
      camera.wide = 5;
      if (options.cards && running <= CARD_SPEED_LIMIT && speed !== 0) {
        held = true;
        overlays.showChapter(event);
      } else {
        overlays.toast('Chapter ' + event.chapter, 'gold', 5);
      }
    }
  }

  function readEvents(running) {
    var events = sim.events;
    for (var i = 0; i < events.length; i++) {
      if (events[i].seq <= seenEvent) continue;
      seenEvent = events[i].seq;
      handleEvent(events[i], running);
    }
  }

  function soundState() {
    var r = sim.ranger;
    var tide = 0;
    var heart = 0;
    if (r.alive) {
      var cell = r.x + r.y * sim.world.w;
      if (sim.tide.phase !== 'calm') {
        var gap = Math.abs(sim.tide.front[cell] - sim.tide.level);
        tide = sim.world.safeMask[cell] ? 0.35 : Math.max(0.2, 1 - Math.min(1, gap * 4));
      }
      var hurt = 1 - r.hp / CFG.ranger.hpMax;
      heart = hurt > 0.6 ? (hurt - 0.6) / 0.4 : 0;
    }
    return { tide: tide, heart: heart };
  }

  function frame(time) {
    if (lastTime === null) lastTime = time;
    var seconds = Math.min((time - lastTime) / 1000, MAX_FRAME_SECONDS);
    lastTime = time;
    if (talkHold > 0) talkHold -= seconds;
    if (beat > 0) {
      beat -= seconds;
      if (beat <= 0 && pendingRecord) {
        held = true;
        overlays.showDeath(pendingRecord);
        pendingRecord = null;
      }
    }
    var running = currentSpeed();
    owed += seconds * CFG.sim.ticksPerSecond * running;
    var started = performance.now();
    while (owed >= 1) {
      RZ.stepSim(sim);
      owed -= 1;
      // Stop the moment something needs the viewer's attention.
      if (sim.eventSeq > seenEvent) {
        readEvents(running);
        if (beat > 0 || held) {
          owed = 0;
          break;
        }
      }
      if (performance.now() - started > MAX_STEP_MS) {
        owed = Math.min(owed, CFG.sim.ticksPerSecond);
        break;
      }
    }
    readEvents(running);
    overlays.tick(seconds);
    overlays.updateLine();
    renderer.threat = panel.threat;
    camera.update(seconds);
    renderer.draw(seconds);
    panel.update();
    storeCard.update();
    boardBox.update();
    audio.update(soundState());
    document.body.dataset.pace = running;
    requestAnimationFrame(frame);
  }

  for (var skipped = 0; skipped < options.skip; skipped++) RZ.stepSim(sim);
  seenEvent = sim.eventSeq;

  buildSpeedButtons();
  buildViewButtons();
  buildCameraButtons();
  setSpeed(speed);
  setView(VIEWS.some(function (view) { return view.id === options.view; }) ? options.view : 'dual');
  setCamera(options.camera === 'map' ? 'map' : 'auto');
  setupSeedForm();
  setupRadio();
  setupMap();
  setupKeys();
  camera.zoom = camera.mode === 'map' ? 1 : camera.zoom;
  if (options.cards && sim.tick === 0) {
    held = true;
    overlays.showIntro();
  }
  // For poking at a running game from the browser console.
  window.RZdebug = { sim: sim, camera: camera, overlays: overlays, audio: audio, renderer: renderer, storeCard: storeCard };
  requestAnimationFrame(frame);
})();
