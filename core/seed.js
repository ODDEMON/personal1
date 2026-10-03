/* core/seed.js —— 种子化随机
   同种子 + 同输入 = 同一条路径。每种运算取独立派生种子，
   这样「先算 A 再算 B」和「只算 B」不会互相污染。 */
window.MC = window.MC || {};
(function (MC) {
  'use strict';

  function hashStr(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rngFrom(seed, tag) { return mulberry32(hashStr(String(tag) + ' ' + (seed >>> 0))); }
  function range(rng, lo, hi) { return lo + (hi - lo) * rng(); }
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }
  function newSeed() { var n = Math.floor(Math.random() * 99999); return n > 0 ? n : 1; }
  function caseOf(seed) { return 'MC-' + (seed >>> 0).toString(36).toUpperCase(); }
  function caseToSeed(c) {
    var n = parseInt(String(c || '').replace(/^MC-/i, ''), 36);
    return isFinite(n) ? n : 0;
  }

  MC.seed = {
    hashStr: hashStr, mulberry32: mulberry32, rngFrom: rngFrom,
    range: range, pick: pick, newSeed: newSeed, caseOf: caseOf, caseToSeed: caseToSeed
  };
})(window.MC);
