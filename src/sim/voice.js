// What rangers say. Lines are picked for the moment and the speaker's temper, and written to the
// radio log. Talk draws only on its own random stream and nothing reads it back, so it can never
// change what happens.

var RZ = RZ || {};

(function () {
  // Each entry: `any` lines suit everyone, and a temper's lines are added for that temper.
  // {site}, {place}, {camp}, {name}, {last}, {rounds} and so on are filled in from the moment.
  var LINES = {
    first: {
      any: ['Radio check. Is this Zero?', 'I\'ve read the journal. All of it.', 'Signed the book. Where do you want me?'],
      cautious: ['Morning, Zero. I\'d like to do this slowly.', 'I read what happened to the last one. I\'ll be careful.'],
      greedy: ['So what\'s out there worth having?', 'Zero? They said you\'d know where the good stuff is.'],
      reckless: ['Right. Who\'s first?', 'Don\'t worry, Zero. I\'m the last one you\'ll need.']
    },
    first_line: {
      any: ['{last} wrote a neat hand. Hope mine\'s as good.', 'I can see where {last} stopped writing.', 'I\'ve got {last}\'s page open. I won\'t make that mistake.', 'Ranger {count}, then. Somebody has to be.'],
      cautious: ['{last} got this far. I mean to get further.'],
      reckless: ['{last} was too slow. That\'s all that was.'],
      greedy: ['{last} left things out there. Noted.']
    },
    meet_trust: {
      any: ['The book says to listen to you, Zero.', 'They all say the same thing about you. Your calls are good.']
    },
    meet_doubt: {
      any: ['There\'s a page on you in here, Zero. I read it twice.', 'The book says not to take your word for things.', 'I\'ll make up my own mind about you, Zero.']
    },

    setout_survey: {
      any: ['Going for {site}.', 'Heading out. {site} next.', 'Right. {site}.'],
      cautious: ['Setting out for {site}. I\'ve checked everything twice.', '{site}. One careful step at a time.'],
      greedy: ['{site}, and whatever\'s lying around on the way.'],
      reckless: ['{site}. Try and stop me.', 'Off to {site}. Be back before the kettle boils.']
    },
    setout_again: {
      any: ['Attempt {attempt} at {site}. Let\'s make it the last.', '{site} again. It\'s taken enough of us.', 'Attempt {attempt}. I\'ve read how the others went.'],
      reckless: ['{site}. The others just didn\'t want it enough.'],
      cautious: ['{site} again. I\'ve read every page on it.']
    },
    setout_stock: {
      any: ['Taking a load up to {place}.', 'Stores run to {place}. Dull, but it\'s what keeps people alive.', 'Hauling to {place}.'],
      greedy: ['Hauling for free again. To {place}.'],
      reckless: ['Pack mule again. {place}, then something interesting.']
    },
    setout_clear: {
      any: ['Going to {site} to finish that camp.', 'The camp at {site}. Today it ends.', '{site}. Loaded for a fight.'],
      cautious: ['{site}. I don\'t like it, but the board wants it.'],
      reckless: ['{site}. Finally, something to do.', 'Let\'s go and knock on doors at {site}.'],
      greedy: ['A whole camp\'s worth of kit at {site}. Going.']
    },
    setout_retrieve: {
      any: ['Going for {site}.', 'Off to bring in {site}.', 'Someone left {site} out there. Going to get it.'],
      greedy: ['{site}. Wonder what home will pay for it.'],
      cautious: ['Fetching {site}. In and straight out.']
    },
    setout_deliver: {
      any: ['Taking {site} the rest of the way home.', 'Home with {site}. Last leg.'],
      cautious: ['Carrying {site} home like it\'s made of glass.']
    },
    cleared: {
      any: ['That\'s the last of them. {site} is clear.', 'Nobody left at {site}. It\'s done.', '{site} is quiet now.'],
      reckless: ['Who\'s next? No one? {site}\'s clear, then.'],
      cautious: ['I think that\'s all of them. I really think it is.']
    },
    not_cleared: {
      any: ['Someone\'s still at {site}. I can feel it.', 'I can\'t find the rest of them. {site} isn\'t done.']
    },
    relic_got: {
      any: ['Got {site}. Heavier than it looks.', 'I\'ve got {site}. Coming home.', 'Found it. {site}, right where you said.'],
      greedy: ['{site}. Mine now. Well, ours.']
    },
    relic_missing: {
      any: ['It\'s not here, Zero. {site} isn\'t here.', 'Nothing. Someone got to {site} first.']
    },
    board_new: {
      any: ['New orders. Right.', 'Scrapping the lot? All right, Zero.', 'Fresh board. Reading it now.'],
      reckless: ['About time. The old one was dull.'],
      cautious: ['A new board. I\'ll start again carefully.']
    },
    hold_land: {
      any: ['We\'re staying. Understood.', 'Not leaving till it\'s done. Copy.'],
      reckless: ['Good. I wasn\'t finished with this place.']
    },
    release_land: {
      any: ['Copy. The tide decides, then.', 'Understood. When it goes, it goes.']
    },
    setout_fetch: { any: ['Going back for supplies.', '{place} is short. Heading home for more.'] },
    setout_advance: { any: ['Moving up to {place}.', 'On to {place}. It\'s closer.'] },
    setout_forage: {
      any: ['There\'s time for a look around.', 'Short walk. See what the tide left.', 'Can\'t sit still. Having a look.'],
      greedy: ['Plenty of light left and plenty lying about.', 'Someone\'s got to bring in the good stuff.'],
      cautious: ['A short look. I won\'t go far.'],
      reckless: ['Waiting\'s worse than walking.']
    },
    setout_scavenge: { any: ['Stores are thin. Going to search {place}.', 'Off to see what {place} has left.'] },
    setout_recover: {
      any: ['{name} went down out there. Going to get them.', 'Fetching {name}\'s gear before the tide does.'],
      greedy: ['{name} won\'t need it now.'],
      cautious: ['I\'ll bring back what I can of {name}.']
    },
    setout_errand: { any: ['Going to take a look.', 'On my way.', 'Heading over.'] },

    safe: {
      any: ['Under gold.', 'Back inside the ring.', 'Made it in.'],
      cautious: ['Inside the ring. Good.'],
      reckless: ['That was nothing.'],
      greedy: ['Back with a full pack, more or less.']
    },
    safe_close: {
      any: ['Under gold. That was too close.', 'In! I\'m in.', 'I could feel it on my neck, Zero.', 'Gold. Gold. Thank you.'],
      cautious: ['Never again. I said that last time.'],
      reckless: ['Ha! Still breathing.']
    },
    muse: {
      any: ['Quiet out there.', 'The gold\'s warm tonight.', 'Counting rounds again.', 'I keep thinking about the map.',
            'You ever sleep, Zero?', 'Nobody told me the mould has a smell.', 'Wish I\'d met {last}.',
            'I\'ve started reading the journal from the front.', 'Somebody scratched a tally into this wall.',
            'What were you, Zero, before all this?', 'Still here.', 'I can hear the ring ticking.'],
      cautious: ['I\'ve checked the stash again.', 'Going over the route. There\'s always something.', 'Better an hour too early.'],
      greedy: ['I bet there\'s a rifle out past {site}.', 'Thinking about what all this is worth.', 'That stash would look better bigger.'],
      reckless: ['This is the worst part. The sitting.', 'How long do I have to stay in here?', 'I could have been there and back by now.']
    },
    muse_tide: {
      any: ['Here it comes. All that violet.', 'It\'s up against the ring now.', 'You can hear it, if you stop breathing.',
            'Beautiful, in a way. Don\'t write that down.', 'Everything out there is being eaten.'],
      cautious: ['The gold\'s holding. It always holds. It\'s held so far.'],
      greedy: ['There goes everything we didn\'t pick up.'],
      reckless: ['Come on then.']
    },
    walk: {
      any: ['Quiet so far.', 'Good ground.', 'Nobody\'s been this way for a while.', 'Birds have stopped.', 'Keeping a steady pace.',
            'I can see why they drew it this way.', 'The map\'s right, for once.', 'Zero, you still there?'],
      cautious: ['I don\'t like how quiet it is.', 'Watching my feet.'],
      greedy: ['Eyes open. Something always gets left behind.'],
      reckless: ['This is easy.']
    },
    walk_new: {
      any: ['This bit isn\'t in the journal.', 'New ground. Writing it down as I go.', 'Nobody has drawn this.']
    },
    walk_forest: { any: ['Trees are thick here. Can\'t see much.', 'Hate the woods. Everything could be anything.'] },
    walk_water: { any: ['Wet to the knees.', 'Slow going through the water.'] },
    grave: {
      any: ['This is where {name} fell.', 'There\'s nothing left of {name} here. I looked.', 'Passing {name}\'s mark on the map.', 'I\'m standing where {name} stopped.'],
      cautious: ['{name} came this way. I\'ll go carefully.'],
      reckless: ['Sorry, {name}. Keep walking.'],
      greedy: ['Nothing of {name}\'s left to take. I checked.']
    },

    camp_seen: {
      any: ['Scavengers at {place}.', 'Contact. There\'s a camp at {place}.', 'People up ahead. Armed.'],
      cautious: ['Scavengers at {place}. Staying low.'],
      reckless: ['Company at {place}.'],
      greedy: ['A camp at {place}. Camps have stores.']
    },
    contact: {
      any: ['They\'ve seen me.', 'Taking the shot.', 'Here we go.'],
      reckless: ['Come on then!', 'My kind of afternoon.'],
      cautious: ['I don\'t want this. Firing.']
    },
    flee: {
      any: ['Too many. Getting out.', 'No good. Moving.', 'Not this fight.'],
      cautious: ['Falling back, Zero.'],
      reckless: ['Just stretching my legs.']
    },
    dash: {
      any: ['No way round. Going through.', 'Running it.'],
      reckless: ['Straight through them!']
    },
    hurt: { any: ['Hit!', 'Ah! Took one.', 'I\'m hit.', 'That one got me.'] },
    hurt_bad: {
      any: ['I\'m hurt, Zero. It\'s bad.', 'Bleeding. A lot.', 'Can\'t take another one of those.'],
      cautious: ['This is what I was afraid of.'],
      reckless: ['Bit of a scratch. A big scratch.']
    },
    kill: {
      any: ['Down.', 'One less.', 'That\'s one.'],
      reckless: ['Next!'],
      cautious: ['Got them. I\'m sorry.'],
      greedy: ['Let\'s see what they were carrying.']
    },
    no_ammo: { any: ['Empty. I\'m empty.', 'Out of rounds.', 'That was my last round.'] },
    low_ammo: { any: ['Getting low on rounds.', 'A handful of rounds left.'] },
    heal: { any: ['Patching up.', 'Using a medkit.', 'That\'s the worst of it stopped.'] },
    eat: { any: ['Eating while I walk.', 'Food. Not good food.'] },
    hungry: { any: ['Getting hungry.', 'Should have brought more to eat.'], reckless: ['Food is for people who plan.'] },
    found: {
      any: ['Found {what}.', 'Picked up {what}.'],
      greedy: ['Oh, lovely. {what}.', 'Mine now. {what}.'],
      cautious: ['{what}. That\'ll help.']
    },
    found_rifle: { any: ['A rifle! Someone\'s day went badly.', 'Now that\'s a proper gun.'] },
    found_shotgun: {
      any: ['A shotgun. Nobody gets close now.', 'Shotgun. Heavy, but I\'ll take it.'],
      reckless: ['Oh, I\'m going to enjoy this.'],
      cautious: ['Hope I never have to let anyone get that close.']
    },
    found_mp5: {
      any: ['A submachine gun. It\'ll eat rounds, though.', 'MP5. Still oiled. Somebody cared about this.'],
      greedy: ['That\'s worth something even if I never fire it.']
    },
    found_grenade: {
      any: ['Found {what}. Careful now.', 'Picked up {what}. Handle with care.'],
      reckless: ['Got {what}! Finally.'],
      cautious: ['Found {what}. Into the bottom of the pack, well away from the food.']
    },
    grenade: {
      any: ['Grenade!', 'Get down! Not you, Zero.', 'Throwing!'],
      reckless: ['Catch!'],
      cautious: ['Heads down, heads down.']
    },
    body_found: {
      any: ['It\'s {name}. Taking what\'s left.', 'Found {name}. I\'ll take the gear on.', 'Oh, {name}.'],
      greedy: ['Sorry, {name}. You\'re not using it.'],
      cautious: ['I\'ve got you, {name}. I\'ll carry it from here.']
    },

    tell: {
      any: ['There\'s a shimmer ahead.', 'Pocket. Marking it.', 'See that? The air\'s wrong there.'],
      cautious: ['A tell. Good thing I was looking.'],
      reckless: ['Bit of shimmer. Going around.']
    },
    struck: { any: ['What the...', 'Pocket! I walked into a...', 'It\'s in my lungs.'] },

    tide_seen: {
      any: ['I can see it. Violet on the skyline.', 'There it is.', 'Tide. It\'s started.'],
      cautious: ['Tide on the horizon. Moving now.'],
      reckless: ['There\'s the tide. Plenty of time.'],
      greedy: ['Tide. A bit longer and I\'d have got the lot.']
    },
    tide_close: {
      any: ['It\'s right behind me!', 'Running. Running.', 'It\'s closing, Zero.', 'I can hear it.'],
      reckless: ['Bit quicker than I thought.']
    },
    turn_back: {
      any: ['Turning back. The tide won\'t wait.', 'I\'ve run out of day. Turning round.', '{site} will have to wait.'],
      reckless: ['Fine. Turning back. Fine.'],
      cautious: ['That\'s the line. Turning back, with time in hand.'],
      greedy: ['Turning back. Hate leaving it.']
    },
    push_on: {
      any: ['I should turn back. I\'m not going to.', '{site} is right there. I can see it.', 'Pushing on. Don\'t tell the journal.'],
      reckless: ['Turn back? I can practically touch it.'],
      greedy: ['Too close to walk away now.']
    },
    climb: {
      any: ['Can\'t make it. Going up.', 'High ground. It\'s the only chance.'],
      reckless: ['Up! Up up up!']
    },
    reached: {
      any: ['{site}. I\'m here. I\'m actually here.', 'I can see all of it from up here, Zero.', 'Reached {site}. Now to get back and tell someone.'],
      reckless: ['{site}! Who said it couldn\'t be done?'],
      cautious: ['{site}. Taking the reading. Then straight back.'],
      greedy: ['{site}. Nice view. Nothing worth taking.']
    },
    triumph: {
      any: ['It\'s done. {site} is in the book.', 'Tell them, Zero. Tell all of them. {site}.', 'For everyone who didn\'t get this far.'],
      reckless: ['Told you.'],
      cautious: ['Done. I\'d like to sit down now.']
    },

    last_tide: {
      any: ['It\'s here. Zero, it\'s all...', 'Tell the next one to leave earlier.', 'It\'s not cold. Nobody said it wouldn\'t be cold.', 'So much violet.', 'I can see the gold from here.'],
      reckless: ['Almost. I almost had it.'],
      cautious: ['I left in time. I did everything right.'],
      greedy: ['Should have dropped the pack.']
    },
    last_scavenger: {
      any: ['Zero, I\'m not going to...', 'They got me. Mark the camp.', 'Tell the next one not to come this way.', 'Too many of them.'],
      reckless: ['Worth a try.'],
      cautious: ['I knew it. I knew I should have gone round.'],
      greedy: ['They can have it. It\'s not worth...']
    },
    last_anomaly: {
      any: ['Nothing there. There was nothing th...', 'Zero, the air is...', 'Watch the ground. Tell them to watch the...', 'I didn\'t even see it.'],
      cautious: ['I was looking. I was looking right at it.'],
      reckless: ['Oh, that\'s not fair.']
    },
    last_starved: {
      any: ['Should have packed more.', 'So tired, Zero. Just a minute\'s rest.', 'Tell them to carry more food.']
    },
    last_oldself: {
      any: ['It knew my name, Zero.', 'It was wearing the coat. It was still wearing the coat.', 'It\'s one of ours. It\'s...'],
      cautious: ['I couldn\'t shoot. It looked at me.'],
      reckless: ['Should\'ve aimed for the... ha.']
    },

    old_seen: {
      any: ['Zero. That\'s {name}. That\'s {name}\'s coat.', 'Something\'s walking out there. It looks like {name}.', 'It\'s {name}. It can\'t be {name}.'],
      cautious: ['It\'s {name}. It\'s walking. Please tell me you see this.'],
      reckless: ['{name}, you ugly thing. Come here.'],
      greedy: ['That\'s {name}. And that\'s all of {name}\'s gear.']
    },
    old_kill: {
      any: ['Rest now, {name}.', 'It\'s over, {name}.', '{name} is down. Properly this time.'],
      reckless: ['Sorry, {name}. Stay down.'],
      greedy: ['Thanks for keeping it safe, {name}.'],
      cautious: ['I\'m so sorry, {name}.']
    },

    land_done: {
      any: ['That\'s the whole board, Zero.', 'Nothing left on the board out here.', 'We did it. All of it. Now what?']
    },
    new_land: {
      any: ['Zero? The map\'s wrong. All of it.', 'I don\'t recognise anything out there.', 'It\'s all different. Everything\'s different.', 'The stores came through. Nothing else did.'],
      cautious: ['We start again, then. Slowly.'],
      reckless: ['New ground. Good. I was bored of the old one.'],
      greedy: ['New land. Nobody\'s picked it over yet.']
    },

    ack_turnback: {
      any: ['Copy, Zero. Turning back.', 'If you say so. Coming in.', 'Heard. Heading for gold.'],
      cautious: ['Yes. Thank you. Coming in now.']
    },
    no_turnback: {
      any: ['I\'ve got time, Zero. I can do the sums.', 'Negative. I\'ll turn back when I need to.'],
      reckless: ['Not a chance. I\'m nearly there.', 'Can\'t hear you, Zero. Bad signal.'],
      greedy: ['Not with this much still out here.']
    },
    ack_pushon: {
      any: ['Your call, Zero. Keep the kettle on.', 'Pushing on. This one\'s on you.'],
      reckless: ['Finally, someone with sense.', 'Now you\'re talking.'],
      greedy: ['On your word, then.']
    },
    no_pushon: {
      any: ['No. I\'ve read what happened last time you said that.', 'I can do the sums, Zero. Negative.'],
      cautious: ['Absolutely not.', 'I\'d rather be alive and late.']
    },
    pushon_nothing: { any: ['Push on to what, Zero? I\'m not headed anywhere.'] },
    turnback_inside: { any: ['I\'m already under gold, Zero.', 'I\'m not going anywhere yet.'] },
    ack_warn: {
      any: ['Copy. Keeping clear of it.', 'Marked. I\'ll go round.', 'What did you see?'],
      cautious: ['Thank you. Going well around it.']
    },
    no_warn: {
      any: ['I can\'t see anything there, Zero.', 'I\'ll judge that when I get there.'],
      reckless: ['Sounds interesting. I\'ll stick to my route.']
    },
    ack_send: {
      any: ['On my way. Better be good.', 'Copy. Going to look.', 'Changing course.'],
      greedy: ['What is it? Don\'t tell me. On my way.']
    },
    no_send: {
      any: ['Not on your say-so, Zero.', 'I\'ve got my own plan, thanks.'],
      cautious: ['That\'s too far off my route.']
    },
    no_time: {
      any: ['There\'s not enough day left for that.', 'I\'d never get back in time.', 'Next window, maybe.']
    },
    ack_crate: {
      any: ['A crate? I\'ll go and get it.', 'I see the flare. Going for it.'],
      greedy: ['Now that\'s how you talk to someone.'],
      cautious: ['Thank you, Zero. Going for it.']
    },
    crate_later: { any: ['Marked the crate. I\'ll get it when I can.'] },
    crate_stash: { any: ['Crate\'s landed in the ring. Thanks, Zero.', 'Stores in the stash. I owe you one.'] },
    crate_got: {
      any: ['Crate\'s open. Thanks, Zero.', 'Got it. You just saved me a trip.'],
      greedy: ['Lovely stuff. Same again next time?']
    },
    right: {
      any: ['You were right, Zero.', 'Good call. How did you know?', 'That\'s what you saw, then.'],
      cautious: ['I\'m glad I listened.'],
      reckless: ['All right. You got that one.']
    },
    right_ignored: {
      any: ['You told me. I didn\'t listen.', 'You did warn me.'],
      reckless: ['Yes, all right. Not a word.']
    },
    wrong: {
      any: ['Nothing here, Zero.', 'I don\'t see anything. Are you sure about your map?', 'What was that for?'],
      reckless: ['Waste of a walk.'],
      cautious: ['Nothing. Better safe, I suppose.'],
      greedy: ['There\'s nothing here. You owe me.']
    },
    wrong_turnback: {
      any: ['A whole window gone, Zero. Nothing came.', 'I turned back for that?'],
      reckless: ['I could have made it. I told you.']
    }
  };

  RZ.VOICE = LINES;

  function fill(text, vars) {
    return text.replace(/\{(\w+)\}/g, function (all, key) {
      return vars && vars[key] !== undefined ? vars[key] : all;
    });
  }

  function missing(text, vars) {
    return /\{\w+\}/.test(fill(text, vars));
  }

  // Picks a line for this speaker, skipping lines they couldn't finish or that were just used.
  function choose(sim, r, key, vars) {
    var set = LINES[key];
    if (!set) return null;
    var pool = (set.any || []).concat(set[r.temperName] || []).filter(function (text) {
      return !missing(text, vars) && sim.talkUsed[text] === undefined;
    });
    if (!pool.length) {
      (set.any || []).concat(set[r.temperName] || []).forEach(function (text) { delete sim.talkUsed[text]; });
      pool = (set.any || []).concat(set[r.temperName] || []).filter(function (text) { return !missing(text, vars); });
    }
    if (!pool.length) return null;
    var text = sim.voiceRng.pick(pool);
    sim.talkUsed[text] = true;
    return RZ.sentences(fill(text, vars));
  }

  RZ.addTalk = function (sim, kind, text, who) {
    var line = { tick: sim.tick, kind: kind, text: text, who: who, seq: ++sim.talkSeq };
    sim.talk.push(line);
    if (sim.talk.length > sim.cfg.voice.lines) sim.talk.shift();
    RZ.emit(sim, 'say', { kind: kind, text: text, who: who });
  };

  // Some lines always get said. Everything else waits its turn, so rangers don't babble.
  var URGENT = {
    contact: 1, grenade: 1, hurt_bad: 1, tide_seen: 1, tide_close: 1, turn_back: 1, push_on: 1, reached: 1, triumph: 1,
    old_seen: 1, old_kill: 1, struck: 1, right: 1, right_ignored: 1, wrong: 1, wrong_turnback: 1, safe_close: 1,
    ack_turnback: 1, no_turnback: 1, ack_pushon: 1, no_pushon: 1, pushon_nothing: 1, turnback_inside: 1,
    ack_warn: 1, no_warn: 1, ack_send: 1, no_send: 1, no_time: 1, ack_crate: 1, crate_later: 1, crate_stash: 1,
    crate_got: 1, new_land: 1, land_done: 1, cleared: 1, not_cleared: 1, relic_got: 1, relic_missing: 1, board_new: 1,
    hold_land: 1, release_land: 1, climb: 1, flee: 1, dash: 1, kill: 1, body_found: 1, first: 1, grave: 1
  };

  RZ.speak = function (sim, r, key, vars, force) {
    if (!r || !r.alive && !force) return false;
    var c = sim.cfg.voice;
    var perSecond = sim.cfg.sim.ticksPerSecond;
    var voice = r.voice;
    var urgent = force || URGENT[key];
    var lastKind = voice.keys[key];
    if (!force && lastKind !== undefined && sim.tick - lastKind < c.cooldown * perSecond) return false;
    if (!urgent && sim.tick - voice.last < c.gap * perSecond) return false;
    var text = choose(sim, r, key, vars);
    if (!text) return false;
    voice.last = sim.tick;
    voice.keys[key] = sim.tick;
    RZ.addTalk(sim, 'ranger', text, r.first);
    return true;
  };

  // The answer to a question from Zero, built only from the ranger's own knowledge.
  function howAmI(r) {
    var c = r.cfg;
    var parts = [];
    if (r.hp >= c.ranger.hpMax * 0.8) parts.push('Not a mark on me');
    else if (r.hp >= c.ranger.hpMax * 0.5) parts.push('A bit knocked about');
    else if (r.hp >= c.ranger.hpMax * 0.25) parts.push('Hurt, and I won\'t pretend otherwise');
    else parts.push('Bad, Zero');
    if (r.energy < 25) parts.push('starving');
    else if (r.energy < 55) parts.push('hungry');
    var pack = r.pack;
    var gear = [pack.ammo + ' rounds', pack.food + ' food', pack.med + (pack.med === 1 ? ' medkit' : ' medkits')];
    return parts.join(', and ') + '. I\'ve got ' + gear[0] + ', ' + gear[1] + ' and ' + gear[2] + '.';
  }

  function whatsThePlan(r, book, clock) {
    var plan = r.plan;
    var left = Math.round(RZ.timeLeft(book, clock.seconds, r));
    var here = { x: r.x, y: r.y };
    var shelter = RZ.nearestSafe(r, book, here);
    var walk = shelter ? Math.round(shelter.seconds) : null;
    var timing = left > 0 && walk !== null && walk > 1
      ? ' I reckon ' + left + ' seconds before I have to be in, and ' + walk + ' to walk to ' + shelter.place.name + '.' : '';
    if (r.mode === 'shelter') return 'Getting under gold. That\'s the whole plan.' + timing;
    if (r.mode === 'climb') return 'Climbing. If I get high enough it might not reach me.';
    if (r.mode === 'fight') return 'Right now? Staying alive.';
    if (r.mode === 'flee') return 'Getting away from them, then working out the rest.';
    if (!plan || plan.kind === 'wait') {
      if (plan && plan.why === 'tide') return 'Sit tight until the tide has gone through, then see what\'s what.';
      if (plan && plan.why === 'stores') return 'The stores are empty. I\'m waiting for the next ration.';
      if (plan && plan.why === 'done') return 'Nothing. The board\'s done. I\'m waiting to see what comes for it.';
      return 'Waiting for a window long enough for ' + book.mission.name + '. The journal gives me ' + Math.max(0, left) + ' seconds on this one.';
    }
    if (plan.attempt) {
      var far = RZ.legSeconds(r, here, book.mission);
      var goal = plan.kind === 'clear' ? 'The camp at ' + book.mission.name + ', then back.' : plan.kind === 'retrieve' ? book.mission.name + ', then back.' : book.mission.name + ' and back.';
      return (plan.at === 0 ? goal + (far ? ' About ' + Math.round(far.seconds) + ' seconds to get there.' : '') : 'Done there. Going home now.') + timing;
    }
    if (plan.kind === 'deliver') return 'Getting ' + book.mission.name + ' home. That\'s all that matters now.' + timing;
    if (plan.kind === 'stock') return 'Carrying stores up to the staging post, so whoever goes for ' + book.mission.name + ' goes loaded.' + timing;
    if (plan.kind === 'fetch') return 'The stash is short, so I\'m going home for more.' + timing;
    if (plan.kind === 'advance') return 'Moving up to where I can start for ' + book.mission.name + '.' + timing;
    if (plan.kind === 'forage' || plan.kind === 'scavenge') return 'Having a look round while there\'s time.' + timing;
    if (plan.kind === 'recover') return 'Going for what the last one left.' + timing;
    if (plan.kind === 'errand') return 'Checking the spot you gave me.' + timing;
    return 'Keeping busy.' + timing;
  }

  function whatDoIKnow(r, book, clock) {
    var map = r.map;
    var left = Math.round(RZ.timeLeft(book, clock.seconds, r));
    var parts = [];
    if (book.tide.active) parts.push('The tide is in.');
    else if (book.tide.samples) parts.push('By the journal the tide is ' + (left > 0 ? left + ' seconds off, leaving my margin.' : 'overdue.'));
    else parts.push('Nobody has timed the tide properly yet. ' + (left > 0 ? 'Call it ' + left + ' seconds.' : 'It could come any time.'));
    var camps = map.camps.filter(function (camp) { return camp.spotted > 0; }).map(function (camp) { return camp.name; });
    if (camps.length) parts.push('Camps at ' + camps.slice(-3).join(', ') + '.');
    else parts.push('No camps marked yet.');
    if (map.anomalies.length) parts.push(map.anomalies.length + (map.anomalies.length === 1 ? ' pocket' : ' pockets') + ' marked.');
    var stocked = book.places.filter(function (place) {
      var stash = book.stashes[place.id];
      return !place.isHome && stash && stash.ammo + stash.food + stash.med > 0;
    }).map(function (place) {
      var stash = book.stashes[place.id];
      return place.name + ' has ' + stash.ammo + ' rounds and ' + stash.food + ' food';
    });
    if (stocked.length) parts.push(stocked[0] + '.');
    return parts.join(' ');
  }

  function whatAboutYou(r, book) {
    var zero = book.zero;
    if (zero.right + zero.wrong === 0) return 'The book doesn\'t say much about you yet, Zero. I\'m listening.';
    var score = zero.right + ' right and ' + zero.wrong + ' wrong';
    if (zero.trust >= 70) return 'The journal has you at ' + score + '. I\'ll take your word.';
    if (zero.trust >= 40) return 'The journal has you at ' + score + '. I\'ll hear you out.';
    return 'The journal has you at ' + score + '. Forgive me if I check for myself.';
  }

  RZ.answer = function (r, book, clock, topic) {
    if (topic === 'how') return howAmI(r);
    if (topic === 'plan') return whatsThePlan(r, book, clock);
    if (topic === 'know') return whatDoIKnow(r, book, clock);
    if (topic === 'zero') return whatAboutYou(r, book);
    return '...';
  };
})();
