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

**Next ID:** R-062

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
- [ ] R-053 Save and resume: a run is just its seed and call log, so it could live in the URL or local storage, and be shared
- [ ] R-054 Hidden threat alerts for camps, not only pockets
- [ ] R-055 Watch for old selves camping an outpost: seed 7 lost 8 rangers to them in a row, which may be a great story or a death spiral
- [ ] R-057 Rangers don't know a greater tide is coming. Could the journal learn to count tides after the first one?
- [ ] R-058 Let the ranger reply to questions with their portrait on the map at close zoom, or some other way of making talk feel closer
- [ ] R-059 A morning summary: what happened while the run was left going

### From the new weapons

- [ ] R-061 New weapons made the first mission easier: median attempts fell from 3 to 2, against the brief's target of 3
  20-seed batch, both runs with the duplicate pistol fix. Scavenger deaths rose from 46 to 59, so rangers take on more fights and win more of them. Levers: find chances in `items.finds`, or `fightLooksGood` counting each grenade as one enemy removed.

### After the first version

- [ ] R-019 Notes fade with each tide, shown as fading ink on the map
- [ ] R-021 Worn routes: the tide spreads fastest along paths rangers use often
- [ ] R-022 Retrieve and Clear missions
- [ ] R-023 Husks: unarmed, mould-taken enemies that chase on contact
- [ ] R-024 Trader at home: sell loot, buy gear with credits
- [ ] R-027 Live config sliders on screen (undecided: the config file may be enough)

## Done

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
