# Plan: someone to watch, someone to talk to

Written 2026-11-07, after the first version was finished. The brief in [concept.md](concept.md) still stands. This plan is about the gap between a working sim and something you want to keep watching.

## What the first version feels like

Measured over 10 seeds:

- **64% of a run is a ranger standing still.** Another 15% is walking errands. Fights are 1.2%.
- **The journal goes quiet.** Half the gaps are over 17 seconds, and one in ten is over 2.5 minutes.
- **The ranger is a 4-pixel dot** called "Ranger 3". A ranger who dies leaves nothing behind you'd miss.
- **You have nothing to do.** The dual view shows you the trap, but all you can do is watch them walk into it.

The tide, the contour map and the journal's voice are all good. Everything below builds on them.

## The idea: you are Ranger Zero

The rangers are numbered from 1. So who is Zero?

You are. Zero is the voice on the radio at home: the one who sees the whole map and has outlived every ranger in the line. The rangers call you Zero. They can hear you, they can answer back, and they don't have to do what you say.

This keeps the main rule intact. Rangers still act only on what they could know, because being told something on the radio is a thing they can know. What you say reaches them through the percept like anything else, so it's only ever a claim. If you're wrong, they find out.

Three things make that matter:

1. **You know more than they do.** The journal estimates when the tide is due. You can see when it's really coming. That gap is where the drama is.
2. **They can refuse.** A reckless ranger won't turn back because you said so. A cautious one won't push on.
3. **The journal remembers.** Trust passes down the line. If you tell Ranger 6 to push on and the tide takes them, Ranger 7 reads about it.

You can always leave the radio alone. Without any calls, a seed runs the same way every time, and cards close themselves, so it still plays as an autonomous sim.

## Milestones

### 1. Someone to watch

Fix the dead air and make the ranger readable at a glance.

- **Pacing.** A new `auto` speed fast-forwards waits, slows down in danger, and is the default.
- **Things to do in a calm spell.** Rangers forage nearby instead of standing around.
- **Follow camera.** It stays close to the ranger and pulls back for the tide. You can zoom, drag, or go back to the whole map.
- **See the fight.** Tracers both ways, hits and misses, damage numbers, a real figure instead of a dot.
- **The window bar.** Time left against the walk home, the sum every trip depends on. Zero's views also show the true time.

### 2. People, not numbers

- **Names, tempers and quirks.** Cautious, greedy and reckless change how a ranger really behaves, not just how they talk.
- **A voice.** Rangers talk in short lines, on the map and on the radio, tied to what's actually happening.
- **A last transmission.** Every death ends with some words, then a card saying who they were.
- **Who walks next.** Pick from three recruits between lives, or let the first one go.

### 3. Zero on the radio

- **Ask** (free): how are you, what's the plan, what do you know.
- **Call** (spends signal): turn back, push on.
- **Mark the map** (spends signal): warn them off a spot, send them to one, or drop a crate.
- **Trust**: rises when you're proved right, falls when you're proved wrong, and is written in the journal.
- All of it is a logged command applied on a tick, so a run with calls replays exactly.

### 4. The line remembers

- **Graves.** Where each ranger fell stays marked.
- **Old selves.** A body the tide takes gets back up with its gear and a name you know, muttering its last words on your radio. Beat it to get the gear back.
- **Recovery on the way past.** This answers R-028, where 0 of 157 bodies were recovered.
- **The line.** A strip of everyone who has walked, opening onto a history screen with each ranger's track on the map.
- **Sound.** All synthesised: wind, the tide, shots, static, a heartbeat.

### 5. Chapters

- **The greater tide.** After 7 tides the land is wiped. What was stashed goes home, the map is new, and a chapter card sums up what happened.
- **Surveying everything** in a land brings the greater tide early, which gives a chapter something to aim for. This answers R-031.
- **Checks tool.** Rule checks and replay checks become a tool (R-032).

## How it turned out

All five milestones are built. The numbers are from 20 seeds over 40 tides, on the finished build. Real-time figures assume `auto` speed.

| | First version | Now |
|---|---|---|
| Sim time spent standing still | 64% | 52%, passed through at 4x to 8x |
| Gap between lines | up to 2.5 minutes | about 5 real seconds |
| Fights, as a share of the sim | 1.2% | about 3% |
| Bodies recovered | 0 of 157 | 59 of 190 |
| Seeds finishing a first mission | 16 of 20 | 20 of 20 |
| Attempts on a first mission | median 3, mean 3.4 | median 3, mean 2.3 |
| Sites surveyed, per chapter | no chapters | about 1 |
| Real time per chapter | no chapters | about 11 minutes |
| Real time per death | about 12 minutes | about 5 minutes |

Does the radio matter? Bots played Zero over 16 seeds, about 2 chapters each:

| Who plays Zero | Rangers used | Sites surveyed | Final trust |
|---|---|---|---|
| Nobody | 76 | 37 | 50 |
| Good calls, using the true map | 51 | 35 | 89 |
| Always "push on" | 76 | 34 | 32 |
| Warns about random spots | 75 | 28 | 52 |

Good calls lose a third fewer rangers, and earn trust. They don't survey more sites, so the radio buys lives rather than wins. That bot only ever calls rangers back and warns them, so a person using crates and "send" should do better, but that hasn't been measured.

Tuning that changed from the brief or the first version:

- **A greater tide comes after 8 tides, not 7.** With 7, too many lands ended before anyone had finished a survey.
- **Pickets are 2 scavengers, not up to 3**, and they hit slightly less often (0.48, down from 0.5).
- **Rangers go with what they have** after about two tides without an attempt. Lessons kept raising the ammo target until the stores could never meet it, and rangers scavenged for most of a run.

Bugs found by watching, not by the numbers:

- Rangers jittered at the edge of camps forever, stepping towards enemies out of range and back. This was behind most of the stalled seeds.
- New rangers at an outpost had rounds and no gun. Haulers now leave a sidearm.
- Rangers stashed every round and walked out empty. They now keep some for short trips.

## From watching a long run (2026-11-07)

A long run showed the tide deciding almost everything. Rangers set out on trips that didn't fit the window, turned back, and tried again: one site reached attempt 41. Rangers started at outposts with no food and starved waiting there, and others walked between home and an outpost hauling rounds, because the food the outpost needed wasn't at home either. What changed (R-079 to R-083):

- **A longer calm, and a slider for it.** 150 seconds between tides, not 110, and Zero can set anything from 60 to 300 while the run goes on. The slider is a logged call, like the board switches. Rangers aren't told: the journal learns the new length by timing tides, and it now learns a longer calm twice as fast as before.
- **The tide infects instead of killing.** It burns while it touches a ranger, and leaves mould that keeps draining health until gold burns it out or a medkit clears some of it. A ranger caught in it runs for gold, and lives if it's close enough. A ranger who lives writes it up, and the journal widens its margin a little.
- **Trips that fit the window.** Patience can stretch a trip by a fifth of the window at most, pushing on is capped at 30 seconds from the site, and the planner marks down an objective whose round trip is longer than the window, and each turn-back on it.
- **Hunger.** A ranger who couldn't last to the window after next goes home to eat while there's a window to do it in. A ranger only walks home for supplies home actually has, by the journal. New rangers only start at an outpost with food in it.
- **Picking things up.** Walking home with time in hand used to count as running for it, which stopped rangers picking anything up after an objective. Now any detour that still beats the tide is taken, and a full pack makes room by leaving loot, a gun another carried gun beats at every distance, or spare rounds.

The batch, 20 seeds and 60 rangers over the same sim time:

| | Before | Fixes, old 110s calm | Fixes and 150s calm |
|---|---|---|---|
| Tides | 883 | 883 | 722 |
| Deaths | 141 | 109 | 141 |
| By the tide | 49 | 21 | 18 |
| By anomalies | 56 | 56 | 77 |
| By scavengers | 34 | 28 | 37 |
| By old selves | 2 | 4 | 9 |
| Objectives done | 233 | 301 | 363 |
| Boards finished | 2 of 100 | 2 of 100 | 15 of 81 |
| Tides per death | 6.3 | 8.1 | 5.1 |

The fixes on their own cost fewer lives and finish more. The longer calm finishes more again and lets boards be done before the greater tide, but each tide is longer, so more walking happens per tide and more of it ends in a pocket (R-084).

## Rules this has to keep

- Sim code stays free of the DOM, and ranger logic still never sees the sim.
- Seeds repeat exactly. A radio call is an input with a tick, and speech draws on its own random stream, so talk can't change the outcome.
- Everything a ranger hears comes through the percept.
- Tuning stays near three attempts on a typical mission, with the radio left alone.

## Not doing yet

Trader and credits (R-024), husks (R-023), worn routes (R-021), Retrieve and Clear missions (R-022), fading notes (R-019). All still worth doing, but they add depth to a game whose first problem was that nobody was home.
