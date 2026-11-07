# Ranger-Zero: Kanban

An autonomous top-down survival sim. See [docs/concept.md](docs/concept.md) for the full idea.

## How this board works

- **Columns:** Backlog → Ready → In Progress → Done.
- **Backlog** holds ideas and rough work. **Ready** holds cards that are clear enough to start, in priority order (top is next).
- **In Progress limit: 2.** Finish or move something back before starting another card.
- **Cards** are one line: `- [ ] R-001 Short description`. Add `(blocked: reason)` if stuck. Use indented lines for notes or acceptance criteria.
- **IDs** only go up and are never reused. The next free ID is under "Next ID" below.
- **Moving a card:** cut the line and paste it into the new column. When it reaches Done, tick the box and add the date: `- [x] R-001 Short description (2026-11-06)`.
- **Done** stays on this board until it gets long, then older cards move to `KANBAN-archive.md`.

**Next ID:** R-101

---

## In Progress

_Nothing yet._

## Ready

_Nothing yet._

## Backlog

### First version

One map, home plus three outposts, one long Survey mission, scavengers, one anomaly type, the tide and the journal. The test is whether watching rangers die, adapt and finally succeed is compelling. Cards are in build order.


### Follow-ups from the first version

- [ ] R-030 High ground buys about 9 seconds, and the brief says a few minutes
  Valleys flood about 9 seconds before ridges at `tide.elevationDrag` 16, and the surge only lasts 40 seconds. Decide whether to lengthen the surge or change the brief.

### From the radio build

- [ ] R-052 Choose the next mission: click a survey site to send the line there
  Once R-067 is built, this becomes pinning an objective on the board.
- [ ] R-053 Save and resume: a run is just its seed and call log, so it could live in the URL or local storage, and be shared
- [ ] R-054 Hidden threat alerts for camps, not only pockets
- [ ] R-055 Watch for old selves camping an outpost: seed 7 lost 8 rangers to them in a row, which may be a great story or a death spiral
- [ ] R-057 Rangers don't know a greater tide is coming. Could the journal learn to count tides after the first one?
- [ ] R-058 Let the ranger reply to questions with their portrait on the map at close zoom, or some other way of making talk feel closer
- [ ] R-059 A morning summary: what happened while the run was left going

### Objectives and readable plans (agreed 2026-11-07)

Watching a plan form and unfold is most of the fun, so make the plan readable, give each land a board of objectives, and give supplies and loot a strategy. Build in phase order. Run `tools/batch.js` before and after each phase and note the numbers on the card. Balance is fine as it is, so a big swing is a bug, not a tuning job.

Phase A: show the plan. Behaviour must not change, and `tools/checks.js` fingerprints must stay identical.


Phase B: objectives, rewards and switches.


Phase C: supply and looting strategy.

- [ ] R-072 Outpost roles: staging, waystation or reserve (a spare life), each with its own stock target, shown in R-065
- [ ] R-073 Hauling picks the haul that closes the biggest gap per second walked, with drops at waystations on the way
- [ ] R-074 Village memory: last yield, camp seen and when it was last searched. Scavenge and forage targets are chosen by expected value against risk, and the panel shows the sum.
- R-024 (the trader, below) belongs to this phase as a small version: sell loot at home, buy gear. It gives looting a value.

### From the board

- [ ] R-075 Balance after the board: survey median attempts fell from 2 to 1, and deaths from 175 to 141 (scavengers 59 to 34)
  Not the rewards: with rewards switched off it's the same (median 1, 130 deaths). The planner now works on whichever objective is readiest, so attempts go into objectives the line is prepared for. Levers: `objectives.weigh.ready` and `stick`, survey site distance, or more tides of danger. Or accept it, since the challenge has moved to finishing the board (see R-076).
- [ ] R-076 Boards are rarely finished before the greater tide: 2 of 100 lands at 8 tides with six objectives. Smaller boards, more tides, or leave it to the hold switch.
- [ ] R-077 A new board can't offer new survey sites, because a land only has three. Should a new board be able to place fresh sites?

### From the new weapons

- [ ] R-061 New weapons made the first mission easier: median attempts fell from 3 to 2, against the brief's target of 3
  20-seed batch, both runs with the duplicate pistol fix. Scavenger deaths rose from 46 to 59, so rangers take on more fights and win more of them. Levers: find chances in `items.finds`, or `fightLooksGood` counting each grenade as one enemy removed.

### From watching a long run (2026-11-07)

- [ ] R-084 Anomaly deaths rose from 56 to 77 with the 150s calm, over the same sim time
  With the fixes but the old 110s calm it stays at 56, so it's the longer calm: more walking per tide. Tides per death fell from 8.1 to 5.1. Levers: `anomaly.noticeChance`, or accept it as the price of longer trips.
- [ ] R-085 A ranger caught far from shelter runs for it through the tide, 36 seconds in one run. Climbing out of the tide first and then walking may live more often, and read better.

### From patrols (2026-11-07)

- [ ] R-091 Patrols raised scavenger deaths from 31 to 54 (seeds 1 to 20) and 33 to 56 (seeds 21 to 40); objectives done fell from 363 to 331 and boards finished from 11 to 7 of 80
  Most of the extra deaths come on Clear missions, when a patrol whose loop stops at that village walks into the camp fight. Levers: `patrol.count` and `sizeMax` (deaths scale with walkers: one patrol gives 43, three of 2 to 3 give 75 to 105), loops that avoid camp villages, or the planner allowing extra rounds when the journal has patrol sightings near a target. Leash and sight hardly matter.
- [ ] R-092 The journal marks where patrols were seen and routes bend a little round those marks, but the planner doesn't count them as danger when rating objectives or packing rounds

### After the first version

- [ ] R-019 Notes fade with each tide, shown as fading ink on the map
- [ ] R-021 Worn routes: the tide spreads fastest along paths rangers use often
- [ ] R-022 Retrieve and Clear missions
  Folded into R-066.
- [ ] R-023 Husks: unarmed, mould-taken enemies that chase on contact
- [ ] R-024 Trader at home: sell loot, buy gear with credits
  Part of the objectives work, Phase C: a small version that gives looting a value.
- [ ] R-027 Live config sliders on screen (undecided: the config file may be enough)
  The calm slider (R-079) is the first. Others only if a value turns out to be worth changing while watching.

## Done

- [x] R-100 Radio reception: transmissions come through clean near home and break up far out, in the tide and in last words (2026-11-07)
  Reception runs from 0 (clear) to 1 (barely there): distance from home on a curve, the tide close by, low signal, and 0.85 for last words. Worse reception means drifting static, more crackle, a wandering heterodyne whistle, now and then another channel murmuring through, and the voice a little fainter and off pitch. Lines are always spoken whole: cutting the voice up between words was tried and taken out, as it sounded worse. 6 seeds of 25 minutes: 55% of lines clean or nearly, 45% rough, the worst kept for the tide at the edges and last words. `?look.voices.reception.fixed=0.9` forces a level to hear it.
- [x] R-099 Old selves' words appear over the old self, not the living ranger (2026-11-07)
  The view kept one speech bubble and always drew it over the ranger, so a mutter also wiped whatever the ranger was saying. Talk now carries the old self's id, and old selves get their own purple ghost bubble over their figure, hidden in the ranger view when they're out of sight.
- [x] R-098 Rangers say the main plan out loud, and complain when things go wrong (2026-11-07)
  When the planner picks an objective it's said as well as written: "New plan. We're going to survey Old Mast.", or "Forget Grey Lamp for now. Better odds if we clear Brack." when it switches. Each new ranger says it once on taking it on. Frustration: a gun found with no rounds, no medkit when hurt, no food in the stash, bare stores at home, more lines for running dry, and an old self within 8 cells ("It's wearing Pilar's face. It's coming for me."). 8 seeds of 30 minutes: 70 plan lines, 10 old-self chases, 7 no-medkit lines.
- [x] R-097 Fight talk and lines that make sense heard: more desperate lines under attack, a pinned-down line, fuller versions of clipped barks, and no "Zero" in the spoken voice (2026-11-07)
  New `pinned` line, said mid-fight when outnumbered or below half health (cooldown 22s), and more lines for contact, hurt, hurt_bad, flee, dash and no_ammo. Barks like "Hit!", "Down.", "There it is." and "Running. Running." now say what happened. The synth reads Zero as a number, so the spoken line drops it ("They're shooting at me, Zero." is heard as "They're shooting at me."); the written radio keeps it. "Is this Zero?" became "Is anyone on this channel?" since it can't be dropped. 6 seeds of 25 minutes: 113 fight lines, none said more than 9 times.
- [x] R-096 Ranger voices: every line a ranger says is read out by the browser's speech synth, keyed up like a radio (2026-11-07)
  On by default, V turns it off and the choice is remembered. Each ranger keeps one voice for life, with pitch and rate from their temper. A question ends with "Over." A click keys the radio up, static runs under the voice, and a roger bleep closes each transmission. Not old selves, and not Zero. Lines are dropped above 8x or when they've waited too long. View only: the sim doesn't change.
- [x] R-095 Better dialogue: rangers say less, never repeat a line soon after anyone said it, and keep quiet rather than fall back on the most common lines (2026-11-07)
  A line rests 900s after anyone says it. Filler and fight barks stay silent when every version is resting; answers to Zero and big moments fall back on the line said longest ago. Per-kind cooldowns for barks (kill 45s, contact 40s, eat 300s, a tide muse once a tide), thoughts every 70s waiting and 55s walking instead of 24s and 22s, the blandest filler cut and some sharper lines added. Old selves only mutter within 16 cells of the ranger. 6 seeds of 12 tides: 5.4 lines a minute to 3.5, the most repeated line 36 times to 14. Covers R-078: a camp seen from two sides is written up once.
- [x] R-094 Say shelter, outpost or safe house instead of "gold" in everything a player reads: talk, journal, plan, panel and hints (2026-11-07)
  Also the code that means a place (`inShelter`, `tide.shelterCure`, `look.zoom.shelter`). Gold stays only as a colour: the rings, toasts and the CSS token.
- [x] R-093 The tide fills the ranger view: drawn everywhere it is, a little fainter beyond the ranger's sight, instead of only on cells in sight (2026-11-07)

- [x] R-088 Enemies flank instead of standing on the ranger: very close enemies keep a ring, spread round and take cover, and never share a cell with the ranger or each other (2026-11-07)
  Within 3.5 cells an armed enemy holds about 2.5 off, an old self with no gun closes to arm's length, and each sidesteps up to 4 cells round before holding. Further off they walk straight in, edging round anything in the way. On its own this left scavenger deaths at 28 against 31. Checks: no enemy steps onto the ranger or another enemy, and close enemies in fights average 2.4 cells off.
- [x] R-089 Patrolling enemies: armed groups walk a loop between villages, chase and flank like a camp, then go back to their route (2026-11-07)
  2 patrols of 2 in each land, on their own random stream, pausing at each village. Walkers step round each other where loops run out and back over the same ground. A ranger can tell a patrol from a camp, so it isn't marked as a camp: the journal writes it up once a life and marks where it was seen, and routes bend a little round the marks. Zero's views show each loop as a faint dotted line. Balance in R-091.
- [x] R-090 Show pack capacity next to the ranger's inventory (2026-11-07)
  A pack meter under food shows weight against capacity, turning orange when full. The spare gun isn't counted, since it rides outside the limit.

- [x] R-086 A spare weapon slot: rangers pick up any gun but a pistol and leave it at the next gold they reach, so stashes fill with better guns over time (2026-11-07)
  The slot carries one gun outside the weight limit. Guns are worth going 1.6 times further for. A ranger at a stash takes the best gun there and leaves any carried gun another beats at every distance, so a pistol stays behind once there's a rifle. Rangers carrying a rifle as their main gun, 6 seeds: 25% in tides 0 to 9 rising to 95% by tides 20 to 29, against 25% to 28% before.
- [x] R-087 Grenades get used: they reach as far as fights happen, go at a lone enemy when there are plenty, and are taken from stashes for attempts (2026-11-07)
  Range 7 to 10. With two or more, a lone enemy is worth one; the last is kept for a group or a losing fight. Home starts with 3 and gets 1 a tide, and attempts take 2 (3 to break a camp). Ranger throws in 6 seeds of 30 tides: 17 to 33. Most fights still find a ranger without one, since short trips don't take any.
  Batch with R-086, 20 seeds, same sim time: deaths 141 to 119 (tide 18 to 8, scavengers 37 to 31), objectives 363 to 343, boards finished 15 of 81 to 10 of 80.

- [x] R-079 Longer calm by default, and a tide length slider that changes it as a logged call (2026-11-07)
  Calm 110s to 150s, and the first guess 95s to 130s. The slider runs from 60s to 300s, stretches a calm already under way, and is logged like the board switches. Rangers aren't told: the journal learns it by timing tides.
- [x] R-081 Hunger in the planner: nobody waits at an outpost without food, and a line short of food goes looking for it (2026-11-07)
  A ranger who couldn't last to the window after next and still walk home goes home to eat while there's a window. A ranger short at the staging post only walks home if the journal says home has some of what's short; otherwise they search nearby. Home with no food searches for food instead of hauling rounds. Food lying about counts for more when food is low. New rangers start at an outpost only if it holds food.
- [x] R-080 The journal's sense of the tide: stop the same trip failing on the window again and again (2026-11-07)
  The estimate now rises 0.4 of the way towards a later tide, not 0.2. Patience can stretch a trip by at most a fifth of the window, not 112s. Pushing on is capped at 30s from the site, however bold the line. The planner marks down an objective whose round trip is longer than the window, and each turn-back on it. Worst seen before: attempt 41 at one site. After, on the same seeds: at most 5.
- [x] R-082 Tide infection: the tide drains health while it touches a ranger and for a while after, instead of killing in a second (2026-11-07)
  4 health a second while in it, and infection builds at 10 a second. Infection drains 0.04 health a second per point, fades slowly in the open, burns out under gold, and a medkit clears 40. A ranger in the tide runs for gold, uses medkits once out of it or when health is low, writes up being caught, and waits under gold until clean. Being caught and living widens the tide margin a little.
- [x] R-083 Rangers pick up items near them whenever there's time, including on the way home after an objective (2026-11-07)
  Walking home with time in hand no longer counts as running for it, which had shut off picking things up. The fixed 30s floor is now a check that the detour still beats the tide. A full pack makes room for food, medkits, grenades or a better gun by leaving loot, a gun another carried gun beats at every distance (a pistol beside a rifle), then rounds above 30.
  Batch, 20 seeds, same sim time: deaths 141 to 141 (tide 49 to 18, anomaly 56 to 77), objectives 233 to 363, boards finished 2 of 100 to 15 of 81. With the old 110s calm the fixes alone give 109 deaths and 301 objectives. See docs/plan.md.

- [x] R-001 Project skeleton: `index.html`, config, seeded generator, sim and render split, Node loader for the tools (2026-11-06)
- [x] R-002 Map generation: elevation, water, trees and villages, with home at the centre and three outposts (2026-11-06)
- [x] R-003 Route check tool: build many random worlds and report any unreachable outposts or mission sites (2026-11-06)
- [x] R-004 Contour-map rendering, with the whole map on one screen, plus speed controls (2026-11-06)
- [x] R-005 Ranger movement: pathfinding over terrain costs, food and health (2026-11-07)
- [x] R-006 The ranger's own map: line of sight, known and unknown ground, kept separate from the real map (2026-11-07)
- [x] R-007 View toggle: ranger view, full view and dual view (2026-11-07)
- [x] R-008 Violet tide: surges from the edges, floods valleys first, kills in the open, digests items, pulls back (2026-11-07)
- [x] R-009 Safe houses: golden mould rings that hold back the tide, and stashes (2026-11-07)
- [x] R-010 Items: weapons, ammo, health, food and loot on the map, and carrying them (2026-11-07)
- [x] R-011 Scavengers and dice combat using range, line of sight and cover (2026-11-07)
- [x] R-012 One anomaly type with a close-range tell, moving every tide (2026-11-07)
- [x] R-013 Expedition planner: pick route and loadout, allow for the tide, stock outposts for one long Survey mission (2026-11-07)
- [x] R-014 Death and succession: bodies, the next ranger, respawn rule, free kit at home (2026-11-07)
- [x] R-015 The journal: record causes of failure, and make the next plan change because of them (2026-11-07)
- [x] R-016 Journal text panel on screen (2026-11-07)
- [x] R-017 Batch tool: run hundreds of rangers without a browser and report causes of death and mission times (2026-11-07)
- [x] R-036 Sim event feed, shots and hits both ways, damage numbers, a proper ranger figure (2026-11-07)
- [x] R-025 Ranger personalities: cautious, greedy and reckless, for comparing runs (2026-11-07)
- [x] R-038 Names, quirks and portraits (2026-11-07)
- [x] R-039 Ranger voice: lines tied to what's happening, shown on the map and on the radio (2026-11-07)
- [x] R-040 Last transmission and a death card (2026-11-07)
- [x] R-041 Who walks next: choose from three recruits between lives (2026-11-07)
- [x] R-042 Radio calls as logged commands, applied on a tick and replayable (2026-11-07)
- [x] R-043 Ask: free questions answered from what the ranger really knows (2026-11-07)
- [x] R-044 Turn back and push on, with signal as the cost (2026-11-07)
- [x] R-045 Map marks: warn, send, and crate drops (2026-11-07)
- [x] R-046 Trust: rises and falls on results, passes down the line, written in the journal (2026-11-07)
- [x] R-034 Forage: rangers use the rest of a calm spell on short trips nearby (2026-11-07)
- [x] R-035 Follow camera with zoom and drag, plus a whole-map view (2026-11-07)
- [x] R-037 Window bar: time left against the walk home, with the true time in Zero's views (2026-11-07)
- [x] R-033 Auto speed: fast through waits, slower in danger, and the default (2026-11-07)
- [x] R-047 Graves and the track each ranger walked (2026-11-07)
- [x] R-020 Old selves: unrecovered bodies return as enemies carrying their gear (2026-11-07)
- [x] R-028 Body recovery almost never happens: 0 bodies recovered of 157 lost in the last 20-seed batch (2026-11-07)
- [x] R-026 History screen: every ranger in the run, with gear, cause of death and achievements (2026-11-07)
- [x] R-048 The line: a strip of every ranger along the bottom of the screen (2026-11-07)
- [x] R-049 Sound, all synthesised (2026-11-07)
- [x] R-018 Greater tide: new map, outposts shipped to the home stash, map knowledge wiped (2026-11-07)
- [x] R-050 Chapter card (2026-11-07)
- [x] R-031 Decide what happens after the last site: surveys currently restart from the first site (2026-11-07)
- [x] R-032 Keep the acceptance checks as a tool: rule checks, tide behaviour, respawn rule and repeatability (2026-11-07)
- [x] R-051 Update the docs for everything above (2026-11-07)
- [x] R-029 Long-tail seeds: fixed by rangers no longer chasing out-of-range enemies, and by going with what they have after two tides (2026-11-07)
- [x] R-056 Attempts against the brief's target of 3: first missions now take a median of 3, so nothing to change (2026-11-07)
- [x] R-060 More weapons to find: shotgun, MP5 and grenades (2026-11-07)
  Rangers draw whichever carried gun suits the distance, and throw grenades at groups or when a fight is lost. Old selves use their grenades too. Also fixed rangers hoarding spare pistols from stashes.
- [x] R-062 Planner decision trace: `makePlan` records each question it asks, the answer and the numbers on `r.plan.trace`. Nothing reads it back. (2026-11-07)
- [x] R-063 Checklist panel: the objective, ticked and unticked prerequisites with counts, the current task and why, all read from the trace (2026-11-07)
- [x] R-064 The plan on the map: dotted route through the remaining steps, numbered pins, a flag on the staging post, and cargo chips on haul trips (2026-11-07)
- [x] R-065 Outpost stores on the map: an icon row under each outpost with counts against the planner's targets. The ranger view shows the journal's ledger. Full and dual views show the truth and flag mismatches. Click an outpost for its full contents. (2026-11-07)
  Phase A changed no behaviour: fingerprints for 10 seeds, with and without radio calls, match the build before it.
- [x] R-066 Objectives board for each land: Survey, Stock (X goods into a named outpost), Clear (camp at a named village) and Retrieve (fetch a marked item home). The journal holds a copy. Every objective must pass the routes check before it goes on the board. Covers R-022. (2026-11-07)
- [x] R-067 The planner chooses between open objectives by readiness, walking time, known danger and reward, with temper changing the weights. The panel shows the ranked list. (2026-11-07)
- [x] R-068 Checklists live in the journal, so the next ranger picks up the ticked boxes (2026-11-07)
- [x] R-069 Reward cache at the site when an objective is completed, on its own seeded stream and scaled by distance and attempts. It may hold weapons. The tide digests whatever isn't carried home. (2026-11-07)
- [x] R-070 Hold the land switch: no greater tide until every objective is done. It's a logged radio call and also `?chapter.hold=1`. The tide counter keeps counting. (2026-11-07)
- [x] R-071 New objectives switch: reroll the board for this land as a logged call. Stashes stay, and progress on the old objectives is dropped. (2026-11-07)
  Phase B batch, 20 seeds, about 883 tides each way: 233 objectives done against 109 surveys before (88 survey, 48 clear, 64 retrieve, 33 stock), 141 deaths against 175, survey median attempts 1 against 2. See R-075.
