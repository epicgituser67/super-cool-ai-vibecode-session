/* Tiny WebAudio chiptune engine: an original loop plus one-shot SFX.
   No samples, no files, no network. Everything is synthesised on the fly. */
(function (global) {
  'use strict';

  var ctx = null;
  var master = null;
  var muted = false;
  var started = false;

  // Sequencer state
  var stepTimer = null;
  var nextNoteTime = 0;
  var step = 0;
  var BPM = 124;
  var STEP_DUR = 60 / BPM / 2; // eighth notes
  var LOOKAHEAD = 0.12;

  // An original 16-step progression in A minor. Deliberately not the song.
  var LEAD = [76, 0, 74, 72, 0, 74, 76, 0, 72, 0, 69, 0, 71, 72, 74, 0];
  var BASS = [45, 45, 0, 52, 45, 0, 41, 0, 43, 43, 0, 50, 45, 0, 45, 0];

  function midiToFreq(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  function ensureCtx() {
    if (ctx) return ctx;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
    return ctx;
  }

  function tone(opts) {
    if (!ctx || muted) return;
    var t = opts.at || ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = opts.type || 'square';
    osc.frequency.setValueAtTime(opts.freq, t);
    if (opts.slideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slideTo), t + opts.dur);
    }
    var vol = opts.vol == null ? 0.2 : opts.vol;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    osc.connect(gain);
    gain.connect(opts.dest || master);
    osc.start(t);
    osc.stop(t + opts.dur + 0.02);
  }

  function noise(dur, vol, filterFreq) {
    if (!ctx || muted) return;
    var t = ctx.currentTime;
    var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = filterFreq || 1200;
    var gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(lp);
    lp.connect(gain);
    gain.connect(master);
    src.start(t);
  }

  function scheduler() {
    if (!ctx) return;
    while (nextNoteTime < ctx.currentTime + LOOKAHEAD) {
      var lead = LEAD[step % LEAD.length];
      var bass = BASS[step % BASS.length];
      if (lead) {
        tone({ freq: midiToFreq(lead), dur: STEP_DUR * 0.8, vol: 0.075, type: 'square', at: nextNoteTime });
      }
      if (bass) {
        tone({ freq: midiToFreq(bass), dur: STEP_DUR * 0.9, vol: 0.11, type: 'triangle', at: nextNoteTime });
      }
      nextNoteTime += STEP_DUR;
      step++;
    }
  }

  var Sound = {
    /* Must be called from a user gesture so the browser lets audio run. */
    unlock: function () {
      if (!ensureCtx()) return;
      if (ctx.state === 'suspended') ctx.resume();
    },

    startMusic: function () {
      if (!ensureCtx() || started) return;
      started = true;
      nextNoteTime = ctx.currentTime + 0.05;
      step = 0;
      stepTimer = setInterval(scheduler, 25);
    },

    stopMusic: function () {
      if (stepTimer) clearInterval(stepTimer);
      stepTimer = null;
      started = false;
    },

    isMuted: function () { return muted; },

    setMuted: function (v) {
      muted = !!v;
      if (master) master.gain.value = muted ? 0 : 0.32;
      return muted;
    },

    toggleMute: function () { return Sound.setMuted(!muted); },

    // ---- one-shots ----
    pickup: function (chain) {
      var n = 72 + Math.min(14, chain * 1);
      tone({ freq: midiToFreq(n), dur: 0.09, vol: 0.16, type: 'square' });
      tone({ freq: midiToFreq(n + 7), dur: 0.07, vol: 0.1, type: 'square', at: ctx ? ctx.currentTime + 0.05 : 0 });
    },

    gold: function () {
      if (!ctx) return;
      var t0 = ctx.currentTime;
      [72, 76, 79, 84].forEach(function (n, i) {
        tone({ freq: midiToFreq(n), dur: 0.14, vol: 0.16, type: 'square', at: t0 + i * 0.06 });
      });
    },

    hurt: function () {
      tone({ freq: 220, slideTo: 60, dur: 0.35, vol: 0.2, type: 'sawtooth' });
      noise(0.3, 0.16, 700);
    },

    dash: function () {
      tone({ freq: 300, slideTo: 900, dur: 0.16, vol: 0.1, type: 'triangle' });
      noise(0.12, 0.06, 2400);
    },

    power: function () {
      if (!ctx) return;
      var t0 = ctx.currentTime;
      [69, 74, 81].forEach(function (n, i) {
        tone({ freq: midiToFreq(n), dur: 0.18, vol: 0.14, type: 'triangle', at: t0 + i * 0.07 });
      });
    },

    buy: function () {
      tone({ freq: midiToFreq(64), dur: 0.1, vol: 0.16, type: 'square' });
      tone({ freq: midiToFreq(71), dur: 0.18, vol: 0.16, type: 'square', at: ctx ? ctx.currentTime + 0.09 : 0 });
    },

    deny: function () {
      tone({ freq: 160, slideTo: 90, dur: 0.22, vol: 0.16, type: 'square' });
    },

    over: function () {
      if (!ctx) return;
      var t0 = ctx.currentTime;
      [69, 67, 64, 57].forEach(function (n, i) {
        tone({ freq: midiToFreq(n), dur: 0.3, vol: 0.17, type: 'sawtooth', at: t0 + i * 0.16 });
      });
    }
  };

  global.Sound = Sound;
})(window);
