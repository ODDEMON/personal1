/* core/eff.js —— 单点收敛
   所有上限只写在这三张表里，逻辑里禁止散落 if。
   冷静模式只压上限，不改任何一条规则。 */
window.MC = window.MC || {};
(function (MC) {
  'use strict';

  var CAP = {
    speed: 5.6,
    radius: 26,
    fireRate: 90,        /* 开火间隔下限，越小越快 */
    damage: 400,
    pierce: 12,
    projectile: 24,      /* 单次开火弹丸数上限 */
    bulletSpeed: 13,
    hpMax: 2000,
    enemyCount: 170,
    bulletCount: 300,
    volume: 0.4,
    dropRate: 0.6
  };

  var CALM = {
    speed: 4.0,
    enemyCount: 90,
    bulletSpeed: 11,
    volume: 0.2,
    dropRate: 0.8
  };

  var FLOOR = {
    speed: 1.6,
    radius: 5,
    fireRate: 60,
    damage: 1,
    pierce: 0,
    projectile: 1,
    bulletSpeed: 3,
    hpMax: 40,
    volume: 0,
    dropRate: 0
  };

  function calm() { return !!(MC.bus && MC.bus.state && MC.bus.state.calm); }

  function limitOf(key) {
    var t = calm() ? CALM : {};
    return (t[key] != null) ? t[key] : CAP[key];
  }

  function eff(key, value) {
    var hi = limitOf(key), lo = FLOOR[key];
    if (hi != null && value > hi) value = hi;
    if (lo != null && value < lo) value = lo;
    return value;
  }

  /* 开火间隔这类「越小越强」的量单独收口，别在逻辑里各写各的 */
  function effInv(key, value) {
    var hi = limitOf(key), lo = FLOOR[key];
    if (hi != null && value > hi) value = hi;
    if (lo != null && value < lo) value = lo;
    return value;
  }

  MC.eff = { CAP: CAP, CALM: CALM, FLOOR: FLOOR, limitOf: limitOf, eff: eff, effInv: effInv, calm: calm };
})(window.MC);
