// Every tunable value lives here. CFG.look only affects drawing, so nothing in it can change balance.
// Times are in seconds of sim time at normal speed. Distances are in map cells.
// Try a value without editing this file: index.html?seed=7&tide.calm=90 or tools/*.js --set tide.calm=90

var CFG = {
  seed: 1,

  sim: {
    ticksPerSecond: 10
  },

  map: {
    width: 160,
    height: 100,
    elevationScale: 44,      // cells per noise wave; bigger means broader hills
    elevationOctaves: 5,
    waterFraction: 0.13,     // share of the map under water
    deepFraction: 0.05,      // share of the map too deep to cross
    rivers: 5,
    riverMinLength: 14,
    forestScale: 26,
    forestLow: 0.46,         // forest noise below this has no trees
    forestHigh: 0.66,        // forest noise above this is dense
    forestDensity: 0.62,     // chance of a tree in dense forest
    treelineElevation: 0.82, // trees thin out above this
    homeFlatRadius: 12,      // land is levelled around home
    homeElevation: 0.52,
    villages: 6,
    villageMinFromHome: 22,
    villageSpacing: 20,
    villageRadius: 4,
    hutsMin: 4,
    hutsMax: 8,
    outposts: 3,
    outpostRadius: 31,       // distance from home; stretched sideways to suit the map
    outpostWidthStretch: 1.25,
    outpostJitter: 0.3,      // radians of random spin on each outpost
    surveySites: 3,
    surveyMinFromHome: 56,
    surveyMinLeg: 70,        // walking cost from the nearest safe house
    surveyMaxLeg: 125,
    edgeMargin: 4,           // nothing important within this many cells of the edge
    flatSteepness: 0.35      // above this a spot is too steep for a settlement
  },

  terrain: {
    treeCost: 1.5,
    shallowCost: 3,
    hutCost: 2.5,
    slopeCost: 1.6,          // extra move cost per unit of steepness
    steepnessScale: 26       // elevation change per cell into steepness units
  },

  tide: {
    calm: 150,               // quiet time between one tide leaving and the next starting
    calmMin: 60,             // the slider's range. Zero can change the calm while a run goes on
    calmMax: 300,
    calmJitter: 0.12,        // each calm spell varies by this fraction
    surge: 40,
    hold: 10,
    retreat: 20,
    elevationDrag: 16,       // how much height slows the tide's spread
    waterDrag: 0.6,          // it runs quickly along water
    noiseScale: 10,          // cells per wobble in the front
    noiseDrag: 1.4,
    // Caught in the open, a ranger is infected rather than killed outright. The tide burns while it
    // touches them, and the mould it leaves keeps draining health until shelter or a medkit deals with it.
    burn: 4,                 // health per second while the tide is on them
    infectRate: 10,          // infection per second in the tide, out of 100
    drain: 0.04,             // health per second for each point of infection
    fade: 0.15,              // infection lost per second out in the open, on its own
    shelterCure: 4,          // infection burned off per second in an outpost's shelter
    homeCure: 12,
    medCure: 40,             // infection a medkit clears
    medAt: 25                // infection at which a ranger out in the open uses a medkit on it
  },

  safe: {
    radius: 4,               // the ring of mould that keeps the tide out
    restHeal: 1,             // health per second resting in an outpost
    homeRestHeal: 4
  },

  ranger: {
    speed: 3.2,              // move cost per second; open flat ground costs 1 a cell
    hpMax: 100,
    energyMax: 100,
    hungerSeconds: 300,      // a full stomach to empty
    starveDamage: 2,         // health lost per second at empty
    eatBelow: 55,
    healBelow: 55,
    capacity: 14,            // carrying weight
    sightRange: 14,
    eyeHeight: 0.6,
    heightScale: 18,         // elevation into sight-line height
    treeHeight: 1.1,
    hutHeight: 2.2,
    rays: 120,
    thinkTicks: 5,           // how often a ranger looks around and decides
    unknownCost: 1.9,        // what unseen ground is assumed to cost
    respawnSeconds: 6
  },

  items: {
    weights: { food: 1, ammo: 0.05, med: 1, loot: 1, grenade: 1, relic: 1 },
    foodEnergy: 45,
    medHeal: 40,
    // rank picks the main gun. For each shot a ranger draws whichever carried gun does the most damage
    // per second at that distance. burst is rounds per trigger pull, each rolled on its own.
    weapons: {
      pistol: { rank: 1, weight: 2, range: 9, hit: 0.62, falloff: 0.45, damageMin: 10, damageMax: 22, reload: 1.5 },
      shotgun: { rank: 2, weight: 4, range: 6, hit: 0.88, falloff: 0.75, damageMin: 26, damageMax: 44, reload: 2.4 },
      mp5: { rank: 2, weight: 3, range: 10, hit: 0.5, falloff: 0.5, damageMin: 7, damageMax: 14, reload: 1.6, burst: 3 },
      rifle: { rank: 3, weight: 3, range: 14, hit: 0.68, falloff: 0.35, damageMin: 16, damageMax: 30, reload: 2 }
    },
    // Thrown, so no line of fire is needed, but the target cell must be in sight. Lands up to a cell off.
    grenade: {
      range: 10,
      minRange: 4,             // won't throw closer than this, which keeps the thrower out of the blast
      radius: 2.5,             // blast reach in cells; damage fades towards the edge
      damageMin: 30,
      damageMax: 55,
      scatter: 0.35,           // chance it lands a cell off
      reload: 1.8,             // seconds before the thrower can act again
      minTargets: 2,           // a group worth a grenade; one will do when the fight looks lost
      plenty: 2,               // carrying this many, one enemy is worth a grenade too
      alert: 12                // scavengers this close hear the blast
    },
    freeKit: { food: 2, ammo: 14, med: 1, weapon: 'pistol' },
    homeStart: { food: 12, ammo: 100, med: 4, grenade: 3 },
    homeRation: { food: 2, ammo: 10, med: 1, grenade: 1 },  // arrives after each tide
    villageFinds: 2,         // salvage per village per tide
    scatterFinds: 5,         // salvage in the open per tide
    finds: {
      food: { chance: 4, min: 1, max: 2 },
      ammo: { chance: 3, min: 6, max: 16 },
      med: { chance: 2, min: 1, max: 1 },
      loot: { chance: 2, min: 1, max: 2 },
      rifle: { chance: 1.2, min: 1, max: 1 },
      shotgun: { chance: 0.9, min: 1, max: 1 },
      mp5: { chance: 0.7, min: 1, max: 1 },
      grenade: { chance: 1.1, min: 1, max: 2 }
    }
  },

  scav: {
    campMin: 2,
    campMax: 4,
    picketMin: 2,            // every survey site is guarded
    picketMax: 2,
    hp: 34,
    sight: 13,
    range: 11,
    hit: 0.48,
    falloff: 0.4,
    damageMin: 8,
    damageMax: 17,
    reload: 2.2,
    leash: 11,               // how far from camp they'll give chase
    moveTicks: 6,
    alertTicks: 60,
    reinforceChance: 0.2,    // per camp, per tide
    dropChance: 0.5
  },

  // Patrols: armed groups walking a loop between villages. Fought like scavengers, with the same guns.
  // Scavenger deaths rise with every walker added (see R-091 on the board).
  patrol: {
    count: 2,                // patrols in each land
    sizeMin: 2,
    sizeMax: 2,
    stops: 3,                // villages on a loop
    legMax: 55,              // furthest one stop is from the next, in cells
    routeMax: 320,           // longest loop worth walking, in cells
    spacing: 2,              // cells between walkers in the file
    moveTicks: 9,            // slower than a camp scavenger giving chase
    pause: 12,               // steps spent at each village before moving on
    reinforceChance: 0.2,    // per patrol, per tide, while it's short
    leash: 8,                // how far they'll leave the route to give chase
    sight: 10                // walking, they watch the road more than the hills. A camp scavenger's is 13
  },

  combat: {
    treeCover: 0.7,          // multiplies the chance of being hit
    hutCover: 0.5,
    // Enemies this close stop walking at the ranger and work round them instead.
    flank: {
      close: 3.5,            // closer than this, an armed enemy flanks
      ring: 2.5,             // the distance they try to hold
      clawRing: 1.2,         // an old self with no gun closes to arm's length
      spread: 2.5,           // keep at least this far from each other
      steps: 4,              // sidesteps round the ranger before holding
      cover: 0.4             // how much a tree on the cell is worth
    }
  },

  anomaly: {
    count: 22,               // scattered, thickening towards the edges
    outerReach: 70,          // at this distance from home a spot is always accepted
    aroundSite: 4,           // extra pockets around each survey site
    aroundSiteMin: 3,
    aroundSiteMax: 12,
    clearOfSafe: 9,          // none this close to a safe house
    tellRange: 4,
    strikeRadius: 1,
    noticeChance: 0.14,      // per look, while in tell range
    carefulNoticeChance: 0.3,
    carefulSpeed: 0.88,
    damageMin: 50,
    damageMax: 100
  },

  planner: {
    tideGuess: 130,          // first guess at the calm spell, before anyone has timed one
    tideClearSeconds: 4,     // no tide in view for this long means it has passed
    tideSampleFloor: 0.6,    // shorter calm spells than this share of the estimate are ignored
    tideLearnDown: 0.6,      // how far one timed calm moves the estimate, when it came early
    tideLearnUp: 0.4,        // and when it came late. Lower is warier, and slower to notice longer calms
    minimumWindow: 12,       // don't bother setting out with less time than this
    buffer: 6,               // spare seconds kept on any trip
    routeSlack: 0.08,        // walks take longer than they look
    shelterSeconds: 180,     // time to allow for waiting on the next window
    tripFoodSeconds: 60,     // spare walking time in the food sums
    shelterCheckTicks: 10,
    ammoBase: 14,
    ammoPerCamp: 6,
    ammoCap: 80,
    ammoPerFailure: 4,
    medBase: 1,
    medCap: 5,
    failuresPerMed: 2,
    travelFood: 1,           // extra food taken on a stock run
    ammoLeeway: 0.3,         // share of the ammo target a ranger will go without
    medLeeway: 1,            // medkits a ranger will go without
    stagingSwitch: 0.7,      // change staging post only for a walk this much shorter
    bodyWorth: 3,            // gear below this isn't worth a trip
    surveyReach: 1,
    patienceMax: 8,
    patienceSeconds: 14,     // shortfall in the window accepted per tide already waited out
    patienceShare: 0.2,      // but never more than this share of the window: past that, the trip can't be done
    patienceSpent: 2,        // tides of patience used up by setting out
    pushSeconds: 16,         // how near the site a ranger will ignore the clock, at normal nerve
    pushMax: 30,             // and never further than this, however bold the line has become
    fightNerve: 0.7,         // fight if the expected damage is under this share of health and meds
    fleeDistance: 12,
    fleeTicks: 30,
    fleesBeforeDash: 1,      // times a survey ranger runs from a camp before running through it
    climbWhenTideWithin: 6,
    climbWhenShelterBeyond: 12,
    grabRange: 8,            // cells; anything nearer is worth picking up, if the detour still beats the tide
    keepRounds: 30,
    gunGrabReach: 1.6,       // guns are worth going this much further for than anything else
    grenades: 2,             // taken from a stash for an attempt, one more for breaking a camp          // never leaves rounds below this to make room for something better
    bodyRange: 14,           // how far off the road a ranger will go for a body in view
    forageMinimum: 26,       // the least time worth spending on a short trip
    forageLinger: 25,        // ticks spent searching at the far end
    forageShare: 0.8,        // share of the time left a forage trip may use
    forageRounds: 8,         // nobody walks out with an empty gun
    stockPatience: 340,      // seconds without an attempt before going with what there is
    hungerWait: 90,          // a tide passing, with time to spare: food for the window after next, or go home now
    foodLow: 3,              // fewer meals than this at hand, and food is worth a detour
    campAvoidRadius: 11,
    campAvoidCost: 6,
    patrolAvoidRadius: 6,    // around each place a patrol was seen walking
    patrolAvoidCost: 3,
    patrolMarkSpacing: 6,    // sightings closer than this to one already marked aren't marked again
    anomalyAvoidCost: 30,
    avoidCampAfter: 2
  },

  lessons: {
    tideMarginStart: 0.05,
    tideMarginStep: 0.07,    // each tide death widens the margin
    tideMarginEase: 0.025,   // each turn-back narrows it again
    tideMarginCaught: 0.035, // caught by the tide and lived: a smaller lesson than dying of it
    tideMarginMax: 0.25,
    foodExtraMax: 4,
    ammoStep: 12,
    ammoExtraMax: 60,
    medExtraMax: 3,
    nerveStep: 0.25,         // each turn-back
    nerveLoss: 0.65,         // each tide death
    nerveMin: 0.4,
    nerveMax: 2.5,
    lowAmmo: 6               // fewer rounds than this at death counts as out of ammo
  },

  // A ranger's temper multiplies or adds to what the planner and brain use. Only the sim reads these.
  people: {
    recruits: 3,             // choices offered between lives
    tempers: {
      cautious: {
        tideMargin: 0.05,    // added to the journal's margin
        fightNerve: 0.75,
        pushSeconds: 0.5,
        grabRange: 1,
        grabTime: 1.5,       // spare time wanted in hand for a detour, as a multiple of the buffer
        leeway: 0.6,         // how short of stores they'll set out
        ammo: 4,
        forage: 0.7,         // share of a calm spell they'll spend foraging
        board: { reward: 0.8, danger: 1.6, prefer: { clear: -25, stock: 10 } },  // how they weigh objectives
        heed: { turnback: 35, pushon: -25, warn: 25, send: -10, crate: 10 }
      },
      greedy: {
        tideMargin: 0,
        fightNerve: 1,
        pushSeconds: 1,
        grabRange: 1.7,
        grabTime: 0.6,
        leeway: 1,
        ammo: 0,
        forage: 1,
        board: { reward: 1.6, danger: 1, prefer: { retrieve: 10 } },
        heed: { turnback: -5, pushon: 10, warn: 0, send: 30, crate: 30 }
      },
      reckless: {
        tideMargin: -0.04,
        fightNerve: 1.4,
        pushSeconds: 1.6,
        grabRange: 1,
        grabTime: 0.8,
        leeway: 1.5,
        ammo: -4,
        forage: 0.9,
        board: { reward: 1, danger: 0.5, prefer: { clear: 25, stock: -15 } },
        heed: { turnback: -25, pushon: 35, warn: -15, send: 10, crate: 20 }
      }
    },
    quirks: {
      keen: { label: 'keen eyes', note: 'sees further', sight: 2 },
      steady: { label: 'steady hands', note: 'shoots straighter', aim: 1.12 },
      mule: { label: 'broad back', note: 'carries more', capacity: 3 },
      gut: { label: 'iron gut', note: 'eats less', hunger: 1.4 },
      quick: { label: 'quick feet', note: 'walks faster', speed: 1.08 },
      quiet: { label: 'soft tread', note: 'harder to spot', quiet: 3 },
      medic: { label: 'field medic', note: 'heals more', medHeal: 15 }
    }
  },

  // Zero on the radio.
  radio: {
    signalStart: 3,
    signalMax: 5,
    signalPerTide: 2,
    costs: { turnback: 1, pushon: 1, warn: 1, send: 1, crate: 3 },
    trustStart: 50,
    trustMin: 0,
    trustMax: 100,
    heedAt: 40,              // trust plus temper must reach this for a call to be heeded
    trustRight: 8,
    trustWrong: 8,
    trustPushDeath: 18,      // pushed on by Zero and died for it
    trustPushWin: 14,
    turnbackWithin: 75,      // a turn-back is right if the tide shows within this many seconds
    warnRadius: 7,
    warnCost: 26,            // route cost around a heeded warning
    warnPassed: 3,           // this close with nothing there, and the warning was wrong
    warnNoticeChance: 0.6,   // chance per look of spotting a tell near a warned spot
    lookRadius: 7,           // what counts as finding something at a sent-to spot
    crateFall: 6,            // seconds from the call to landing
    crate: { food: 2, ammo: 14, med: 1 }
  },

  // How often rangers talk. In seconds of sim time.
  voice: {
    gap: 8,                  // minimum between lines that can wait
    cooldown: 18,            // before the same kind of line again
    // Kinds that would otherwise come round in every fight or every trip.
    cooldowns: { kill: 45, hurt: 30, contact: 40, flee: 40, safe: 150, eat: 300, hungry: 180, heal: 60, found: 25,
                 tell: 40, walk_new: 240, muse_tide: 300, low_ammo: 90, no_ammo: 60 },
    // Seconds before anyone says the same words again. With nothing fresh to say, rangers keep quiet,
    // except when they owe Zero an answer or something big has happened.
    rest: 900,
    museEvery: 70,           // a thought while waiting
    walkEvery: 55,           // a thought on the road
    lines: 300,
    graveRange: 7
  },

  oldself: {
    max: 3,                  // more bodies than this are simply digested
    hp: 40,
    sight: 11,
    moveTicks: 8,
    aim: 0.6,                // their old gun, in worse hands
    clawRange: 1.6,
    clawMin: 10,
    clawMax: 20,
    clawReload: 2,
    leash: 26,               // how far they'll drift from where they rose
    lifeTides: 4,            // then the mould lets go
    gearWorth: 1,            // bodies carrying less than this stay down
    mutterEvery: 45,
    mutterRange: 16          // cells; further off, the ranger can't hear them and neither can Zero
  },

  // The board: what the line is asked to do in each land. See objectives.js.
  objectives: {
    survey: 3,               // survey sites on a board, from the land's sites
    clear: 1,                // camps to break
    retrieve: 1,             // things to fetch home
    stock: 1,                // outposts to stock
    clearMinFromHome: 20,    // in cells; camps nearer home than this aren't worth a board slot
    clearReach: 5,           // how near the camp's middle a ranger must stand to call it clear
    clearLinger: 30,         // ticks spent sweeping the huts before calling it
    ammoPerScav: 6,          // rounds carried for each scavenger the board reports
    retrieveMinLeg: 45,      // walking cost from the nearest safe house. Nearer than survey sites, because it has to be carried home
    retrieveMaxLeg: 95,
    apart: 10,               // in cells; objectives keep at least this far apart
    stockGoods: { food: 6, ammo: 40, med: 3 },
    relicWorth: 12,          // a body carrying the relic is worth this much more to recover
    // How the planner weighs one objective against another. Tempers scale these (see people.tempers).
    weigh: {
      reward: 2,             // per point of reward value
      ready: 40,             // for a staging post with everything the attempt needs
      walk: 0.5,             // per second from the staging post to the target
      danger: 12,            // per known camp near the target, more for each that has beaten us
      stick: 30,             // staying with the current objective, so supplies don't scatter
      tooLong: 50,           // a round trip longer than the journal's window
      turnback: 10,          // per turn-back on this objective, up to four
      dangerRadius: 14
    }
  },

  // What a finished objective leaves behind: a cache at the site, or goods in the outpost's stash.
  rewards: {
    base: 4,                 // value points
    perCell: 0.12,           // for each cell from home
    perAttempt: 1.5,         // for each attempt it took, up to five
    typeBonus: { survey: 0, clear: 4, retrieve: 3, stock: -2 },
    ammoPerPoint: 1.6,
    foodEvery: 5,            // one food for this many points
    medEvery: 6,
    grenadeFrom: 10,         // a grenade in caches worth at least this
    weaponFrom: 8,           // a chance of a gun from this value up
    weaponChancePerPoint: 0.06,
    weaponChanceMax: 0.7,
    weapons: ['rifle', 'shotgun', 'mp5']
  },

  chapter: {
    hold: 0,                 // 1 keeps a land until its board is done, however many tides that takes
    tides: 8,                // a greater tide after this many
    seedStep: 1009           // each new land is a new map from the same seed
  },

  names: {
    outposts: ['Mill', 'Larch', 'Cairn', 'Heron', 'Tarn', 'Alder', 'Slate', 'Rook', 'Sedge', 'Quarry', 'Weir', 'Ember',
               'Linnet', 'Bracken', 'Cooper', 'Hollin', 'Marrow', 'Tinker', 'Yarrow', 'Pike'],
    villages: ['Ashby', 'Underfell', 'Wick', 'Saltmere', 'Oxley', 'Brack', 'Thorne', 'Dunmow', 'Ferry End', 'Harrow',
               'Coldwell', 'Staithe', 'Marl', 'Withy', 'Nether Row', 'Kiln Cross', 'Sallow', 'Gorse End', 'Tolling', 'Fenny'],
    sites: ['Signal Stone', 'Old Mast', 'Lantern Rock', 'Drowned Tower', 'Far Cairn', 'Bell Hill', 'The Gauge', 'Weather Post',
            'Hollow Beacon', 'Last Pylon', 'Sister Stones', 'The Sounding', 'Grey Lamp', 'Tally Mound'],
    relics: ['the seed case', 'the old drone', 'the survey log', 'a water still', 'the mast battery', 'the field radio',
             'the sample jars', 'the last map', 'a medical chest', 'the tide gauge'],
    first: ['Maren', 'Tobin', 'Ilse', 'Corin', 'Wren', 'Anselm', 'Juno', 'Hale', 'Sorrel', 'Bram', 'Odile', 'Fenn', 'Tamsin',
            'Ivo', 'Nell', 'Rook', 'Sabine', 'Emeka', 'Yara', 'Dov', 'Pilar', 'Kit', 'Lucan', 'Mirren', 'Ansa', 'Teo', 'Hester',
            'Jonah', 'Zofia', 'Ravi', 'Greer', 'Oren', 'Linh', 'Caspar', 'Ada', 'Silas', 'Noor', 'Mateus', 'Bryn', 'Thea',
            'Idris', 'Una', 'Kofi', 'Petra', 'Arlo', 'Sunniva', 'Hamish', 'Inés', 'Tarek', 'Bea'],
    last: ['Holt', 'Ashe', 'Varga', 'Pell', 'Marsh', 'Okafor', 'Teague', 'Lund', 'Sayer', 'Quill', 'Reyes', 'Thorn', 'Brandt',
           'Cole', 'Haddad', 'Nakai', 'Vance', 'Wray', 'Dunne', 'Kerr', 'Sorley', 'Amadi', 'Fenwick', 'Moss', 'Rask', 'Tully',
           'Ibarra', 'Crane', 'Loft', 'Harker', 'Stroud', 'Nowak', 'Eze', 'Voss', 'Pike', 'Linden']
  },

  // Drawing only. Nothing in the sim may read this.
  look: {
    basePixelsPerCell: 16,
    background: '#0c1115',
    tint: ['#16201f', '#1b2622', '#232c25', '#2e332a', '#3b3b30', '#4a4639', '#5a5546'],
    shallow: '#1b3a4b',
    deep: '#122a3c',
    shore: 'rgba(120, 170, 195, 0.55)',
    shoreWidth: 1.2,
    shoreLevel: 0.3,
    contourStep: 0.035,
    contourMajorEvery: 5,
    contourMinor: 'rgba(205, 205, 180, 0.17)',
    contourMajor: 'rgba(225, 220, 190, 0.36)',
    contourMinorWidth: 1,
    contourMajorWidth: 1.7,
    tree: '#2f4a33',
    treeEdge: 'rgba(120, 165, 120, 0.3)',
    hut: '#6d6352',
    hutEdge: '#a8987c',
    gold: '#e8b93a',
    goldBright: '#ffd968',
    goldDeep: '#b9882a',
    goldBlobs: 170,
    site: '#a9a595',
    siteOff: 'rgba(169, 165, 149, 0.4)',  // a survey site that isn't on the board
    clearMark: '#e4593f',
    siteActive: '#f4efdf',
    labelDim: '#b3ad9b',
    tideDark: [38, 12, 74],
    tideMid: [112, 44, 190],
    tideBright: [214, 150, 255],
    tideBodyAlpha: 0.74,
    tideVeinStrength: 0.7,
    tideVeinDepth: 0.3,       // how bright veins stay deep inside the mould
    tideVeinFade: 0.22,       // in tide level; how far behind the front they dim
    tideEdgeBand: 0.035,      // in tide level; the bright lip of the front
    tideGlowBand: 0.05,
    tideGlowAlpha: 0.32,
    tideOutOfSight: 0.72,     // ranger view: the tide beyond the ranger's sight, as a share of its strength
    fogColor: [9, 13, 17],
    fogUnknownRanger: 0.96,
    fogRememberedRanger: 0.4,
    fogUnknownDual: 0.5,
    fogRememberedDual: 0.14,
    itemColors: { food: '#9ccf7a', ammo: '#e0c070', med: '#f08a8a', loot: '#7fc6d8', weapon: '#f4efdf', grenade: '#b8d46a', relic: '#ffd968', crate: '#e8b93a' },
    weaponMarks: { pistol: 'P', rifle: 'R', shotgun: 'S', mp5: 'M' },
    blast: '#ffb347',
    scav: '#e4593f',
    anomaly: '#cf9bff',
    mould: '#a55cff',        // the tide's infection on a ranger
    body: '#d9694f',
    ranger: '#fbf7e8',
    rangerEdge: '#20262b',
    rangerGlow: 'rgba(251, 247, 232, 0.16)',
    routeLine: 'rgba(251, 247, 232, 0.5)',
    planLine: 'rgba(251, 247, 232, 0.32)',   // legs of the plan after the current one
    planPin: '#f4efdf',
    planPinLater: '#a9a595',
    cargo: '#e0c070',
    storeShort: '#f08a6a',   // a stash count under the planner's target
    storeWrong: '#cf9bff',   // the journal has this count wrong
    shot: '#ffe9a8',
    labelHalo: 'rgba(8, 12, 15, 0.8)',
    journalLines: 400,
    temper: { cautious: '#7fa3b8', greedy: '#93ab5e', reckless: '#d0603f' },
    old: '#b58cd8',
    oldCoat: '#57446e',
    scavCoat: '#7a3a2e',
    patrolRoute: 'rgba(228, 89, 63, 0.3)',  // a patrol's loop, in Zero's views only
    paper: '#efe7d2',
    paperInk: '#262320',
    warnMark: '#ffb547',
    sendMark: '#8fe0d0',
    crate: '#e8b93a',
    grave: '#a79f8f',
    track: 'rgba(251, 247, 232, 0.65)',
    speechSeconds: 3.4,      // how long a line stays up, plus a little per letter
    speechPerLetter: 0.035,
    speechWidth: 230,
    zoom: {
      min: 1,
      max: 6,
      road: 2.3,             // the camera's zoom while walking
      fight: 3,
      shelter: 1.9,          // at rest in shelter
      tide: 1.15,            // waiting out a tide: pull back and watch it
      caught: 1.9,           // out in the open with a tide on
      dead: 2.8,
      ease: 1.5,             // zoom smoothing, per second
      pan: 3.2,              // position smoothing, per second
      lookAhead: 0.3         // how far the camera leads along the route
    },
    pace: {
      wait: 8,               // auto speed while waiting out a calm spell
      tide: 4,               // waiting out a tide in shelter
      road: 2,               // an uneventful walk
      danger: 1,             // enemies in view, or the tide close
      crisis: 0.6,           // close to dying
      talk: 1,               // for a few seconds after Zero speaks
      talkSeconds: 4
    },
    cardSeconds: 12,         // a card closes by itself after this long
    calmStep: 10             // the tide length slider moves in steps of this many seconds
  }
};

// Applies "a.b=value" overrides to a config object. Used by URL options and the tools' --set flag.
function applyConfigOverride(cfg, path, raw) {
  var keys = path.split('.');
  var node = cfg;
  for (var i = 0; i < keys.length - 1; i++) {
    if (typeof node[keys[i]] !== 'object' || node[keys[i]] === null) throw new Error('No config group: ' + path);
    node = node[keys[i]];
  }
  var last = keys[keys.length - 1];
  if (!(last in node)) throw new Error('No config value: ' + path);
  var value = Number(raw);
  node[last] = isNaN(value) ? raw : value;
}
