# Ranger-Zero

An autonomous top-down survival sim. A line of rangers explore a generated map, stock outposts, die, and pass on a journal, while a violet tide resets the land. The player is Ranger Zero, the voice on the radio at home: you can see the whole map, you can talk to the ranger, and they don't have to listen. The brief is in [docs/concept.md](docs/concept.md), and the plan that added the radio is in [docs/plan.md](docs/plan.md).

Built so far: home plus three outposts on a map that changes at each greater tide, Survey missions, scavengers, old selves, weapons to find (pistol, rifle, shotgun, MP5 and grenades), one anomaly type, the tide, the journal, named rangers with tempers and quirks, the radio and trust. Update this file as code and tools arrive, and list only what exists.

## Running and checking

- Open `index.html` directly. There is no build step and no dependencies, so scripts must stay classic (no ES modules, which fail on `file://`).
- URL options: `?seed=7`, `speed=auto|1|2|5|20|60`, `view=ranger|full|dual`, `camera=map`, `skip=2000` (ticks to run before the first frame), `cards=0` (no cards, so it runs unattended). Anything else is a config override, such as `?tide.calm=90`.
- Keys: T turn back, P push on, W warn, S send, C crate, H history, M map, F follow, N sound, 1 to 3 views, Space pause.
- `node tools/checks.js` runs the rules as tests: code rules, repeatability, replay with radio calls, tide, respawn, radio, greater tide, and random calls fired at many seeds. Run it after changing anything in the sim. Add `--seeds` and `--ticks` to change how much it covers.
- `node tools/routes.js --seeds 500` builds many worlds and reports anything a ranger can't reach.
- `node tools/batch.js --seeds 20 --rangers 60 --maxtides 40` runs rangers without a browser and reports causes of death and mission times. Add `--set tide.calm=90` to try a value, and `--check` to run every seed twice and fail if the runs differ.
- Seeds must repeat exactly. All randomness in the sim goes through the seeded generator, never `Math.random`, and the sim must not depend on the frame rate or the clock. Each system forks its own stream, so changing one doesn't reshuffle the others.
- A radio call is an input: it's queued, applied on a tick and logged in `sim.callLog`. Passing that log to `RZ.createSim(cfg, seed, script)` replays the run exactly.

## Code layout

- All tunable values go in `src/config.js`. Values that only affect drawing go in `CFG.look`, so they can't change balance.
- Simulation code must not touch the DOM, so the tools can run it in Node. Rendering only reads sim state, and the only thing the view sends back is `RZ.queueCall`.
- `src/sim/` is the simulation and `src/view/` is the browser side. `tools/load.js` gets its script list from `index.html` and skips `src/view/`, so a new sim file only needs adding there. It also removes `Math.random` and `Date.now`, so using them in the sim fails loudly under the tools.
- The sim tells the view what happened through `RZ.emit`, a short feed of events in `sim.events`. Effects, sound, cards and banners are all driven from it in `src/view/main.js`.

Sim files beyond the core: `people.js` (names, tempers, quirks, recruits), `voice.js` (everything rangers say), `radio.js` (calls, signal, trust), `oldselves.js` and `chapters.js` (the greater tide).

View files: `render.js` (the map), `figures.js` (people, marks, speech), `camera.js`, `fx.js`, `portrait.js`, `audio.js` (all synthesised), `panel.js` (side panel and the bar over the map), `overlays.js` (cards, the line, history), `main.js` (the loop and auto pacing).

## Rangers only know what they could know

Rangers should only act on what they could know: what they can see now, and what the journal says. The real map and the ranger's map are separate, and ranger logic must read only the ranger's map. Don't read true positions of enemies, anomalies or items to steer a ranger, even when it would make them look smarter. A ranger can see the tide coming, and the journal can estimate when it's due.

This is enforced by structure. `src/sim/brain.js` and `src/sim/planner.js` are never given the sim: they get the ranger, the journal, a percept from `src/sim/sense.js`, and the `act` interface in `src/sim/sim.js`. Keep it that way. If ranger logic needs a new fact, add it to the percept, and only if the ranger could really see it.

Zero is the one exception that proves the rule. What Zero says reaches the ranger through the percept (`percept.radio`), as a claim they've been told and not as a fact. They can refuse it, and if it's wrong they find out. Only the player can see the true map, so the view may read it freely.

Talk must never change what happens. Rangers speak through `act.say`, which uses its own random stream, and nothing reads speech back. `tools/checks.js` tests this by silencing every line.

## Kanban

Work is tracked in [KANBAN.md](KANBAN.md), which explains the rules at the top of the file.

- Check the board at the start of a session.
- Move a card to In Progress when you start it, and to Done when it is finished.
- Keep to the In Progress limit of 2.
- New ideas or follow-ups go in Backlog as new cards. Don't expand the current card to fit them.
- Only the user promotes cards from Backlog to Ready, unless they ask you to.
