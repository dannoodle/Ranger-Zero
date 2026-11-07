# Concept

An autonomous top-down survival sim. You watch a line of rangers explore a hazardous generated map, plan expeditions, stock outposts, die, and try again. Each ranger picks up the journal the last one left behind. This is the original brief. [plan.md](plan.md) records what has changed since, chiefly that the player is now Ranger Zero, the voice on the radio.

The first build is for watching and experimenting, not a wallpaper. You don't control the rangers, but you can change the config and compare runs.

## The dramatic loop

1. A ranger at a safe house reads the journal and makes a plan: which mission, which route, what to carry, and what to leave behind.
2. They set out, knowing only what the journal says. They fill in the map as they go.
3. The tide is coming, so every trip has a limited range. Distant missions can't be done in one trip, so rangers must stock outposts step by step.
4. The ranger gets home, or dies. A death leaves a body and gear in the open, and the next ranger has until the tide arrives to recover them.
5. The journal records what happened, and the next plan changes because of it.
6. After enough tides, a greater tide wipes the map. New land appears and the cycle starts again, with the gear that was saved.

The first build has no ending. It runs for as long as you want to watch.

## The violet tide

The tide is a living mould that surges in from the map's edges, glowing and veined like the blight in the ant sim, then pulls back.

- **It's deadly.** A ranger caught in the open dies.
- **The land shapes it.** It floods valleys first and reaches ridges last, so climbing a hill buys a few extra minutes.
- **It hunts along paths.** It spreads fastest along the routes rangers have worn in, so a favourite road becomes the most dangerous place to be when the tide turns.
- **It digests whatever is left outside.** Items not in a safe house are gone once it passes.
- **It leaves pockets behind.** These are the anomalies, and they move every tide.
- **It takes bodies.** A body not recovered before the tide gets back up as an enemy, carrying that ranger's gear.

## The greater tide

After a set number of tides, a greater tide covers everything and leaves new land behind.

- Everything held in an outpost is shipped to the home stash.
- Anything still in the open is lost, including old selves and their gear.
- Map knowledge in the journal is wiped. Lessons about enemies and tactics remain.

This makes the last tides of a map a scramble to get gear into outposts.

## The map

Generated from a seed, and shown whole on one screen in a contour-map style.

- **Terrain:** contours, trees and water. Slopes and water slow a ranger down, and trees and ridges block sight.
- **Villages:** loot, and the scavengers who camp there.
- **Home base:** at the centre of the map, and permanent across greater tides. It holds the home stash and the trader. The tide comes from the edges, so places further from home are more exposed.
- **Outposts:** safe houses ringed with golden mould, which keeps the tide out. Gold means safety and violet means danger.
- **Mission sites:** spread out so that the best ones are far from home.

## The rangers

Rangers are a line of people, not one person coming back. Each new ranger inherits the journal and has a slightly different personality (cautious, greedy, reckless), so you can compare how they use the same information.

**Respawning.** A new ranger arrives with nothing at the last outpost used, if it holds any gear. Otherwise they start at home, which always gives a free basic kit. A stocked outpost is therefore also a spare life, and a run can never get permanently stuck.

**What a ranger knows.** A ranger only acts on what they have seen or what the journal says. The real world and the ranger's map are separate. Journal notes become less reliable with every tide, shown as ink fading on the map.

**How they think.** One big plan at each safe house, covering mission, route, loadout and what to stash. In the field they use simple reactions: fight, flee, hide, heal, or head for shelter.

**How they learn.** Each failed attempt records a simple cause, such as out of ammo, starved, or walked into an unknown anomaly. The next plan changes to suit. The logic is simple, but it reads like learning.

> *Ranger 6. The bridge camp beat us twice, both times low on ammo. Moving 60 rounds to Mill outpost first, then going around through the marsh.*

## Missions

- **Retrieve:** find something and bring it back.
- **Clear:** destroy a camp.
- **Survey:** reach a far point and return alive.

All three reward stocking outposts, and may take several rangers to complete. Tuning should aim for about three attempts on a typical mission.

## Enemies and hazards

- **Husks:** unarmed, mould-taken creatures that chase on contact.
- **Scavengers:** armed humans who camp in villages and shoot from range.
- **Old selves:** dead rangers taken by the tide, carrying their gear. Beating one recovers it.
- **Anomalies:** mould pockets that give a visible tell at close range. They move every tide, so a known position goes stale.

Combat is a dice roll affected by range, line of sight and cover. There is no real-time shooting.

## Gear and credits

Rangers find weapons, ammo, health items, food and loot. They need food to keep going. Loot is sold to the trader at home for credits, which buy gear. Gear is only safe once it's in an outpost or at home.

## Watching it

- **Views:** a toggle between the ranger's view, where you uncover the map alongside them, and the full view, which shows everything. There's also a dual view with the ranger's knowledge layered over the real map, so you can watch them walk towards a trap they can't see.
- **The journal:** a text log that tells the story of the run, written by a succession of rangers. It's a main feature, not a placeholder for graphics.
- **The history screen:** every ranger in the run, with their personality, gear, cause of death and what they achieved.
- **Graphics:** items can stay as text at first. The contour map and the two moulds carry the look.

## Experimenting

- All tunable values live in a config file, with URL options to try values quickly.
- Seeds repeat exactly, so two runs can be compared fairly.
- A tool runs hundreds of rangers without a browser and reports how they died and how long missions took.

Live sliders on screen are a possible later addition.

## Starting numbers

These are starting points, to be tuned.

- A tide about every 3 minutes at normal speed.
- A greater tide after 7 tides, so one map lasts about 20 minutes.
- Speed controls up to very fast.

## Later ideas

- Rival rangers who raid your outposts.
- An ending: completing enough big missions leads to the source of the tide.
- Small ways to meddle while it runs, such as choosing the next mission or dropping a supply crate.
- Running it as a wallpaper.
