# Ranger-Zero

An autonomous top-down survival sim. A line of rangers explore a generated map, stock outposts, die, and pass on a journal, while a violet tide resets the land. The player is Ranger Zero, the voice on the radio at home: you can see the whole map, you can talk to the ranger, and they don't have to listen. The brief is in [docs/concept.md](docs/concept.md), and the plan that added the radio is in [docs/plan.md](docs/plan.md).

Built so far: home plus three outposts on a map that changes at each greater tide, a board of objectives for each land (survey a site, clear a camp, bring a relic home, stock an outpost), each paying a reward when it's done, scavengers in camps and patrols that walk a loop between villages, enemies that flank a ranger up close instead of standing on them, old selves, weapons to find (pistol, rifle, shotgun, MP5 and grenades), a spare slot that carries any gun but a pistol to the next safe house so stashes fill with better guns, one anomaly type, the tide (which infects a ranger it catches, draining health until shelter burns it out), a slider for the length of the calm between tides, the journal, named rangers with tempers and quirks, the radio and trust, rangers' lines read out on the radio by the browser's speech synth, a load meter for the pack, and a readable plan: the checklist of what the ranger weighed, the plan drawn on the map, and what each outpost holds. Update this file as code and tools arrive, and list only what exists.

## Running and checking

- Open `index.html` directly. There is no build step and no dependencies, so scripts must stay classic (no ES modules, which fail on `file://`).
- URL options: `?seed=7`, `speed=auto|1|2|5|20|60`, `view=ranger|full|dual`, `camera=map`, `skip=2000` (ticks to run before the first frame), `cards=0` (no cards, so it runs unattended). Anything else is a config override, such as `?tide.calm=90`, or `?chapter.hold=1` to start with the land held.
- Keys: T turn back, P push on, W warn, S send, C crate, H history, M map, F follow, N sound, V voices, 1 to 3 views, Space pause. Click an outpost for its stores. The board over the map's top left has two switches: hold the land until the board is done, and post a new board. The calm slider in the bottom bar sets the seconds between tides. All three are logged radio calls, so they replay. Rangers aren't told the new calm length: the journal learns it by timing tides.
- `node tools/checks.js` runs the rules as tests: code rules, repeatability, replay with radio calls, tide, tide infection, picking things up, tide length, respawn, radio, greater tide, enemies (none steps onto the ranger or each other, close ones hold off, patrols walk and go back to their route), the board (every kind on it, reachable, relics never lost, rewards paid, both switches), and random calls fired at many seeds. Run it after changing anything in the sim. Add `--seeds` and `--ticks` to change how much it covers.
- `node tools/routes.js --seeds 500` builds many worlds and reports anything a ranger can't reach.
- `node tools/batch.js --seeds 20 --rangers 60 --maxtides 40` runs rangers without a browser and reports causes of death and mission times. Add `--set tide.calm=90` to try a value, and `--check` to run every seed twice and fail if the runs differ.
- Seeds must repeat exactly. All randomness in the sim goes through the seeded generator, never `Math.random`, and the sim must not depend on the frame rate or the clock. Each system forks its own stream, so changing one doesn't reshuffle the others.
- A radio call is an input: it's queued, applied on a tick and logged in `sim.callLog`. Passing that log to `RZ.createSim(cfg, seed, script)` replays the run exactly.

## Code layout

- All tunable values go in `src/config.js`. Values that only affect drawing go in `CFG.look`, so they can't change balance.
- Simulation code must not touch the DOM, so the tools can run it in Node. Rendering only reads sim state, and the only thing the view sends back is `RZ.queueCall`.
- `src/sim/` is the simulation and `src/view/` is the browser side. `tools/load.js` gets its script list from `index.html` and skips `src/view/`, so a new sim file only needs adding there. It also removes `Math.random` and `Date.now`, so using them in the sim fails loudly under the tools.
- The sim tells the view what happened through `RZ.emit`, a short feed of events in `sim.events`. Effects, sound, cards and banners are all driven from it in `src/view/main.js`.

Sim files beyond the core: `people.js` (names, tempers, quirks, recruits), `voice.js` (everything rangers say), `radio.js` (calls, signal, trust), `oldselves.js`, `chapters.js` (the greater tide) and `objectives.js` (the board, rewards and relics). The real board is `sim.board`. The journal keeps a copy in `book.objectives`, and `book.mission` is the objective the line is working on. The planner rates every open objective each time it plans and keeps a checklist for each one in the journal.

View files: `render.js` (the map), `figures.js` (people, marks, speech), `plans.js` (the plan on the map, step and place names), `stores.js` (outpost stores and their card), `board.js` (the board box, objective marks and reward caches), `camera.js`, `fx.js`, `portrait.js`, `audio.js` (all synthesised), `voices.js` (rangers' lines read out by the browser's speech synth, with the radio click, static and roger bleep; old selves and Zero aren't voiced, and the spoken line drops the word Zero, which synths read as a number), `panel.js` (side panel and the bar over the map), `overlays.js` (cards, the line, history), `main.js` (the loop and auto pacing).

## Rangers only know what they could know

Rangers should only act on what they could know: what they can see now, and what the journal says. The real map and the ranger's map are separate, and ranger logic must read only the ranger's map. Don't read true positions of enemies, anomalies or items to steer a ranger, even when it would make them look smarter. A ranger can see the tide coming, and the journal can estimate when it's due.

This is enforced by structure. `src/sim/brain.js` and `src/sim/planner.js` are never given the sim: they get the ranger, the journal, a percept from `src/sim/sense.js`, and the `act` interface in `src/sim/sim.js`. Keep it that way. If ranger logic needs a new fact, add it to the percept, and only if the ranger could really see it.

Zero is the one exception that proves the rule. What Zero says reaches the ranger through the percept (`percept.radio`), as a claim they've been told and not as a fact. They can refuse it, and if it's wrong they find out. Only the player can see the true map, so the view may read it freely.

Talk must never change what happens. Rangers speak through `act.say`, which uses its own random stream, and nothing reads speech back. `tools/checks.js` tests this by silencing every line.

Silence beats repetition. After anyone says a line it rests for `voice.rest` seconds, and a ranger with nothing fresh to say keeps quiet. Only answers to Zero and big moments (the `MUST` list in `voice.js`) fall back on the line said longest ago. Kinds that come up in every fight or trip have their own cooldowns in `voice.cooldowns`. Player-facing text calls the safe places shelter, outposts or safe houses, never "gold": gold is only their colour.

The same goes for explaining. Each plan carries `plan.trace` (the questions the planner asked and the answers) and `plan.brief` (the numbers behind them) for the view. Only `planner.js` may touch them in the sim, and `tools/checks.js` checks that.

## Kanban

Work is tracked in [KANBAN.md](KANBAN.md), which explains the rules at the top of the file.

- Check the board at the start of a session.
- Move a card to In Progress when you start it, and to Done when it is finished.
- Keep to the In Progress limit of 2.
- New ideas or follow-ups go in Backlog as new cards. Don't expand the current card to fit them.
- Only the user promotes cards from Backlog to Ready, unless they ask you to.
