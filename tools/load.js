// Loads the simulation into Node, for the tools.
// The script list comes from index.html, so there's only one to maintain. Files under src/view/ are skipped.
// The sim runs with no DOM, and with Math.random and the clock removed, so breaking those rules fails loudly.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

function loadSim() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]);
  // A separate vm context would be tidier, but its global lookups are far too slow for batch runs.
  Math.random = function () { throw new Error('Math.random used in the sim. Use the seeded generator.'); };
  Date.now = function () { throw new Error('Date.now used in the sim. The sim must not read the clock.'); };
  for (const script of scripts) {
    if (script.startsWith('src/view/')) continue;
    const file = path.join(root, script);
    vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
  }
  return vm.runInThisContext('({ RZ: RZ, CFG: CFG, applyConfigOverride: applyConfigOverride })');
}

// Reads the flags the tools share: --key value, --flag and repeated --set a.b=value.
function parseArgs(argv, defaults) {
  const options = Object.assign({ set: [] }, defaults);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error('Unexpected argument: ' + arg);
    const key = arg.slice(2);
    if (key === 'set') options.set.push(argv[++i]);
    else if (typeof options[key] === 'boolean') options[key] = true;
    else if (key in options) options[key] = Number(argv[++i]);
    else throw new Error('Unknown option: --' + key);
  }
  return options;
}

function applySets(sim, sets) {
  for (const pair of sets) {
    const at = pair.indexOf('=');
    if (at < 0) throw new Error('--set needs a.b=value, got: ' + pair);
    sim.applyConfigOverride(sim.CFG, pair.slice(0, at), pair.slice(at + 1));
  }
}

module.exports = { loadSim, parseArgs, applySets };
