/* core/audio.js —— 声轨层（纯合成）
   只做反馈音。起于静默位，不进判据，不写证明。 */
window.MC = window.MC || {};
(function (MC) {
  'use strict';

  var ac = null, master = null, on = false, failed = false;

  function ctx() {
    if (failed) return null;
    if (!ac) {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { failed = true; return null; }
        ac = new AC();
        master = ac.createGain();
        master.gain.value = 0;
        master.connect(ac.destination);
      } catch (e) { failed = true; return null; }
    }
    return ac;
  }

  function enabled() { return on && !!ac; }

  function enable() {
    var c = ctx();
    if (!c) return false;
    if (c.state === 'suspended' && c.resume) c.resume();
    on = true;
    applyVolume();
    return true;
  }
  function disable() { on = false; if (master) master.gain.value = 0; }

  function applyVolume() {
    if (!master) return;
    var want = MC.bus && MC.bus.state ? (MC.bus.state.sound ? 0.4 : 0) : 0;
    master.gain.value = on ? MC.eff.eff('volume', want) : 0;
  }

  function blip(freq, dur, type, gain) {
    if (!enabled()) return;
    var c = ctx(); if (!c) return;
    var when = c.currentTime;
    var osc = c.createOscillator(), g = c.createGain();
    osc.type = type || 'triangle';
    osc.frequency.setValueAtTime(freq, when);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain == null ? 0.12 : gain), when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + (dur || 0.09));
    osc.connect(g); g.connect(master);
    osc.start(when); osc.stop(when + (dur || 0.09) + 0.02);
  }

  MC.audio = {
    enable: enable, disable: disable, enabled: enabled, applyVolume: applyVolume,
    blip: blip,
    shot: function () { blip(660, 0.04, 'square', 0.05); },
    kill: function () { blip(320, 0.09, 'triangle', 0.10); },
    hurt: function () { blip(150, 0.18, 'sawtooth', 0.14); },
    pick: function () { blip(880, 0.10, 'sine', 0.12); },
    wave: function () { blip(220, 0.30, 'triangle', 0.14); },
    dead: function () { blip(110, 0.70, 'sine', 0.18); }
  };
})(window.MC);
