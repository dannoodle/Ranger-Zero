// Ranger voices. Each line a ranger says is read out by the browser's own speech synth, keyed up like
// a radio: a click, static under the voice, and a roger bleep at the end. A question ends with "Over."
// It only hears what the sim already said, and nothing here reaches back into the sim.

var RZ = RZ || {};

(function () {
  var STORE_KEY = 'rz.voices';

  // A small string hash, so a ranger keeps the same voice for life without using any random stream.
  function hash(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function remembered() {
    try {
      return window.localStorage.getItem(STORE_KEY);
    } catch (error) {
      return null;
    }
  }

  function remember(value) {
    try {
      window.localStorage.setItem(STORE_KEY, value);
    } catch (error) {
      // Private windows can refuse storage. The toggle still works for this visit.
    }
  }

  // Radio speech. The synth reads "Zero" as a number, not a name, so the spoken line leaves it out
  // ("They're shooting, Zero." is heard as "They're shooting."). The written line keeps it.
  // A question hands the channel back.
  RZ.radioWords = function (text) {
    var words = text
      .replace(/,\s*Zero,/g, '')
      .replace(/,\s*Zero(?=[.?!])/g, '')
      .replace(/(^|[.?!]\s+)Zero[,.?!]\s+(\w)/g, function (all, before, letter) { return before + letter.toUpperCase(); });
    return /\?["'”’)\s]*$/.test(words) ? words + ' Over.' : words;
  };

  function Voices(audio, look) {
    this.audio = audio;
    this.look = look;
    this.synth = window.speechSynthesis || null;
    var stored = remembered();
    this.on = !!this.synth && (stored === null ? look.on : stored === 'on');
    this.queue = [];
    this.talking = null;
    this.pool = [];
    this.cast = {};
    if (!this.synth) return;
    var self = this;
    this.loadVoices();
    // Most browsers list their voices a moment after the page loads.
    if ('onvoiceschanged' in this.synth) this.synth.addEventListener('voiceschanged', function () { self.loadVoices(); });
    window.addEventListener('pagehide', function () { self.stop(); });
  }

  var V = Voices.prototype;

  // English voices, with the natural-sounding ones on their own if there are enough of them to go round.
  V.loadVoices = function () {
    var all = this.synth.getVoices();
    var english = all.filter(function (voice) { return /^en\b|^en[-_]/i.test(voice.lang); });
    var list = english.length ? english : all;
    var better = new RegExp(this.look.better, 'i');
    var good = list.filter(function (voice) { return better.test(voice.name); });
    this.pool = good.length >= this.look.enoughGood ? good : list;
    this.cast = {};
  };

  // Who a ranger sounds like: a voice picked by name, pitch and rate set by temper, nudged a little each.
  V.castFor = function (who) {
    var key = who.no + ':' + who.name;
    if (this.cast[key]) return this.cast[key];
    var look = this.look;
    var h = hash(key);
    var base = look.tempers[who.temperName] || { pitch: 1, rate: 1 };
    var nudge = ((h >>> 12) % 1000) / 1000 - 0.5;
    var part = {
      voice: this.pool.length ? this.pool[h % this.pool.length] : null,
      pitch: Math.max(0.5, Math.min(1.6, base.pitch + nudge * look.jitter)),
      rate: base.rate
    };
    this.cast[key] = part;
    return part;
  };

  // A line has been said. noise is how badly it comes through, 0 clear to 1 barely there.
  // Returns true if it will be read out, so the caller can skip the plain blip.
  V.hear = function (text, who, running, noise) {
    if (!this.on || !this.synth || this.audio.muted || !who) return false;
    if (running > this.look.maxSpeed) return false;
    this.queue.push({ text: text, cast: this.castFor(who), noise: noise || 0, at: performance.now() });
    while (this.queue.length > this.look.queue) this.queue.shift();
    this.next();
    return true;
  };

  V.next = function () {
    if (this.talking || !this.on) return;
    var now = performance.now();
    var stale = this.look.staleSeconds * 1000;
    while (this.queue.length && now - this.queue[0].at > stale) this.queue.shift();
    var line = this.queue.shift();
    if (!line) return;
    var self = this;
    var look = this.look;
    var noise = line.noise;
    var utterance = new SpeechSynthesisUtterance(RZ.radioWords(line.text));
    if (line.cast.voice) {
      utterance.voice = line.cast.voice;
      utterance.lang = line.cast.voice.lang;
    }
    // A poor signal comes through a little fainter, and a touch off pitch.
    utterance.pitch = Math.max(0.5, Math.min(1.6, line.cast.pitch + (Math.random() * 2 - 1) * look.reception.warble * noise));
    utterance.rate = line.cast.rate;
    utterance.volume = look.volume * (1 - Math.random() * look.reception.fade * noise);
    var talk = { utterance: utterance, started: now, words: utterance.text, dead: false };
    this.talking = talk;
    utterance.onend = utterance.onerror = function () { self.finish(talk, true); };
    this.audio.play('key');
    this.audio.radioOn(noise);
    setTimeout(function () {
      if (!talk.dead) self.synth.speak(utterance);
    }, look.keySeconds * 1000);
  };

  // The end of a transmission. Cut-off ones (muted, switched off) end without the bleep.
  V.finish = function (talk, bleep) {
    if (this.talking !== talk) return;
    talk.dead = true;
    this.talking = null;
    this.audio.radioOff();
    if (bleep) this.audio.play('roger');
    var self = this;
    setTimeout(function () { self.next(); }, this.look.gapSeconds * 1000);
  };

  // Called every frame. Some browsers lose the end of a line, which would jam the radio for good.
  V.update = function () {
    var talk = this.talking;
    if (!talk) return;
    var limit = this.look.keySeconds * 1000 + 4000 + talk.words.length * 120;
    if (performance.now() - talk.started > limit) {
      talk.dead = true;
      this.synth.cancel();
      this.finish(talk, false);
    }
  };

  V.stop = function () {
    this.queue = [];
    var talk = this.talking;
    if (talk) {
      talk.dead = true;
      this.finish(talk, false);
    }
    if (this.synth) this.synth.cancel();
  };

  V.setOn = function (on) {
    this.on = !!this.synth && on;
    remember(this.on ? 'on' : 'off');
    if (!this.on) this.stop();
  };

  RZ.makeVoices = function (audio, look) {
    return new Voices(audio, look);
  };
})();
