// Sound. Everything is synthesised, so there are no files to load. It starts on the first click or
// key, because browsers won't play sound before then. It reads sim state and never changes it.

var RZ = RZ || {};

(function () {
  function Audio() {
    this.ctx = null;
    this.muted = false;
    this.nextBeat = 0;
    this.lastBlip = 0;
  }

  function noiseBuffer(ctx, seconds) {
    var length = Math.floor(ctx.sampleRate * seconds);
    var buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    var last = 0;
    // Brown noise: soft and low, like wind. This is the view, so it may use Math.random.
    for (var i = 0; i < length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    return buffer;
  }

  function whiteBuffer(ctx, seconds) {
    var length = Math.floor(ctx.sampleRate * seconds);
    var buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  Audio.prototype.start = function () {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    var Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    var ctx = new Context();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    // A limiter, so a burst of gunfire can't clip.
    var limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 8;
    limiter.ratio.value = 14;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    this.master.connect(limiter);
    limiter.connect(ctx.destination);
    this.white = whiteBuffer(ctx, 1);

    // Wind: looping low noise, slowly swelling.
    var wind = ctx.createBufferSource();
    wind.buffer = noiseBuffer(ctx, 6);
    wind.loop = true;
    var windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 480;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.2;
    var lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    var lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain);
    lfoGain.connect(windFilter.frequency);
    lfo.start();
    wind.connect(windFilter);
    windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    wind.start();

    // The tide: a low, slightly sour chord that opens up as it gets close.
    this.tideGain = ctx.createGain();
    this.tideGain.gain.value = 0;
    this.tideFilter = ctx.createBiquadFilter();
    this.tideFilter.type = 'lowpass';
    this.tideFilter.frequency.value = 180;
    this.tideFilter.connect(this.tideGain);
    this.tideGain.connect(this.master);
    [55, 58.3, 82.4, 110.7].forEach(function (frequency, n) {
      var osc = ctx.createOscillator();
      osc.type = n % 2 ? 'sawtooth' : 'triangle';
      osc.frequency.value = frequency;
      var gain = ctx.createGain();
      gain.gain.value = 0.2;
      osc.connect(gain);
      gain.connect(this.tideFilter);
      osc.start();
    }, this);
  };

  Audio.prototype.setMuted = function (muted) {
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.7, this.ctx.currentTime, 0.05);
  };

  function burst(self, options) {
    var ctx = self.ctx;
    var now = ctx.currentTime + (options.delay || 0);
    var source = ctx.createBufferSource();
    source.buffer = self.white;
    source.loop = true;
    var filter = ctx.createBiquadFilter();
    filter.type = options.filter || 'lowpass';
    filter.frequency.setValueAtTime(options.from, now);
    filter.frequency.exponentialRampToValueAtTime(options.to, now + options.length);
    filter.Q.value = options.q || 0.7;
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(options.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + options.length);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(self.master);
    source.start(now);
    source.stop(now + options.length + 0.02);
  }

  function tone(self, options) {
    var ctx = self.ctx;
    var now = ctx.currentTime + (options.delay || 0);
    var osc = ctx.createOscillator();
    osc.type = options.type || 'sine';
    osc.frequency.setValueAtTime(options.from, now);
    if (options.to) osc.frequency.exponentialRampToValueAtTime(options.to, now + options.length);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(options.volume, now + (options.attack || 0.008));
    gain.gain.exponentialRampToValueAtTime(0.0008, now + options.length);
    osc.connect(gain);
    gain.connect(self.master);
    osc.start(now);
    osc.stop(now + options.length + 0.03);
  }

  // extra can carry the weapon fired and a delay, so a burst rattles instead of landing as one bang.
  Audio.prototype.play = function (name, loud, extra) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    var volume = loud === undefined ? 1 : loud;
    var weapon = extra && extra.weapon;
    var delay = (extra && extra.delay) || 0;
    if (name === 'shot' && weapon === 'shotgun') {
      burst(this, { from: 2200, to: 110, length: 0.32, volume: 0.6 * volume, delay: delay });
      tone(this, { from: 120, to: 36, length: 0.22, volume: 0.45 * volume, delay: delay });
    } else if (name === 'shot' && weapon === 'mp5') {
      burst(this, { from: 3800, to: 500, length: 0.07, volume: 0.38 * volume, delay: delay });
      tone(this, { from: 210, to: 90, length: 0.05, volume: 0.22 * volume, delay: delay });
    } else if (name === 'shot') {
      burst(this, { from: 3000, to: 200, length: 0.16, volume: 0.5 * volume, delay: delay });
      tone(this, { from: 150, to: 50, length: 0.12, volume: 0.35 * volume, delay: delay });
    } else if (name === 'far-shot') {
      burst(this, { from: weapon === 'shotgun' ? 900 : 1200, to: 150, length: weapon === 'mp5' ? 0.1 : 0.2, volume: 0.22 * volume, delay: delay });
    } else if (name === 'blast') {
      burst(this, { from: 1600, to: 60, length: 0.9, volume: 0.7 * volume });
      tone(this, { from: 70, to: 28, length: 0.8, volume: 0.6 * volume, type: 'sine' });
    } else if (name === 'hit') {
      tone(this, { from: 110, to: 45, length: 0.2, volume: 0.6 });
      burst(this, { from: 900, to: 200, length: 0.08, volume: 0.25 });
    } else if (name === 'blip') {
      var now = this.ctx.currentTime;
      if (now - this.lastBlip < 0.3) return;
      this.lastBlip = now;
      burst(this, { filter: 'bandpass', from: 2400, to: 1800, length: 0.05, volume: 0.05, q: 3 });
      tone(this, { from: 1250, length: 0.05, volume: 0.035, type: 'square' });
    } else if (name === 'zero') {
      tone(this, { from: 880, length: 0.06, volume: 0.05, type: 'square' });
      tone(this, { from: 1320, length: 0.08, volume: 0.05, type: 'square', delay: 0.07 });
      burst(this, { filter: 'bandpass', from: 2600, to: 1400, length: 0.14, volume: 0.05, q: 2 });
    } else if (name === 'static') {
      burst(this, { filter: 'bandpass', from: 1200, to: 700, length: 0.7, volume: 0.09, q: 1.5 });
      tone(this, { from: 170, to: 130, length: 0.7, volume: 0.03, type: 'sawtooth', attack: 0.2 });
    } else if (name === 'death') {
      tone(this, { from: 220, to: 55, length: 1.8, volume: 0.25, type: 'triangle', attack: 0.04 });
      tone(this, { from: 165, to: 41, length: 2.2, volume: 0.2, type: 'sine', attack: 0.04 });
      burst(this, { filter: 'bandpass', from: 1000, to: 300, length: 1.1, volume: 0.09, q: 1 });
    } else if (name === 'triumph') {
      [261.6, 329.6, 392, 523.3].forEach(function (frequency, n) {
        tone(this, { from: frequency, length: 1.8, volume: 0.1, type: 'triangle', delay: n * 0.13 });
      }, this);
    } else if (name === 'tide') {
      tone(this, { from: 49, length: 3.2, volume: 0.3, type: 'sawtooth', attack: 0.8 });
      tone(this, { from: 73.4, length: 3.2, volume: 0.15, type: 'sawtooth', attack: 1 });
    } else if (name === 'strike') {
      burst(this, { filter: 'bandpass', from: 300, to: 3000, length: 0.5, volume: 0.25, q: 4 });
      tone(this, { from: 600, to: 90, length: 0.5, volume: 0.2, type: 'sawtooth' });
    } else if (name === 'crate') {
      burst(this, { filter: 'bandpass', from: 500, to: 1800, length: 1, volume: 0.08, q: 2 });
    } else if (name === 'thud') {
      tone(this, { from: 100, to: 40, length: 0.25, volume: 0.4 });
    }
  };

  // Called every frame with how things stand.
  Audio.prototype.update = function (state) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    var now = this.ctx.currentTime;
    this.tideGain.gain.setTargetAtTime(state.tide * 0.34, now, 0.6);
    this.tideFilter.frequency.setTargetAtTime(160 + state.tide * 760, now, 0.6);
    this.windGain.gain.setTargetAtTime(0.13 + (1 - state.tide) * 0.1, now, 1);
    if (state.heart > 0 && now >= this.nextBeat) {
      var gap = 1.15 - state.heart * 0.55;
      this.nextBeat = now + gap;
      tone(this, { from: 62, to: 40, length: 0.14, volume: 0.55 * state.heart + 0.15 });
      tone(this, { from: 58, to: 38, length: 0.14, volume: 0.42 * state.heart + 0.1, delay: 0.17 });
    }
  };

  RZ.makeAudio = function () {
    return new Audio();
  };
})();
