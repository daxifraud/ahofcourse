/* ===== Module: emergency-repair.js =====
   玩家紧急修车：每辆玩家载具/每次接管独立一次性能力。
   与科技树战场维修、控制区维修和地图强化道具完全分离；AI 不会获得该能力。
   维修口径复用 control-zones.js 的 5 HP/s 常量，但不复用其停车准备时间。 */
'use strict';

var EMERGENCY_REPAIR_FALLBACK_KEYS = ['gun', 'turret', 'engine', 'fuel', 'ammo', 'trackL', 'trackR', 'trans', 'crew', 'tailRotor'];
var EMERGENCY_REPAIR_FALLBACK_RATE = 5;

function emergencyRepairKeys() {
  return (typeof CONTROL_ZONE_REPAIR_KEYS !== 'undefined' && CONTROL_ZONE_REPAIR_KEYS && CONTROL_ZONE_REPAIR_KEYS.length)
    ? CONTROL_ZONE_REPAIR_KEYS : EMERGENCY_REPAIR_FALLBACK_KEYS;
}
function emergencyRepairRate() {
  return (typeof CONTROL_ZONE_REPAIR_RATE === 'number' && isFinite(CONTROL_ZONE_REPAIR_RATE))
    ? CONTROL_ZONE_REPAIR_RATE : EMERGENCY_REPAIR_FALLBACK_RATE;
}

/* Called at every new player vehicle boundary.  A new AI vehicle is never
   armed merely because it is later updated by this module. */
function emergencyRepairReset(t) {
  if (!t) return;
  t._emergencyRepairAvailable = t.isPlayer === true;
  t._emergencyRepairActive = false;
  t._emergencyRepairTarget = null;
  t._emergencyRepairLockPos = null;
}

function emergencyRepairCanUse(t) {
  return !!t && t === player && t.isPlayer === true && t.alive === true &&
    t._emergencyRepairAvailable !== false && !t._emergencyRepairActive;
}

function emergencyRepairPickTarget(t) {
  if (!t || !t.mods) return null;
  var best = null, bestFrac = Infinity, bestDamage = -Infinity;
  var keys = emergencyRepairKeys();
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i], mod = t.mods[key];
    /* Structural hull entries have max=0 and are not repairable modules. */
    if (!mod || mod.structural || !(Number(mod.max) > 0)) continue;
    var max = Number(mod.max), hp = Math.max(0, Number(mod.hp) || 0);
    if (hp >= max - 1e-9) continue;
    var frac = hp / max, damage = max - hp;
    /* Same selection rule as control-zone repair: lowest relative HP first;
       damage is a deterministic tie-break for equal percentages. */
    if (frac < bestFrac - 1e-12 ||
        (Math.abs(frac - bestFrac) < 1e-12 && damage > bestDamage)) {
      bestFrac = frac;
      bestDamage = damage;
      best = { key: key, mod: mod, max: max };
    }
  }
  return best;
}

function emergencyRepairFinish(t, finishedKey) {
  if (!t) return;
  t._emergencyRepairActive = false;
  t._emergencyRepairTarget = null;
  t._emergencyRepairLockPos = null;
  t.speed = 0;
  t._throttle = 0;
  t._throttleLock = 0;
  t._driveThrottle = 0;
  t._steerRate = 0;
  t._turnCmd = 0;
  t._motionVx = 0;
  t._motionVz = 0;
  t.velX = 0;
  t.velZ = 0;
  /* A fully restored turret must release the one-time hull-aim fallback that
     is armed when the turret crosses zero HP. */
  if (finishedKey === 'turret' && t._hullAim && t.mods && t.mods.turret && t.mods.turret.hp > 0) {
    t._hullAim = false;
  }
  if (t === player && typeof window !== 'undefined' && typeof window._touchUISync === 'function') window._touchUISync();
}

function emergencyRepairUse(t) {
  if (!emergencyRepairCanUse(t)) return false;
  var target = emergencyRepairPickTarget(t);
  if (!target) {
    if (typeof aimHint === 'function') aimHint('NO REPAIRABLE MODULE');
    return false;
  }

  /* The use is consumed on activation, not on completion: there is only one
     emergency repair attempt per deployment/takeover. */
  t._emergencyRepairAvailable = false;
  t._emergencyRepairActive = true;
  t._emergencyRepairTarget = target.key;
  if (t.group && t.group.position) {
    t._emergencyRepairLockPos = {
      x: t.group.position.x,
      y: t.group.position.y,
      z: t.group.position.z
    };
  }
  t.speed = 0;
  t._throttle = 0;
  t._throttleLock = 1;
  t._driveThrottle = 0;
  t._steerRate = 0;
  t._turnCmd = 0;
  t._motionVx = 0;
  t._motionVz = 0;
  t.velX = 0;
  t.velZ = 0;
  /* Helicopter translational velocity is also zeroed; the per-frame lock below
     keeps the repair action stationary even when the aircraft is airborne. */
  if (typeof isHeliVehicle === 'function' && isHeliVehicle(t)) {
    t._heliVx = 0;
    t._heliVy = 0;
    t._heliVz = 0;
    t._heliPitchRate = 0;
    t._heliRollRate = 0;
    t._heliYawRate = 0;
  }
  if (typeof aimHint === 'function') aimHint('EMERGENCY REPAIR');
  if (typeof window !== 'undefined' && typeof window._touchUISync === 'function') window._touchUISync();
  emergencyRepairHudTick();
  return true;
}

function emergencyRepairIsActive(t) {
  return !!t && t._emergencyRepairActive === true;
}

function emergencyRepairTick(t, dt) {
  if (!t || t !== player || t.isPlayer !== true || !t.alive) return;
  if (!t._emergencyRepairActive) return;

  var lock = t._emergencyRepairLockPos;
  /* Lock the complete vehicle position after player physics/collision has had
     its turn.  Inputs are zeroed in player.js as well, so this is a final
     guard against drift or a collision push during the repair window. */
  if (lock && t.group && t.group.position) {
    t.group.position.set(lock.x, lock.y, lock.z);
  }
  t.speed = 0;
  t._throttle = 0;
  t._throttleLock = 1;
  t._driveThrottle = 0;
  t._steerRate = 0;
  t._turnCmd = 0;
  t._motionVx = 0;
  t._motionVz = 0;
  t.velX = 0;
  t.velZ = 0;

  var key = t._emergencyRepairTarget;
  var mod = key && t.mods && t.mods[key];
  var max = mod && Number(mod.max);
  if (!mod || !(max > 0)) {
    emergencyRepairFinish(t, key);
    return;
  }
  var stepDt = Math.max(0, Number(dt) || 0);
  mod.hp = Math.min(max, Math.max(0, Number(mod.hp) || 0) + emergencyRepairRate() * stepDt);
  if (typeof effSync === 'function') effSync(t);
  if (t === player && typeof playerHudDamage === 'function') playerHudDamage(key);

  if (mod.hp >= max - 1e-9) {
    mod.hp = max;
    emergencyRepairFinish(t, key);
  }
  if (lock && t.group && t.group.position) {
    t.group.position.set(lock.x, lock.y, lock.z);
  }
}

var _emergencyRepairHud = typeof document !== 'undefined' ? document.getElementById('emergency-repair-hud') : null;
var _emergencyRepairButton = typeof document !== 'undefined' ? document.getElementById('emergency-repair-button') : null;

function emergencyRepairHudTick() {
  if (!_emergencyRepairHud) return;
  var visible = typeof gameState !== 'undefined' && gameState === 'playing' && emergencyRepairCanUse(player);
  _emergencyRepairHud.classList.toggle('hidden', !visible);
  _emergencyRepairHud.classList.toggle('is-available', visible);
  _emergencyRepairHud.setAttribute('aria-hidden', visible ? 'false' : 'true');
  if (_emergencyRepairButton) {
    _emergencyRepairButton.disabled = !visible;
    _emergencyRepairButton.setAttribute('aria-disabled', visible ? 'false' : 'true');
  }
}

if (_emergencyRepairButton) {
  _emergencyRepairButton.addEventListener('click', function (e) {
    if (e && e.preventDefault) e.preventDefault();
    emergencyRepairUse(player);
  });
}

/* Compatibility helper for the flow.js touch layer. */
if (typeof window !== 'undefined') {
  window.emergencyRepairUse = emergencyRepairUse;
  window.emergencyRepairCanUse = emergencyRepairCanUse;
  window.emergencyRepairReset = emergencyRepairReset;
  window.emergencyRepairIsActive = emergencyRepairIsActive;
  window.emergencyRepairHudTick = emergencyRepairHudTick;
}
