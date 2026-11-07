// Route check: builds many worlds and reports any outpost or survey site a ranger can't walk to.
//   node tools/routes.js --seeds 500 [--start 1] [--set map.villages=4]
// Exits with an error if any world fails.

const { loadSim, parseArgs, applySets } = require('./load');

const options = parseArgs(process.argv.slice(2), { seeds: 200, start: 1 });
const sim = loadSim();
applySets(sim, options.set);
const { RZ, CFG } = sim;

function nearestSafeLeg(world, site) {
  const { w, h, moveCost } = world;
  let best = Infinity;
  for (const safe of world.safe) {
    const path = RZ.findPath(w, h, moveCost, safe.x + safe.y * w, site.x + site.y * w);
    if (path) best = Math.min(best, path.cost);
  }
  return best;
}

let failures = 0;
const outpostLegs = [];
const siteLegs = [];

for (let seed = options.start; seed < options.start + options.seeds; seed++) {
  const world = RZ.generateMap(CFG, seed);
  const { w, h, moveCost } = world;
  const home = world.home.x + world.home.y * w;
  const problems = world.problems.slice();

  if (world.safe.length !== CFG.map.outposts + 1) problems.push(`only ${world.safe.length - 1} outposts`);
  if (world.sites.length !== CFG.map.surveySites) problems.push(`only ${world.sites.length} sites`);
  if (world.villages.length < CFG.map.villages) problems.push(`only ${world.villages.length} villages`);

  for (const place of world.safe.slice(1).concat(world.sites, world.villages)) {
    const path = RZ.findPath(w, h, moveCost, home, place.x + place.y * w);
    if (!path) problems.push(`no route to ${place.name}`);
    else if (place.id[0] === 'o') outpostLegs.push(path.cost);
  }
  for (const site of world.sites) siteLegs.push(nearestSafeLeg(world, site));

  if (problems.length) {
    failures++;
    console.log(`seed ${seed}: ${problems.join('; ')}`);
  }
}

function spread(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const at = fraction => sorted[Math.floor((sorted.length - 1) * fraction)].toFixed(0);
  return `min ${at(0)}, median ${at(0.5)}, max ${at(1)}`;
}

console.log(`${options.seeds} worlds checked, ${failures} with problems`);
if (outpostLegs.length) console.log(`home to outpost cost: ${spread(outpostLegs)}`);
if (siteLegs.length) console.log(`nearest safe house to site cost: ${spread(siteLegs)}`);
process.exitCode = failures ? 1 : 0;
