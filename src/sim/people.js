// Who the rangers are: a name, a temper, a quirk and a line or two of history.
// Tempers change how a ranger really behaves. The numbers are in CFG.people.

var RZ = RZ || {};

(function () {
  var PASTS = [
    'Ran the ferry at Staithe until there was no far bank.',
    'Surveyor\'s apprentice. The surveyor isn\'t coming back.',
    'Grew up on the ridges. Doesn\'t like valleys.',
    'Buried a whole village, then walked here.',
    'Kept bees. Won\'t talk about it.',
    'Came in off the marsh with someone else\'s boots.',
    'Reads the journal the way other people pray.',
    'Used to drive the salt wagons.',
    'Mended radios. Knows what static sounds like when it\'s nothing.',
    'Took the job because the last ranger owed them money.',
    'Has outlived two brothers and a dog.',
    'Taught school in a town that\'s under the violet now.',
    'Says the safe houses hum. Nobody else can hear it.',
    'Was a scavenger once. Doesn\'t mention it around the others.',
    'Walked in during a tide and can\'t say how.',
    'Lost a bet. Stayed anyway.',
    'Counts everything. Steps, rounds, days.',
    'Wants to see the far side of it before the end.',
    'Sang in the choir at Dunmow, when there was a Dunmow.',
    'Signed the book without reading it.',
    'Came to find a sister. Has stopped saying so.',
    'Cuts a notch for every ranger before them.',
    'Knows every old road on the map, and which ones are gone.',
    'Doesn\'t sleep much. Doesn\'t seem to need to.'
  ];

  RZ.temperNames = function (cfg) {
    return Object.keys(cfg.people.tempers);
  };

  function deck(sim, key, list) {
    var decks = sim.people.decks;
    if (!decks[key] || !decks[key].length) decks[key] = sim.peopleRng.shuffle(list.slice());
    return decks[key].pop();
  }

  // Three people waiting at the gate. The first is whoever goes if nobody chooses.
  RZ.makeRecruits = function (sim) {
    var cfg = sim.cfg;
    var tempers = sim.peopleRng.shuffle(RZ.temperNames(cfg));
    var quirks = Object.keys(cfg.people.quirks);
    var list = [];
    for (var n = 0; n < cfg.people.recruits; n++) {
      var first = deck(sim, 'first', cfg.names.first);
      var last = deck(sim, 'last', cfg.names.last);
      list.push({
        first: first,
        last: last,
        name: first + ' ' + last,
        temper: tempers[n % tempers.length],
        quirk: deck(sim, 'quirk', quirks),
        past: deck(sim, 'past', PASTS)
      });
    }
    return list;
  };

  // Puts a person into a ranger's body: every per-ranger number lives here.
  RZ.dress = function (r, person, cfg) {
    var quirk = cfg.people.quirks[person.quirk];
    r.first = person.first;
    r.last = person.last;
    r.name = person.name;
    r.temperName = person.temper;
    r.temper = cfg.people.tempers[person.temper];
    r.quirk = person.quirk;
    r.quirkLabel = quirk.label;
    r.past = person.past;
    r.speed = cfg.ranger.speed * (quirk.speed || 1);
    r.capacity = cfg.ranger.capacity + (quirk.capacity || 0);
    r.sight = cfg.ranger.sightRange + (quirk.sight || 0);
    r.hungerSeconds = cfg.ranger.hungerSeconds * (quirk.hunger || 1);
    r.medHeal = cfg.items.medHeal + (quirk.medHeal || 0);
    r.aim = quirk.aim || 1;
    r.quiet = quirk.quiet || 0;
  };

  // How a ranger signs a journal entry.
  RZ.lead = function (r) {
    return r.first + '. ';
  };

  // How the journal introduces someone.
  RZ.who = function (r) {
    return 'Ranger ' + r.no + ', ' + r.name;
  };
})();
