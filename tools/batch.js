// Batch runs: many rangers with no browser, reporting how they died and how long missions took.
//   node tools/batch.js --seeds 20 --rangers 40 [--start 1] [--set tide.calm=90] [--check]
// Each seed runs until it has used up its rangers (or --maxtides passes).
// --check also runs every seed twice and fails if the two runs differ.

const { loadSim, parseArgs, applySets } = require('./load');

const options = parseArgs(process.argv.slice(2), { seeds: 20, rangers: 40, start: 1, maxtides: 400, check: false });
const sim = loadSim();
applySets(sim, options.set);
const { RZ, CFG } = sim;

function runSeed(seed) {
  const state = RZ.createSim(CFG, seed);
  const limitTicks = options.maxtides * 200 * CFG.sim.ticksPerSecond;
  while (state.rangerCount <= options.rangers && state.tick < limitTicks) RZ.stepSim(state);
  return state;
}

function median(values) {
  if (!values.length) return NaN;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;
}

const deaths = {};
const missions = [];
const firsts = [];
const lifetimes = [];
let rangers = 0;
let tides = 0;
let reached = 0;
let recovered = 0;
let bodiesLost = 0;
let stuck = 0;
let kills = 0;
let olds = 0;
let chapters = 0;
const started = process.hrtime.bigint();

for (let seed = options.start; seed < options.start + options.seeds; seed++) {
  const state = runSeed(seed);
  if (options.check) {
    const again = runSeed(seed);
    if (RZ.fingerprint(state) !== RZ.fingerprint(again)) {
      console.error(`seed ${seed} did not repeat: ${RZ.fingerprint(state)} then ${RZ.fingerprint(again)}`);
      process.exitCode = 1;
    }
  }
  for (const cause of Object.keys(state.stats.deaths)) deaths[cause] = (deaths[cause] || 0) + state.stats.deaths[cause];
  missions.push(...state.stats.missions);
  if (state.stats.missions.length) firsts.push(state.stats.missions[0]);
  for (const ranger of state.rangers) {
    if (ranger.deathTick !== undefined) lifetimes.push((ranger.deathTick - ranger.bornTick) / CFG.sim.ticksPerSecond);
  }
  rangers += state.rangerCount;
  tides += state.tide.number;
  reached += state.stats.sitesReached;
  recovered += state.stats.bodiesRecovered;
  bodiesLost += state.stats.bodiesLost;
  kills += state.stats.scavsKilled;
  olds += state.stats.oldsBeaten;
  chapters += state.chapters.length;
  if (state.stats.missions.length === 0) stuck++;
}

const seconds = Number(process.hrtime.bigint() - started) / 1e9;
const totalDeaths = Object.values(deaths).reduce((sum, count) => sum + count, 0);

console.log(`${options.seeds} seeds, ${rangers} rangers, ${tides} tides, ${seconds.toFixed(1)}s`);
console.log('\nCauses of death');
for (const [cause, count] of Object.entries(deaths).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cause.padEnd(12)}${String(count).padStart(5)}  ${((count / totalDeaths) * 100).toFixed(0)}%`);
}
console.log('\nMissions');
console.log(`  completed           ${missions.length}`);
console.log(`  sites reached       ${reached}`);
console.log(`  seeds with none     ${stuck}`);
console.log(`  attempts: median ${median(missions.map(m => m.attempts))}, mean ${mean(missions.map(m => m.attempts)).toFixed(1)}`);
console.log(`  rangers:  median ${median(missions.map(m => m.rangers))}, mean ${mean(missions.map(m => m.rangers)).toFixed(1)}`);
console.log(`  tides:    median ${median(missions.map(m => m.tides))}, mean ${mean(missions.map(m => m.tides)).toFixed(1)}`);
console.log(`\nFirst mission of each seed (${firsts.length} of ${options.seeds} finished)`);
console.log(`  attempts: median ${median(firsts.map(m => m.attempts))}, mean ${mean(firsts.map(m => m.attempts)).toFixed(1)}`);
console.log(`  rangers:  median ${median(firsts.map(m => m.rangers))}, mean ${mean(firsts.map(m => m.rangers)).toFixed(1)}`);
console.log(`  tides:    median ${median(firsts.map(m => m.tides))}, mean ${mean(firsts.map(m => m.tides)).toFixed(1)}`);
const successAt = {};
for (const first of firsts) successAt[first.attempts] = (successAt[first.attempts] || 0) + 1;
console.log('  finished on attempt: ' + Object.keys(successAt).map(n => `${n}: ${successAt[n]}`).join(', '));
console.log('\nRangers');
console.log(`  life in seconds: median ${median(lifetimes).toFixed(0)}, mean ${mean(lifetimes).toFixed(0)}`);
console.log(`  tides per death: ${(tides / Math.max(1, totalDeaths)).toFixed(1)}`);
console.log(`  scavengers killed ${kills}, old selves beaten ${olds}, bodies recovered ${recovered}, bodies lost ${bodiesLost}`);
console.log(`  greater tides ${chapters}`);
