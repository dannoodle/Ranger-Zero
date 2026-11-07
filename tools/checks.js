// Acceptance checks: the rules this project depends on, as a tool rather than something done by hand.
//   node tools/checks.js [--seeds 6] [--ticks 9000]
// Exits non-zero if anything fails.

const fs = require('fs');
const path = require('path');
const { loadSim, parseArgs } = require('./load');

const options = parseArgs(process.argv.slice(2), { seeds: 6, ticks: 9000 });
const { RZ, CFG } = loadSim();
const root = path.join(__dirname, '..');
let failures = 0;
let passed = 0;

function check(name, ok, detail) {
  if (ok) {
    passed++;
    console.log('  ok    ' + name);
  } else {
    failures++;
    console.log('  FAIL  ' + name + (detail ? ': ' + detail : ''));
  }
}

function section(title, run) {
  console.log('\n' + title);
  try {
    run();
  } catch (error) {
    failures++;
    console.log('  FAIL  ' + title + ' threw: ' + (error.stack || error));
  }
}

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

// Code with the comments and text taken out, so a word in a sentence isn't mistaken for a reference.
function bare(code) {
  return code.replace(/\/\/.*$/gm, '').replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
}

function run(seed, ticks, script) {
  const sim = RZ.createSim(CFG, seed, script);
  for (let t = 0; t < ticks; t++) RZ.stepSim(sim);
  return sim;
}

// A little generator of our own for choosing calls, so the checks repeat too.
function chooser(seed) {
  let state = seed * 2654435761 >>> 0;
  return function (n) {
    state = (state * 1664525 + 1013904223) >>> 0;
    return (state >>> 8) % n;
  };
}

function randomCalls(seed, ticks, count) {
  const pick = chooser(seed + 77);
  const types = ['turnback', 'pushon', 'warn', 'send', 'crate', 'how', 'plan', 'know', 'zero', 'recruit', 'hold', 'board'];
  const script = [];
  for (let n = 0; n < count; n++) {
    const type = types[pick(types.length)];
    const call = { tick: 2 + pick(ticks - 4), type: type };
    if (type === 'warn' || type === 'send' || type === 'crate') {
      call.x = pick(CFG.map.width);
      call.y = pick(CFG.map.height);
    }
    if (type === 'recruit') call.pick = pick(3);
    if (type === 'hold') call.on = pick(2) === 1;
    script.push(call);
  }
  return script.sort((a, b) => a.tick - b.tick);
}

section('Rules that are checked by reading the code', () => {
  for (const file of ['src/sim/brain.js', 'src/sim/planner.js']) {
    const code = bare(read(file));
    check(file + ' never touches the sim', !/(?<![.\w])sim\b/.test(code), (code.match(/.*(?<![.\w])sim\b.*/) || [''])[0].trim());
    check(file + ' never reads the world', !/\bworld\b/.test(code));
  }
  const simFiles = fs.readdirSync(path.join(root, 'src/sim')).map(name => 'src/sim/' + name);
  for (const file of simFiles) {
    const code = bare(read(file));
    if (/document\.|window\.|requestAnimationFrame/.test(code)) check(file + ' has no DOM', false);
  }
  check('sim files never touch the DOM', true);
  // A plan's reasoning is written for the view. If the sim ever read it, explaining would change what happens.
  const readers = simFiles.filter(file => file !== 'src/sim/planner.js' && /\.(trace|brief)\b/.test(bare(read(file))));
  check('only the planner touches a plan\'s trace and brief', readers.length === 0, readers.join(', '));
  const look = simFiles.filter(file => /\.look\b/.test(read(file)));
  check('nothing in the sim reads CFG.look', look.length === 0, look.join(', '));
  const html = read('index.html');
  check('no ES modules', !/type="module"/.test(html));
  const view = fs.readdirSync(path.join(root, 'src/view')).filter(name => name.endsWith('.js')).map(name => 'src/view/' + name);
  const writes = /\b(sim|r|ranger)\.(tick|signal|hp|energy|pack|items|scavs|olds|bodies)\s*=[^=]/;
  const bad = view.filter(file => writes.test(read(file)));
  check('the view never writes sim state', bad.length === 0, bad.join(', '));
});

section('Every line of dialogue is reachable and complete', () => {
  const code = ['src/sim/brain.js', 'src/sim/planner.js', 'src/sim/sim.js', 'src/sim/enemies.js', 'src/sim/oldselves.js', 'src/sim/anomaly.js', 'src/sim/objectives.js']
    .map(read).join('\n');
  const used = new Set([...code.matchAll(/(?:say|speak)\([^'\n]*'(\w+)'/g)].map(match => match[1]).filter(key => !key.endsWith('_')));
  ['setout_survey', 'setout_again', 'meet_trust', 'meet_doubt', 'first', 'first_line', 'muse', 'muse_tide', 'walk', 'walk_new', 'walk_forest',
   'walk_water', 'hurt', 'hurt_bad', 'safe', 'safe_close', 'wrong_turnback', 'right', 'right_ignored', 'wrong', 'found_rifle', 'crate_got',
   'ack_warn', 'no_warn'].forEach(key => used.add(key));
  for (const cause of ['tide', 'scavenger', 'anomaly', 'starved', 'oldself']) used.add('last_' + cause);
  const missing = [...used].filter(key => !RZ.VOICE[key]);
  check('every key spoken has lines', missing.length === 0, missing.join(', '));
  const unused = Object.keys(RZ.VOICE).filter(key => !used.has(key));
  check('every set of lines gets spoken', unused.length === 0, unused.join(', '));
});

section('Seeds repeat exactly', () => {
  for (let seed = 1; seed <= options.seeds; seed++) {
    const a = RZ.fingerprint(run(seed, options.ticks));
    const b = RZ.fingerprint(run(seed, options.ticks));
    check('seed ' + seed, a === b, a + ' then ' + b);
  }
});

section('A run with radio calls replays exactly', () => {
  for (let seed = 1; seed <= options.seeds; seed++) {
    const script = randomCalls(seed, options.ticks, 60);
    const first = run(seed, options.ticks, script);
    const replay = first.callLog.map(call => Object.assign({}, call));
    const second = run(seed, options.ticks, replay);
    check('seed ' + seed + ' with ' + script.length + ' calls', RZ.fingerprint(first) === RZ.fingerprint(second));
  }
});

section('Talk never changes what happens', () => {
  const seed = 3;
  const before = run(seed, options.ticks);
  const speak = RZ.speak;
  RZ.speak = function () { return false; };
  const after = run(seed, options.ticks);
  RZ.speak = speak;
  const strip = sim => [sim.ranger.no, sim.ranger.x, sim.ranger.y, sim.ranger.hp, sim.tide.number, JSON.stringify(sim.stashes), sim.items.length, sim.scavs.length].join('|');
  check('same outcome with every line silenced', strip(before) === strip(after), strip(before) + ' vs ' + strip(after));
});

section('The tide', () => {
  const sim = RZ.createSim(CFG, 5);
  const world = sim.world;
  let peak = 0;
  let touchedSafe = false;
  let cycled = false;
  for (let t = 0; t < 2500; t++) {
    RZ.stepSim(sim);
    peak = Math.max(peak, sim.tide.level);
    if (sim.tide.level > 0.9 && sim.world === world) {
      for (let i = 0; i < world.safeMask.length; i++) if (world.safeMask[i] && RZ.tideCovers(sim, i)) touchedSafe = true;
    }
    if (peak > 0.9 && sim.tide.level === 0) cycled = true;
  }
  check('rises to full flood', peak >= 1);
  check('never crosses gold', !touchedSafe);
  check('pulls back', cycled);
  const valley = [];
  const ridge = [];
  const front = sim.tide.front;
  for (let i = 0; i < front.length; i++) {
    if (front[i] > 1) continue;
    const x = i % sim.world.w;
    const y = Math.floor(i / sim.world.w);
    if (Math.min(x, y, sim.world.w - 1 - x, sim.world.h - 1 - y) < 18) continue;
    (sim.world.elev[i] > 0.7 ? ridge : valley).push(front[i]);
  }
  const mean = list => list.reduce((a, b) => a + b, 0) / list.length;
  check('ridges flood later than valleys', mean(ridge) > mean(valley), mean(ridge).toFixed(3) + ' vs ' + mean(valley).toFixed(3));
});

section('Respawn rule', () => {
  let stocked = 0;
  let bare = 0;
  for (let seed = 1; seed <= options.seeds; seed++) {
    const sim = RZ.createSim(CFG, seed);
    let wasAlive = true;
    let stash = null;
    for (let t = 0; t < 12000; t++) {
      const before = sim.lastSafe;
      const had = before && before !== 'home' && sim.stashes[before] && RZ.holdsGear(sim.stashes[before]);
      RZ.stepSim(sim);
      if (wasAlive && !sim.ranger.alive) stash = { had: had, id: before };
      if (!wasAlive && sim.ranger.alive && stash) {
        const r = sim.ranger;
        const empty = r.pack.food + r.pack.ammo + r.pack.med === 0 && r.pack.weapons.length === 0;
        if (stash.had) {
          stocked++;
          if (!empty) check('arrives with nothing at a stocked outpost', false, 'seed ' + seed);
        } else {
          bare++;
          if (empty) check('arrives with the free kit at home', false, 'seed ' + seed);
        }
        stash = null;
      }
      wasAlive = sim.ranger.alive;
    }
  }
  check('checked ' + stocked + ' outpost and ' + bare + ' home arrivals', stocked + bare > 0);
});

section('Radio', () => {
  const sim = RZ.createSim(CFG, 2);
  const start = sim.signal;
  RZ.queueCall(sim, { type: 'turnback' });
  RZ.stepSim(sim);
  check('a call spends signal', sim.signal === start - CFG.radio.costs.turnback);
  sim.signal = 0;
  RZ.queueCall(sim, { type: 'crate', x: 10, y: 10 });
  RZ.stepSim(sim);
  check('no signal, no crate', sim.crates.length === 0);
  check('questions are free', RZ.canCall(sim, 'how'));
  sim.signal = 3;
  const post = sim.world.safe[1];
  RZ.queueCall(sim, { type: 'crate', x: post.x, y: post.y });
  for (let t = 0; t < 80; t++) RZ.stepSim(sim);
  check('a crate in a ring lands in the stash', sim.stashes[post.id].ammo >= CFG.radio.crate.ammo);

  const r = sim.ranger;
  const book = sim.book;
  const saved = book.zero.trust;
  r.temperName = 'reckless';
  r.temper = CFG.people.tempers.reckless;
  book.zero.trust = 50;
  check('a reckless ranger may refuse to turn back', !RZ.willHeed(r, book, 'turnback'));
  check('a reckless ranger will push on', RZ.willHeed(r, book, 'pushon'));
  r.temper = CFG.people.tempers.cautious;
  check('a cautious ranger will turn back', RZ.willHeed(r, book, 'turnback'));
  check('a cautious ranger may refuse to push on', !RZ.willHeed(r, book, 'pushon'));
  book.zero.trust = 100;
  check('with enough trust, even that changes', RZ.willHeed(r, book, 'pushon'));
  book.zero.trust = saved;
});

section('A greater tide', () => {
  const seed = 2;
  const sim = RZ.createSim(CFG, seed);
  const firstWorld = sim.world;
  let before = null;
  for (let t = 0; t < 26000 && sim.world === firstWorld; t++) {
    if (sim.tide.greater && !before) {
      before = { names: sim.world.safe.map(s => s.name), lessons: JSON.stringify(sim.book.lessons), trust: sim.book.zero.trust };
    }
    RZ.stepSim(sim);
  }
  check('the land changes', sim.world !== firstWorld);
  check('chapter 2 begins', sim.chapter.no === 2);
  const seen = sim.book.map.seen.reduce((sum, cell) => sum + cell, 0);
  check('the journal\'s map is wiped', seen < 800, seen + ' cells known');
  check('lessons survive', before && JSON.stringify(sim.book.lessons) === before.lessons);
  check('only the home stash has anything in it', Object.keys(sim.stashes).every(id => id === 'home' || !RZ.holdsGear(sim.stashes[id])));
  check('the new land has a full board', sim.book.objectives.length === sim.board.objectives.length &&
    ['survey', 'clear', 'retrieve', 'stock'].every(type => sim.board.objectives.some(o => o.type === type)));
  check('the new board is all open', sim.book.objectives.every(o => !o.done));
  check('no problems in the new land', sim.world.problems.length === 0);
});

section('The board', () => {
  const types = ['survey', 'clear', 'retrieve', 'stock'];
  let full = 0;
  let unreachable = [];
  for (let seed = 1; seed <= options.seeds * 3; seed++) {
    const sim = RZ.createSim(CFG, seed);
    const { w, h, moveCost } = sim.world;
    const home = sim.world.home.x + sim.world.home.y * w;
    if (types.every(type => sim.board.objectives.some(o => o.type === type))) full++;
    for (const o of sim.board.objectives) {
      if (!RZ.findPath(w, h, moveCost, home, o.x + o.y * w)) unreachable.push('seed ' + seed + ' ' + o.title);
    }
  }
  check('every board has all four kinds (' + full + ' of ' + options.seeds * 3 + ')', full === options.seeds * 3);
  check('every objective can be walked to', unreachable.length === 0, unreachable.join(', '));

  // Rewards and relics, over a long run.
  const relics = sim => sim.items.filter(i => i.kind === 'relic').length + (sim.ranger.alive ? sim.ranger.pack.relic : 0) +
    sim.bodies.reduce((n, b) => n + (b.pack.relic || 0), 0) + sim.olds.reduce((n, o) => n + (o.pack.relic || 0), 0) +
    Object.values(sim.stashes).reduce((n, s) => n + (s.relic || 0), 0);
  let lost = 0;
  let extra = 0;
  let rewards = 0;
  let finished = 0;
  for (let seed = 1; seed <= options.seeds; seed++) {
    const sim = RZ.createSim(CFG, seed);
    let phase = sim.tide.phase;
    for (let t = 0; t < options.ticks * 2; t++) {
      RZ.stepSim(sim);
      if (sim.tide.phase === 'calm' && phase !== 'calm') {
        const open = sim.board.objectives.filter(o => o.type === 'retrieve' && !o.done).length;
        const count = relics(sim);
        if (count < open) lost++;
        if (count > open) extra++;
      }
      phase = sim.tide.phase;
    }
    rewards += sim.stats.rewards || 0;
    finished += sim.stats.missions.length;
  }
  check('a relic is never lost for good', lost === 0, lost + ' tides without one');
  check('never more relics than the board asks for', extra === 0, extra + ' tides with too many');
  check('every finished objective paid a reward (' + rewards + ' for ' + finished + ')', rewards >= finished && finished > 0);

  // Zero's switches.
  const sim = RZ.createSim(CFG, 4);
  const first = sim.board.objectives.map(o => o.id).join();
  RZ.queueCall(sim, { type: 'board' });
  RZ.stepSim(sim);
  check('a new board replaces the old one', sim.board.no === 2 && sim.board.objectives.map(o => o.id).join() !== first);
  check('the journal has the new board', sim.book.objectives.every((o, n) => o.id === sim.board.objectives[n].id));
  check('only the new relic is out there', relics(sim) === sim.board.objectives.filter(o => o.type === 'retrieve').length);
  const replay = run(4, 200, sim.callLog.map(call => Object.assign({}, call)));
  const again = run(4, 200, sim.callLog.map(call => Object.assign({}, call)));
  check('a new board replays exactly', RZ.fingerprint(replay) === RZ.fingerprint(again));

  let held = 0;
  let broken = 0;
  for (let seed = 1; seed <= 3; seed++) {
    const holding = RZ.createSim(CFG, seed, [{ tick: 1, type: 'hold', on: true }]);
    const limit = (CFG.chapter.tides + 3) * (CFG.tide.calm + CFG.tide.surge + CFG.tide.hold + CFG.tide.retreat) * CFG.sim.ticksPerSecond;
    for (let t = 0; t < limit; t++) RZ.stepSim(holding);
    if (holding.chapter.no === 1 && holding.tide.number > CFG.chapter.tides) held++;
    if (holding.chapters.some(summary => !summary.complete)) broken++;
  }
  check('holding the land keeps it past ' + CFG.chapter.tides + ' tides (' + held + ' of 3 still there)', held > 0);
  check('a held land only goes once its board is done', broken === 0);
});

section('Random calls, on many seeds, for crashes and stuck rangers', () => {
  let longest = 0;
  for (let seed = 1; seed <= options.seeds * 2; seed++) {
    const script = randomCalls(seed * 13, options.ticks, 200);
    const sim = RZ.createSim(CFG, seed, script);
    let lastMove = 0;
    let lastX = -1;
    let lastY = -1;
    let frozen = 0;
    for (let t = 0; t < options.ticks; t++) {
      RZ.stepSim(sim);
      const r = sim.ranger;
      if (r.x !== lastX || r.y !== lastY || r.no !== frozen) {
        lastMove = sim.tick;
        lastX = r.x;
        lastY = r.y;
        frozen = r.no;
      }
      const inSafe = sim.world.safeMask[r.x + r.y * sim.world.w];
      if (!r.alive || inSafe) lastMove = sim.tick;
      longest = Math.max(longest, sim.tick - lastMove);
    }
    if (sim.rangers.some(rec => !rec.first)) check('every ranger has a name', false);
    if (!Number.isFinite(sim.ranger.hp) && sim.ranger.alive) check('seed ' + seed + ' health stays a number', false);
  }
  check('no crash in ' + options.seeds * 2 + ' fuzzed runs', true);
  const seconds = longest / CFG.sim.ticksPerSecond;
  check('nobody froze in the open for a minute', seconds < 60, seconds.toFixed(0) + 's');
});

console.log('\n' + passed + ' passed, ' + failures + ' failed');
process.exitCode = failures ? 1 : 0;
