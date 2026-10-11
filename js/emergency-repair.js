/* ===== Module: emergency-repair.js =====
   玩家紧急修车：当前玩家载具可反复使用，每次维修完成后冷却 30 秒。
   与科技树战场维修、控制区维修和地图强化道具完全分离；AI 不会获得该能力。
   维修口径复用 control-zones.js 的 5 HP/s 常量，但不复用其停车准备时间。 */
'use strict';

var EMERGENCY_REPAIR_FALLBACK_KEYS = ['gun', 'turret', 'engine', 'fuel', 'ammo', 'trackL', 'trackR', 'trans', 'crew', 'tailRotor'];
var EMERGENCY_REPAIR_FALLBACK_RATE = 5;
var EMERGENCY_REPAIR_COOLDOWN = 30;

function emergencyRepairKeys() {
  return (typeof CONTROL_ZONE_REPAIR_KEYS !== 'undefined' && CONTROL_ZONE_REPAIR_KEYS && CONTROL_ZONE_REPAIR_KEYS.length)
    ? CONTROL_ZONE_REPAIR_KEYS : EMERGENCY_REPAIR_FALLBACK_KEYS;
}
function emergencyRepairRate() {
  return (typeof CONTROL_ZONE_REPAIR_RATE === 'number' && isFinite(CONTROL_ZONE_REPAIR_RATE) && CONTROL_ZONE_REPAIR_RATE > 0)
    ? CONTROL_ZONE_REPAIR_RATE : EMERGENCY_REPAIR_FALLBACK_RATE;
}
function emergencyRepairCooldownValue(t) {
  var v = t && Number(t._emergencyRepairCooldown);
  return isFinite(v) && v > 0 ? v : 0;
}
function emergencyRepairRefreshAvailable(t) {
  if (!t) return;
  /* _emergencyRepairAvailable is retained as a readable compatibility flag;
     cooldown and active state are the authoritative gates. */
  t._emergencyRepairAvailable = t.isPlayer === true && !t._emergencyRepairActive && emergencyRepairCooldownValue(t) <= 1e-9;
}

/* Called at every new player vehicle boundary.  A new AI vehicle is never
   armed merely because it is later updated by this module. */
function emergencyRepairReset(t) {
  if (!t) return;
  t._emergencyRepairCooldown = 0;
  t._emergencyRepairActive = false;
  t._emergencyRepairAvailable = t.isPlayer === true;
  t._emergencyRepairTarget = null;
  t._emergencyRepairLockPos = null;
  t._emergencyRepairRepairStart = 0;
  t._emergencyRepairRepairMax = 0;
  t._emergencyRepairRepairTotal = 0;
  t._emergencyRepairRepairRemaining = 0;
}

function emergencyRepairCanUse(t) {
  return !!t && t === player && t.isPlayer === true && t.alive === true &&
    !t._emergencyRepairActive && emergencyRepairCooldownValue(t) <= 1e-9;
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
  t._emergencyRepairRepairRemaining = 0;
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
  /* A fully restored turret must release the hull-aim fallback that is armed
     when the turret crosses zero HP. */
  if (finishedKey === 'turret' && t._hullAim && t.mods && t.mods.turret && t.mods.turret.hp > 0) {
    t._hullAim = false;
  }
  /* The cooldown starts only after the repair countdown has completed. */
  t._emergencyRepairCooldown = EMERGENCY_REPAIR_COOLDOWN;
  emergencyRepairRefreshAvailable(t);
  if (t === player && typeof window !== 'undefined' && typeof window._touchUISync === 'function') window._touchUISync();
}

function emergencyRepairUse(t) {
  if (!emergencyRepairCanUse(t)) return false;
  var target = emergencyRepairPickTarget(t);
  if (!target) {
    if (typeof aimHint === 'function') aimHint('NO REPAIRABLE MODULE');
    return false;
  }

  var rate = emergencyRepairRate();
  var startHp = Math.max(0, Number(target.mod.hp) || 0);
  var repairTotal = Math.max(0, (target.max - startHp) / rate);

  /* The repair countdown is a separate phase.  Cooldown is deliberately kept
     at zero here and starts in emergencyRepairFinish(), so repair time never
     consumes the 30-second cooldown. */
  t._emergencyRepairAvailable = false;
  t._emergencyRepairCooldown = 0;
  t._emergencyRepairActive = true;
  t._emergencyRepairTarget = target.key;
  t._emergencyRepairRepairStart = startHp;
  t._emergencyRepairRepairMax = target.max;
  t._emergencyRepairRepairTotal = repairTotal;
  t._emergencyRepairRepairRemaining = repairTotal;
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
  /* This function is deliberately player-only.  main.js calls it once at the
     explicit player simulation boundary, never as an AI ability. */
  if (!t || t !== player || t.isPlayer !== true) return;
  var stepDt = Math.max(0, Number(dt) || 0);
  if (!t.alive) return;

  /* Repairing is a hard pre-cooldown phase.  Do not decrement the cooldown
     while the repair countdown is active; finish() starts it after full repair. */
  if (!t._emergencyRepairActive) {
    var oldCooldown = emergencyRepairCooldownValue(t);
    if (oldCooldown > 0) {
      t._emergencyRepairCooldown = Math.max(0, oldCooldown - stepDt);
      if (t._emergencyRepairCooldown <= 1e-9 && typeof window !== 'undefined' && typeof window._touchUISync === 'function') {
        window._touchUISync();
      }
    } else {
      t._emergencyRepairCooldown = 0;
    }
    emergencyRepairRefreshAvailable(t);
    emergencyRepairHudTick();
    return;
  }

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
    emergencyRepairHudTick();
    return;
  }
  var rate = emergencyRepairRate();
  mod.hp = Math.min(max, Math.max(0, Number(mod.hp) || 0) + rate * stepDt);
  t._emergencyRepairRepairRemaining = Math.max(0, (max - mod.hp) / rate);
  if (typeof effSync === 'function') effSync(t);
  if (t === player && typeof playerHudDamage === 'function') playerHudDamage(key);

  if (mod.hp >= max - 1e-9) {
    mod.hp = max;
    emergencyRepairFinish(t, key);
  }
  if (lock && t.group && t.group.position) {
    t.group.position.set(lock.x, lock.y, lock.z);
  }
  emergencyRepairHudTick();
}

var _emergencyRepairHud = typeof document !== 'undefined' ? document.getElementById('emergency-repair-hud') : null;
var _emergencyRepairButton = typeof document !== 'undefined' ? document.getElementById('emergency-repair-button') : null;
var _emergencyRepairProgress = typeof document !== 'undefined' ? document.getElementById('emergency-repair-progress') : null;
var _emergencyRepairProgressIcon = typeof document !== 'undefined' ? document.getElementById('emergency-repair-progress-icon') : null;
var _emergencyRepairProgressFill = typeof document !== 'undefined' ? document.getElementById('emergency-repair-progress-fill') : null;
var _emergencyRepairProgressTime = typeof document !== 'undefined' ? document.getElementById('emergency-repair-progress-time') : null;
var _emergencyRepairCooldownStatus = typeof document !== 'undefined' ? document.getElementById('emergency-repair-cooldown') : null;
var _emergencyRepairCooldownTime = typeof document !== 'undefined' ? document.getElementById('emergency-repair-cooldown-time') : null;
var _emergencyRepairCooldownIcon = typeof document !== 'undefined' ? document.getElementById('emergency-repair-cooldown-icon') : null;

function emergencyRepairHudTick() {
  if (!_emergencyRepairHud) return;
  var t = typeof player !== 'undefined' ? player : null;
  var playingNow = typeof gameState !== 'undefined' && gameState === 'playing';
  var active = !!t && t.isPlayer === true && t.alive === true && t._emergencyRepairActive === true;
  var cooldown = t && t.isPlayer === true && t.alive === true ? emergencyRepairCooldownValue(t) : 0;
  var ready = playingNow && emergencyRepairCanUse(t);
  var visible = playingNow && !!t && t.isPlayer === true && t.alive === true && (ready || active || cooldown > 0);
  var state = active ? 'REPAIRING' : (cooldown > 0 ? 'COOLDOWN' : (ready ? 'READY' : 'HIDDEN'));

  _emergencyRepairHud.classList.toggle('hidden', !visible);
  _emergencyRepairHud.classList.toggle('is-available', ready);
  _emergencyRepairHud.classList.toggle('is-repairing', active);
  _emergencyRepairHud.classList.toggle('is-cooldown', cooldown > 0);
  _emergencyRepairHud.setAttribute('data-state', state);
  _emergencyRepairHud.setAttribute('aria-hidden', visible ? 'false' : 'true');

  if (_emergencyRepairButton) {
    _emergencyRepairButton.classList.toggle('hidden', !ready);
    _emergencyRepairButton.disabled = !ready;
    _emergencyRepairButton.setAttribute('aria-disabled', ready ? 'false' : 'true');
  }

  if (_emergencyRepairProgress) {
    _emergencyRepairProgress.classList.toggle('hidden', !active);
    if (active && t) {
      var targetKey = t._emergencyRepairTarget;
      var mod = targetKey && t.mods && t.mods[targetKey];
      var max = mod && Number(mod.max) > 0 ? Number(mod.max) : Number(t._emergencyRepairRepairMax) || 1;
      var hp = mod ? Math.max(0, Number(mod.hp) || 0) : Number(t._emergencyRepairRepairStart) || 0;
      var start = Number(t._emergencyRepairRepairStart) || 0;
      var span = Math.max(0.0001, max - start);
      var progress = Math.max(0, Math.min(1, (hp - start) / span));
      var remaining = Math.max(0, Number(t._emergencyRepairRepairRemaining) || ((max - hp) / emergencyRepairRate()));
      if (_emergencyRepairProgressFill) _emergencyRepairProgressFill.style.width = (progress * 100).toFixed(2) + '%';
      if (_emergencyRepairProgressTime) _emergencyRepairProgressTime.textContent = remaining.toFixed(1) + 's';
      if (_emergencyRepairProgressIcon) {
        _emergencyRepairProgressIcon.style.background = 'conic-gradient(#9dffa8 ' + (progress * 360).toFixed(1) + 'deg, rgba(20,25,20,.92) 0deg)';
      }
    }
  }

  if (_emergencyRepairCooldownStatus) {
    /* The square repair panel replaces the ready panel while active; the
       square cooldown panel replaces it only after the repair has finished. */
    var showCooldown = visible && !active && cooldown > 0;
    _emergencyRepairCooldownStatus.classList.toggle('hidden', !showCooldown);
    _emergencyRepairCooldownStatus.setAttribute('aria-hidden', showCooldown ? 'false' : 'true');
    if (showCooldown) {
      if (_emergencyRepairCooldownTime) _emergencyRepairCooldownTime.textContent = cooldown.toFixed(1) + 's';
      if (_emergencyRepairCooldownIcon) {
        var cdProgress = Math.max(0, Math.min(1, cooldown / EMERGENCY_REPAIR_COOLDOWN));
        _emergencyRepairCooldownIcon.style.background = 'conic-gradient(#ffd447 ' + (cdProgress * 360).toFixed(1) + 'deg, rgba(20,25,20,.92) 0deg)';
      }
    }
  }
}

if (_emergencyRepairButton) {
  _emergencyRepairButton.addEventListener('click', function (e) {
    if (e && e.preventDefault) e.preventDefault();
    emergencyRepairUse(player);
  });
}

/* Compatibility helpers for the flow.js touch layer and diagnostics. */
if (typeof window !== 'undefined') {
  window.emergencyRepairUse = emergencyRepairUse;
  window.emergencyRepairCanUse = emergencyRepairCanUse;
  window.emergencyRepairReset = emergencyRepairReset;
  window.emergencyRepairIsActive = emergencyRepairIsActive;
  window.emergencyRepairHudTick = emergencyRepairHudTick;
  window.emergencyRepairCooldown = EMERGENCY_REPAIR_COOLDOWN;
}
