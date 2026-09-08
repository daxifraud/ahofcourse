/* ============================================================
   模块: flow.js — 流程:会战胜负/兵力/输入处理
   (加载顺序由 index.html MODULES 表决定,勿单独调整)
   ============================================================ */
'use strict';
/* ============================================================
   会战流程
   ============================================================ */
// 出生点空位搜索:大本营周围环形扫描,避开活车 / 残骸(残骸不消除,绝不能叠放)
function findSpawnSpot(hx, hz) {
  var i;
  for (var ring = 0; ring < 9; ring++) {
    for (var k = 0; k < 10; k++) {
      var a = k / 10 * TAU, rr = 2 + ring * 3.5;
      if (rr < 16) continue;                 // 出生点避开营盘(半径14.7)及其下坡,部署在坡外
      var nx = hx + Math.sin(a) * rr, nz = hz + Math.cos(a) * rr;
      var B = CONF.bounds - 6;
      if (nx < -B || nx > B || nz < -B || nz > B) continue;
      var ok = true;
      for (i = 0; i < tanks.length && ok; i++) {
        var w = tanks[i];
        if (Math.hypot(nx - w.group.position.x, nz - w.group.position.z) < w.radius + 3.4) ok = false;
      }
      if (ok) return { x: nx, z: nz };
    }
  }
  return { x: hx, z: hz };                          // 兜底:中心(会被碰撞系统推开)
}
// 在大本营重新部署一辆相同载具 —— 每次消耗 1 点兵力
// 通用化:车型参数全部来自 VEHICLE_KINDS 注册表条目(spawnName 出厂名/aiAnchor 原地锚定),新增型号零改动自动生效
function redeployVehicle(team, kind) {
  var hq = hqFind(team, kind, hqRandWing());          // 兵种定纵深,翼位随机 —— AI 每次从左/中/右三选一涌出
  if (!hq) return;
  var spot = findSpawnSpot(hq.x, hq.z);
  var yaw = hq.yaw + rand(-0.15, 0.15);
  var vk = vehicleKindEntry(kind) || vehicleKindEntry('tank');   // 未知槽位兜底坦克(与旧 else 分支等价)
  var nt = createTank({ kind: vk.kind, team: team, x: spot.x, z: spot.z, yaw: yaw,
    name: (vk.spawnName && (vk.spawnName[team] || vk.spawnName.ally)) || vehicleKindName(team, vk.kind) });
  nt.reload = 0;                                      // 重部署载具初始装填完成(原各分支共有)
  if (vk.aiAnchor) {                                  // 曲射平台(火箭炮):部署后锚定原地,不前压
    nt.ai.anchorX = spot.x; nt.ai.homeZ = spot.z;
    nt.ai.destX = spot.x; nt.ai.destZ = spot.z;
  }
  rebuildTargets();                                   // 新模块网格纳入命中宽相位
  var p = nt.group.position.clone(); p.y += 1.2;
  if (typeof comicGroundDust === 'function') comicGroundDust(p.x, p.y, p.z, false);   // 部署到位的一阵尘土(漫画扬尘卡)
  return nt;
}
// 消耗战结算:处理到期的重新部署;兵力先耗光的一方立即战败
function processRespawns() {
  if (gameState !== 'playing') return;
  for (var i = respawnQueue.length - 1; i >= 0; i--) {
    var rq = respawnQueue[i];
    if (rq.due > gameT) continue;
    respawnQueue.splice(i, 1);
    if (teamPool[rq.team] <= 0) continue;             // 兵力已耗光(败局已定时不再出兵)
    if (countTeam(rq.team) >= BATTLE_SETUP[rq.team].cap) continue;   // 在场已达最大上限:本单作废(不再补员)
    teamPool[rq.team]--;
    redeployVehicle(rq.team, rq.kind);
    // 兵力见底不在此判负:需要 兵力=0 且 场上无存活载具(见 battleCheck);顶部兵力计数恒显,不做文字播报
  }
}

// 判负条件:兵力耗尽 且 场上无存活载具
function teamDefeated(team) {
  // 无"在途增援等待"——兵力=0 时队列条目永不可能出兵(processRespawns 无兵力不部署),
  //   故存活载具归零即判负(若等条目到期,火箭炮条目 due+24s 会造成归零后久不结算),
  // 由 battleCheck 的 2s 宽限倒计时收尾(归零后 3s 内结算完成)
  return teamPool[team] <= 0 && countTeam(team) === 0;
}
var battleEndT = -1;                                // 败局已定后的结算倒计时
function battleCheck() {
  if (gameState !== 'playing' || freePlay) return;   // 继续游玩(freePlay)期间不判胜负
  var pLose = teamDefeated(pSide()), eLose = teamDefeated(eSide());   // 胜/负按玩家队视角
  if (!pLose && !eLose) return;
  if (battleEndT < 0) battleEndT = gameT + 2;        // 条件首次成立 → 2s 宽限(留最后一击爆炸收场,满足 ≤3s 军令)
  if (gameT < battleEndT) return;
  battleEndT = -1;
  if (pLose && eLose) gameOver(true, '同归于尽');
  else if (eLose) gameOver(true);
  else gameOver(false, '弹尽粮绝');
}

function gameOver(win, cause) {
  gameState = 'over';
  if (typeof window !== 'undefined' && window._touchUISync) window._touchUISync();   // 触控层即时收起
  document.exitPointerLock && document.exitPointerLock();
  hideRespawnUI();
  hidePossessOv();
  updateLockHint();
  el.endov.classList.remove('hidden');
  if (el.continuebtn) el.continuebtn.classList.toggle('hidden', !win);   // 仅胜利显示"继续游戏"(失败/弹尽粮绝无此按钮)
  el.allies.textContent = countTeam('ally');
  el.enemies.textContent = countTeam('enemy');
}

/* 旗杆稳定线(远距细杆抗闪烁;机理与修法同载具天线稳定线,见 comic.js):
   杆半径 0.09~0.13m,几十米外宽度小于 1 纹素,光栅化覆盖逐帧跳变=闪烁,描边放大观感;
   全部旗杆并入 ONE LineSegments(GL 线恒 1px 光栅化,任何距离不消失),随场景进 RT
   自然遮挡/受雾;原几何杆近距被自身像素覆盖。静态件:开局登记 6 段,
   弹坑重锚(redrape)单段更新,零逐帧。 */
var _poleSegs = [], _poleLine = null, _poleMat = null;
function poleLineReg(x, y0, z, y1) {             // 登记一根杆,返回段号(redrape 更新用)
  _poleSegs.push(x, y0, z, x, y1, z);
  poleLineSync();
  return _poleSegs.length / 6 - 1;
}
function poleLineSet(i, y0, y1) {                // 弹坑重锚:仅两端高度变化
  var o = i * 6;
  _poleSegs[o + 1] = y0; _poleSegs[o + 4] = y1;
  poleLineSync();
}
function poleLineSync() {                        // 段数 ≤6,整表重建=事件级一次性,成本可忽略
  if (_poleLine) { scene.remove(_poleLine); _poleLine.geometry.dispose(); }
  var pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(_poleSegs), 3));
  if (!_poleMat) _poleMat = new THREE.LineBasicMaterial({ color: 0x6a6a62 });   // 杆身同色
  _poleLine = new THREE.LineSegments(pg, _poleMat);
  _poleLine.frustumCulled = false;
  _poleLine.matrixAutoUpdate = false;
  scene.add(_poleLine);
}
// 大本营:夷平地面 + 高龄旗杆(顶点飘扬军旗)
// ★防穿模:营盘/标线环逐顶点按世界坐标采样 terrainH「披布」贴地;旗杆中心采样并嵌入少许
/* 大本营静态部件(旗杆/顶球)的几何与材质跨全部基地共享:每座各建一份的话,
   18 座 = 72 个材质对象、几十个重复几何,白占显存又拆批。旗面几何必须逐座独立
   (顶点被逐帧改写),但旗面材质只是纯色,按阵营两份即可。待命环材质逐座独立(脉动相位不同)。 */
var _hqGeoCache = null, _hqFlagMat = {};
function hqSharedGeo() {
  if (!_hqGeoCache) _hqGeoCache = {
    pole: new THREE.CylinderGeometry(0.09, 0.13, 14, 8),
    finial: new THREE.SphereGeometry(0.16, 8, 6),
    poleMat: new THREE.MeshStandardMaterial({ color: 0x6a6a62, roughness: 0.55, metalness: 0.35 }),
    finialMat: new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.4, metalness: 0.6 })
  };
  return _hqGeoCache;
}
function buildHQ(team, x, z, yaw, type, wing) {
  var g = new THREE.Group();
  var SG = hqSharedGeo();
  var gy = terrainH(x, z);                             // 夷平后的基准高
  var fc = team === 'ally' ? 0xff6a5a : 0x7ab0ff;                // 旗面/顶球:红蓝对抗标识
  var cyw = Math.cos(yaw), syw = Math.sin(yaw);
  function drape(posA, off) {                          // 顶点:组局部 → 世界采样 → 贴地(+抬升)回写局部 y
    for (var i = 0; i < posA.count; i++) {
      var lx = posA.getX(i), lz = posA.getZ(i);
      var wx = x + lx * cyw + lz * syw, wz = z - lx * syw + lz * cyw;
      posA.setY(i, terrainH(wx, wz) - gy + off);
    }
  }
  /* ===== 14m 高龄旗杆(嵌入 0.4m 锚固) ===== */
  var pole = new THREE.Mesh(SG.pole, SG.poleMat);
  pole.position.set(0, 14 / 2 - 0.4, 0); pole.castShadow = true; g.add(pole);
  var poleIdx = poleLineReg(x, gy - 0.4, z, gy + 13.6);   // 稳定线登记(世界系;redrape 时单段更新)
  var finial = new THREE.Mesh(SG.finial, SG.finialMat);
  finial.position.set(0, 13.68, 0); g.add(finial);
  /* ===== 军旗:顶点波动阔旗(旗杆端静止 → 自由端大摆) ===== */
  var flagW = 2.4;
  var flagGeo = new THREE.PlaneGeometry(flagW * 2, 1.9, 10, 4);
  if (!_hqFlagMat[team]) _hqFlagMat[team] = new THREE.MeshBasicMaterial({ color: fc, side: THREE.DoubleSide });
  var flag = new THREE.Mesh(flagGeo, _hqFlagMat[team]);   // 几何逐座独立(顶点动画),材质按阵营两份
  flag.position.set(flagW + 0.12, 12.55, 0);             // 旗根贴着杆顶
  flag.castShadow = true; g.add(flag);
  /* 营盘/旗杆/待命环保留 */
  /* ===== 待命区标线(直接悬于夷平地面上方 6cm;脉动提示 redeploy 点;随夷平区放大 r7.6~8.5) ===== */
  var ringGeo = new THREE.RingGeometry(7.6, 8.5, 36, 1);
  ringGeo.rotateX(-Math.PI / 2);
  drape(ringGeo.attributes.position, 0.15);
  var ringMat = new THREE.MeshBasicMaterial({ color: fc, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
  var ringM = new THREE.Mesh(ringGeo, ringMat);
  g.add(ringM);
  g.position.set(x, gy, z);
  g.rotation.y = yaw;
  scene.add(g);
  /* ===== 再锚固闭包:弹坑改变地形后全部件跟随新地面 —— 永久零穿模承诺 ===== */
  function redrape() {
    drape(ringGeo.attributes.position, 0.15);
    ringGeo.attributes.position.needsUpdate = true;
    var pb = terrainH(x, z) - gy - 0.4;                  // 杆脚随地形重嵌入 0.4m,顶球/军旗同步
    pole.position.y = pb + 7;
    finial.position.y = pb + 14.08;
    flag.position.y = pb + 12.95;
    poleLineSet(poleIdx, gy + pb, gy + pb + 14);         // 稳定线同步重锚
  }
  hqBoundsAdd(x, z);                                   // 地形保护包围盒扩张(getHQZoneDeformFactor 早退用)
  hqList[team].push({ type: type || 'tank', wing: wing | 0, x: x, z: z, yaw: yaw, flag: flag, ring: ringM, redrape: redrape,
    grp: g, flagGeo: flagGeo, ringGeo: ringGeo, ringMat: ringMat,
    flagBase: Float32Array.from(flagGeo.attributes.position.array), flagW: flagW, phase: ((x * 0.37 + z * 0.11) % TAU + TAU) % TAU });
}

/* 兵种 → 大本营类型映射: 火箭炮=炮兵大本营, ah64/wz10=直升机大本营, 其余(坦克/歼击车/99/自定义蓝图)归坦克大本营 */
function hqTypeOfKind(kind) {
  if (kind === 'arty') return 'arty';
  if (kind === 'ah64' || kind === 'wz10') return 'heli';
  return 'tank';
}

function spawnTeams() {
  var i, x, z, r, c;
  _poleSegs = [];                                        // 旗杆稳定线换场重建(旧线撤除,buildHQ 逐根重登记)
  if (_poleLine) { scene.remove(_poleLine); _poleLine.geometry.dispose(); _poleLine = null; }
  // 横向与纵向布局按战场尺寸适配
  var kW = (MAP.wid || MAP.side) / 2000;
  var kL = (MAP.len || MAP.side) / 2000;
  var boundsX = (CONF.boundsX != null ? CONF.boundsX : CONF.bounds);
  var boundsZ = (CONF.boundsZ != null ? CONF.boundsZ : CONF.bounds);
  // 半场翻转(两个独立来源叠乘):__TEAM_FLIP(调试/公平随机)× startSide(菜单选边=蓝方时双方互换半场,玩家恒在南侧大本营)
  var flip = ((typeof window !== 'undefined' && window.__TEAM_FLIP) ? -1 : 1) * (startSide === 'enemy' ? -1 : 1);
  spawnFlip = flip;                                    // 登记:AI 回防/集结默认 homeZ 等读取
  if (typeof sqbBattleReset === 'function') sqbBattleReset();   // 小队标识:洗牌型号代表色(对局仅此一次)+复位开关/图集
  if (typeof iffBattleReset === 'function') iffBattleReset();   // 敌我标识:换场关箭头
  if (typeof heliABGClear === 'function') heliABGClear();       // A射B导:换场清空僚机名单(旧载具即将销毁,不跨局残留)
  if (typeof tacGridBuild === 'function') tacGridBuild();       // 战术射界网格:建场一次评分(~20ms),指挥官决策期消费
  var noPlayer = (typeof window !== 'undefined' && window.__TANK_DEBUG && window.__DBG_NO_PLAYER); // 无头纯净 AI 对局
  var aYaw = flip > 0 ? Math.PI : 0, eYaw = flip > 0 ? 0 : Math.PI;
  // 三兵种纵深(坦克/炮兵/直升机): 距地图中心可配置距离;上限=长度一半,落位再贴进活动边界 15m
  function baseZOf(dist) {
    var d = clamp(Math.round(+dist || 0), 0, MAP.halfL || MAP.half);
    return Math.min(d, boundsZ - 15) * flip;   // flip>0 时本方(ally)在 +z 半场,敌方取负镜像
  }
  var baseZ = { tank: baseZOf(startBaseDist.tank), arty: baseZOf(startBaseDist.arty), heli: baseZOf(startBaseDist.heli) };
  /* 行纵深助手: 基地贴边时(纵深偏移越出活动边界)向战场内侧镜像, 防止多行被边界钳制塌缩到同一 z */
  function rowZOut(zBase, hs, off) {
    var z = zBase + hs * off;
    return (Math.abs(z) > boundsZ - 16) ? (zBase - hs * off) : z;
  }
  // 玩家出生 = 所选兵种对应的大本营中心
  var pKind = vehicleKindAllowed(startSide, startKind) ? startKind : 'tank';
  var pZ0 = (startSide === 'ally' ? baseZ[hqTypeOfKind(pKind)] : -baseZ[hqTypeOfKind(pKind)]), pYaw0 = startSide === 'ally' ? aYaw : eYaw;
  player = createTank({ isPlayer: !noPlayer, team: startSide, x: 0, z: pZ0, yaw: pYaw0,
    kind: pKind === 'tank' ? undefined : pKind,
    name: noPlayer ? (startSide === 'ally' ? '59式' : 'M60A1') : '你' });
  respawnSel.kind = pKind;                               // 阵亡重生默认沿用开局兵种
  respawnSel.wing = HQ_WING_CENTER;                      // 翼位复位到中央(开局落位即中轴;防跨局/上一条命的旧索引残留)
  playerEquipSync();                                     // 部署边沿:座车夜战设备缓存+触控键显隐(禁逐帧检测)
  player.reload = 0;

  camAimY = player.yaw + player.turretYaw; camAimP = player.gunPitch;   // 首刷:相机瞄向=炮口向
  // 遭遇战编制(红/蓝独立;通用化:型号数量遍历 VEHICLE_KINDS 注册表)
  var SU = BATTLE_SETUP, aR = SU.ally.roster, eR = SU.enemy.roster;
  // 战线编队:2 排均布,列数随坦克数量自适应(槽不足自动扩展;±330*kW 铺满战场宽度)
  function lineSlots(zBase, nTank) {
    var hs = Math.sign(zBase) || 1, slots = [], cols = Math.max(1, Math.ceil(nTank / 2));
    for (var r = 0; r < 2; r++) for (var c = 0; c < cols; c++)
      slots.push([-330 * kW + (cols > 1 ? c * (660 * kW / (cols - 1)) : 0), zBase + hs * r * 20]);
    return slots;
  }
  var grid = lineSlots(baseZ.tank, aR.tank + (aR['99'] || 0));   // 坦克大本营战线
  // 锋线最中央一格空给玩家(只剔离 (0,baseZ.tank) 最近的那一格,其余 = 我方坦克数-1 辆 AI)
  var ci = 0;
  for (i = 1; i < grid.length; i++)
    if (Math.abs(grid[i][0]) + Math.abs(grid[i][1] - baseZ.tank) <
        Math.abs(grid[ci][0]) + Math.abs(grid[ci][1] - baseZ.tank)) ci = i;
  grid.splice(ci, 1);
  var a59N = aR.tank - (pKind === '99' ? 0 : 1);
  var a99N = (aR['99'] || 0) - (pKind === '99' ? 1 : 0);
  for (i = 0; i < grid.length && (a59N > 0 || a99N > 0); i++) {
    var use99 = a59N <= 0 || (a99N > 0 && i % 2 === 1);
    if (use99) a99N--; else a59N--;
    x = clamp(grid[i][0] + rand(-4, 4), -boundsX + 16, boundsX - 16);
    z = clamp(grid[i][1] + rand(-2, 2), -boundsZ + 16, boundsZ - 16);
    var at = createTank({ isPlayer: false, team: 'ally', x: x, z: z, yaw: aYaw + rand(-0.12, 0.12),
      kind: use99 ? '99' : undefined,
      struct: CONF.ally.struct, name: use99 ? '99式' : '59式' });
    at.reload = 0;
  }
  var egrid = lineSlots(-baseZ.tank, eR.tank + (eR['99'] || 0));   // 敌方坦克大本营(镜像)
  var e59N = eR.tank, e99N = eR['99'] || 0;
  for (i = 0; i < egrid.length && (e59N > 0 || e99N > 0); i++) {
    var euse99 = e59N <= 0 || (e99N > 0 && i % 2 === 1);
    if (euse99) e99N--; else e59N--;
    x = clamp(egrid[i][0] + rand(-4, 4), -boundsX + 16, boundsX - 16);
    z = clamp(egrid[i][1] + rand(-2, 2), -boundsZ + 16, boundsZ - 16);
    var et = createTank({ isPlayer: false, team: 'enemy', x: x, z: z, yaw: eYaw + rand(-0.12, 0.12),
      kind: euse99 ? '99' : undefined,
      struct: CONF.enemy.struct, name: euse99 ? '99式' : 'M60A1' });
    et.reload = 0;
  }
  // 特殊装甲编制:红方=89式 / 蓝方=M1A1
  ['ally', 'enemy'].forEach(function (tm) {
    var R = tm === 'ally' ? aR : eR;
    var zB2 = tm === 'ally' ? baseZ.tank : -baseZ.tank;
    var hs2 = Math.sign(zB2) || 1;
    var yaw2 = tm === 'ally' ? aYaw : eYaw;
    for (var i3 = 0; i3 < R.td; i3++) {
      var tx = clamp(-330 * kW + (R.td > 1 ? i3 * (660 * kW / (R.td - 1)) : 0) + rand(-3, 3), -boundsX + 16, boundsX - 16);
      var tz = clamp(rowZOut(zB2, hs2, 44) + rand(-2, 2), -boundsZ + 16, boundsZ - 16);
      var td = createTank({ kind: 'td', team: tm, x: tx, z: tz, yaw: yaw2 + rand(-0.1, 0.1),
        name: tm === 'ally' ? 'PTZ-89' : 'M1A1' });
      td.reload = 0;
    }
  });
  // 火箭炮载具
  ['ally', 'enemy'].forEach(function (tm) {
    var R = tm === 'ally' ? aR : eR;
    var zBase = tm === 'ally' ? baseZ.arty : -baseZ.arty;
    var hs = Math.sign(zBase) || 1;
    for (var i2 = 0; i2 < R.arty; i2++) {
      var ax = clamp((i2 - (R.arty - 1) / 2) * 70 * kW + rand(-6, 6), -boundsX + 16, boundsX - 16);
      var az = clamp(rowZOut(zBase, hs, 47) + rand(-7, 7), -boundsZ + 16, boundsZ - 16);
      var art = createTank({ kind: 'arty', team: tm, x: ax, z: az, yaw: tm === 'ally' ? aYaw : eYaw,
        name: '火箭炮' });
      art.reload = 0;
      art.ai.anchorX = ax; art.ai.homeZ = az;
      art.ai.destX = ax; art.ai.destZ = az;
    }
  });
  // 双方直升机编制
  ['ally', 'enemy'].forEach(function (tm) {
    var R = tm === 'ally' ? aR : eR, hk = tm === 'ally' ? 'wz10' : 'ah64';
    var zBase = tm === 'ally' ? baseZ.heli : -baseZ.heli, hs = Math.sign(zBase) || 1, yawH = tm === 'ally' ? aYaw : eYaw;
    var isPlayerKind = (startSide === tm && pKind === hk);
    var nFull = Math.max(0, R[hk] || 0);
    if (nFull <= 0) return;
    var slots = [];
    for (var ih = 0; ih < nFull; ih++) {
      slots.push([clamp((nFull > 1 ? (ih - (nFull - 1) / 2) * 60 * kW : 0) + rand(-4, 4), -boundsX + 16, boundsX - 16),
                  clamp(rowZOut(zBase, -hs, 60 + Math.floor(ih / 6) * 16) + rand(-2, 2), -boundsZ + 16, boundsZ - 16)]);
    }
    if (isPlayerKind) {
      var pci = 0;
      for (var pi = 1; pi < slots.length; pi++)
        if (Math.abs(slots[pi][0]) + Math.abs(slots[pi][1] - pZ0) < Math.abs(slots[pci][0]) + Math.abs(slots[pci][1] - pZ0)) pci = pi;
      slots.splice(pci, 1);
    }
    for (var si2 = 0; si2 < slots.length; si2++) {
      var heli = createTank({ kind: hk, team: tm, x: slots[si2][0], z: slots[si2][1], yaw: yawH + rand(-.1, .1) });
      heli.reload = 0;
    }
  });
  // 兵力池与重生队列复位
  var spA = (typeof window !== 'undefined' && window.__START_POOL) || SU.ally.pool;
  var spE = (typeof window !== 'undefined' && window.__START_POOL) || SU.enemy.pool;
  teamPool.ally = spA; teamPool.enemy = spE;
  respawnQueue.length = 0;
  // 双方大本营: 左/中/右 翼位横向均布 (按 kW 缩放并受边界保护)
  var maxSpread = Math.min(HQ_WING_SPREAD * kW, (boundsX - 40) / 1.1);
  var hqWingDX = [-maxSpread, 0, maxSpread];
  [['tank', baseZ.tank], ['arty', baseZ.arty], ['heli', baseZ.heli]].forEach(function (b) {
    for (var w = 0; w < HQ_WINGS.length; w++) {
      var wx = hqWingDX[w] * flip;
      buildHQ('ally', wx, b[1], aYaw, b[0], w);
      buildHQ('enemy', -wx, -b[1], eYaw, b[0], w);
    }
  });
  rebuildTargets();
}

function clearBattleEntities() {
  try { document.exitPointerLock && document.exitPointerLock(); } catch (e0) {}
  try { if (typeof gameState !== 'undefined') gameState = 'menu'; } catch (e1) {}
  try { freePlay = false; } catch (e2) {}
  try { respawnT = 0; } catch (e3) {}
  try { respawnUiOpen = false; } catch (e4) {}
  try { possessUiOpen = false; } catch (e5) {}
  try { battleEndT = -1; } catch (eBE) {}
  /* 载具/残骸拆场:先置死再摘除。★置死是根治「幽灵车」的关键——大量按帧过滤
     (弃车观察 abandonTick / 发动机烟 _csmRefreshVisible / 燃烧车 _comicBurnSync /
      接管补员 cmdAssign 等)都以 t.alive 为闸;只 scene.remove 不置死,旧车会继续
     开火/冒烟/弃车/入格,把上一局整场带进下一局。 */
  function rmGroup(tk) {
    if (!tk) return;
    try { tk.alive = false; tk._abandon = null; tk._cmdG = null; tk._csmRegistered = false; } catch (eF) {}
    if (!tk.group || tk._battleCleared) return;
    tk._battleCleared = true;
    try { if (tk._occMesh) { if (tk._occMesh.geometry && tk._occMesh.geometry.dispose) tk._occMesh.geometry.dispose(); tk._occMesh = null; } } catch (eO) {}
    try { if (typeof scene !== 'undefined' && scene) scene.remove(tk.group); } catch (eR) {}
  }
  try {
    if (typeof tanks !== 'undefined' && tanks) {
      for (var i = 0; i < tanks.length; i++) rmGroup(tanks[i]);
      tanks.length = 0;
    }
  } catch (eT) {}
  try {
    if (typeof wreckList !== 'undefined' && wreckList) {
      for (var w = 0; w < wreckList.length; w++) rmGroup(wreckList[w]);
      wreckList.length = 0;
    }
  } catch (eW) {}
  /* ★修复(返回车库/再开局): 对局级注册表全清。
     旧版只清 tanks/wreckList/shells, 漏了活车紧凑表 aliveList —— AI 主循环
     (main.js aliveList.forEach)/实例化/命中网格/小地图全部吃这张表, 旧对局的车
     以「幽灵」形式存活: 返回车库后看似退出, 再次开局时两场对局同时打(旧车继续
     开火/占小地图/吃命中网格)。同族漏网一并清:
     · teamCounts  在场计数(增援触发器口径, 跨局虚高会误触发)
     · targetsList 命中候选表(clearTargets)
     · hqList      大本营登记表 + 场景对象(旧版只清数组, 旗杆/军旗/待命环留在场景里每局叠加)
     · 命中网格    静态表(旧残骸遮挡代理, 不可见但挡 LOS/弹道/测距) + 动态表 rebuildHitGrid
     · 残骸合批几何 wckClear / 空间网格 wreckGrid / 碰撞网格 collGridReset
     · 小队指挥/A射B导名单(sqCmdReset/heliABGClear; startGame 侧已有, 拆场侧补齐) */
  try { if (typeof aliveList !== 'undefined' && aliveList) aliveList.length = 0; } catch (eA) {}
  try { if (typeof teamCounts !== 'undefined' && teamCounts) { teamCounts.ally = 0; teamCounts.enemy = 0; } } catch (eC) {}
  try { if (typeof clearTargets === 'function') clearTargets(); } catch (eT2) {}
  try {
    if (typeof hqList !== 'undefined' && hqList) {
      ['ally', 'enemy'].forEach(function (tm) {
        var hArr = hqList[tm]; if (!hArr) return;
        for (var h = 0; h < hArr.length; h++) {
          var hq = hArr[h];
          if (hq.grp && typeof scene !== 'undefined' && scene) scene.remove(hq.grp);
          if (hq.flagGeo && hq.flagGeo.dispose) hq.flagGeo.dispose();
          if (hq.ringGeo && hq.ringGeo.dispose) hq.ringGeo.dispose();
          if (hq.ringMat && hq.ringMat.dispose) hq.ringMat.dispose();
        }
        hArr.length = 0;
      });
    }
  } catch (eH2) {}
  try { if (typeof _poleSegs !== 'undefined') _poleSegs.length = 0; } catch (eP0) {}
  try {
    if (typeof _poleLine !== 'undefined' && _poleLine) {
      if (typeof scene !== 'undefined' && scene) scene.remove(_poleLine);
      if (_poleLine.geometry && _poleLine.geometry.dispose) _poleLine.geometry.dispose();
      _poleLine = null;
    }
  } catch (eP1) {}
  try { if (typeof hitGridStatic !== 'undefined' && hitGridStatic) hitGridStatic.clear(); } catch (eHS) {}
  try { if (typeof hitGridStaticVersion !== 'undefined') hitGridStaticVersion++; } catch (eHV) {}
  try { if (typeof hitGridDynamic !== 'undefined' && hitGridDynamic) hitGridDynamic.clear(); } catch (eHD) {}
  try { if (typeof rebuildHitGrid === 'function') rebuildHitGrid(); } catch (eG2) {}
  try { if (typeof wckClear === 'function') wckClear(); } catch (eWK) {}
  try { if (typeof wreckGrid !== 'undefined' && wreckGrid) wreckGrid.clear(); } catch (eWG) {}
  try { if (typeof collGridReset === 'function') collGridReset(); } catch (eCG) {}
  try { if (typeof _wreckMoveQueue !== 'undefined' && _wreckMoveQueue) _wreckMoveQueue.length = 0; } catch (eWM) {}
  try { if (typeof sqCmdReset === 'function') sqCmdReset(); } catch (eS2) {}
  try { if (typeof heliABGClear === 'function') heliABGClear(); } catch (eB2) {}
  try { player = null; } catch (eP) {}
  try {
    if (typeof shells !== 'undefined' && shells) {
      for (var s = shells.length - 1; s >= 0; s--) {
        if (shells[s] && shells[s].mesh && typeof scene !== 'undefined') scene.remove(shells[s].mesh);
      }
      shells.length = 0;
    }
  } catch (eS) {}
  try { if (typeof airborneMissiles !== 'undefined') airborneMissiles.length = 0; } catch (eM) {}
  try { if (typeof airborneGuidedRockets !== 'undefined') airborneGuidedRockets.length = 0; } catch (eG) {}
  try { if (typeof respawnQueue !== 'undefined') respawnQueue.length = 0; } catch (eQ) {}
  /* 跨局残留状态全清:待生效弹坑 / 空中坠机残骸 / 弃车观察 / 火箭落点预报 / AI 指挥官账本 */
  try { if (typeof craterQueue !== 'undefined' && craterQueue) craterQueue.length = 0; } catch (eCQ) {}
  try { if (typeof heliFallingWrecks !== 'undefined' && heliFallingWrecks) heliFallingWrecks.length = 0; } catch (eHF) {}
  try { if (typeof abandonWatch !== 'undefined' && abandonWatch) abandonWatch.length = 0; } catch (eAW) {}
  try { if (typeof rocketThreats !== 'undefined' && rocketThreats) rocketThreats.length = 0; } catch (eRT) {}
  try { if (typeof rocketThreatGrid !== 'undefined' && rocketThreatGrid) rocketThreatGrid.clear(); } catch (eRG) {}
  try { if (typeof recentBursts !== 'undefined' && recentBursts) recentBursts.length = 0; } catch (eRB) {}
  try { if (typeof evadeLog !== 'undefined' && evadeLog) evadeLog.length = 0; } catch (eEL) {}
  try { if (typeof aimAudit !== 'undefined' && aimAudit) aimAudit.length = 0; } catch (eAA) {}
  try { if (typeof commanders !== 'undefined' && commanders) { for (var ck in commanders) delete commanders[ck]; } } catch (eCM) {}
  try { kills = 0; playerRespawns = 0; wreckCount = 0; } catch (eK) {}
  /* 漫画/余烬等模块级对局特效登记表全清(黑烟柱/燃烧车/火箭弹道线/发动机烟/余烬火星) */
  try { if (typeof wreckSmokeClear === 'function') wreckSmokeClear(); } catch (eWS) {}
  try { if (typeof comicBattleClear === 'function') comicBattleClear(); } catch (eCB) {}
  try { if (typeof fxBattleClear === 'function') fxBattleClear(); } catch (eEC) {}
  try {
    if (typeof el !== 'undefined' && el) {
      if (el.hud) el.hud.classList.add('hidden');
      if (el.pauseov) el.pauseov.classList.add('hidden');
      if (el.endov) el.endov.classList.add('hidden');
      if (el.respawnov) el.respawnov.classList.add('hidden');
      if (el.possessov) el.possessov.classList.add('hidden');
    }
  } catch (eU) {}
  try { if (typeof RSP !== 'undefined') RSP.phase = 'idle'; } catch (ePh) {}
}
window.clearBattleEntities = clearBattleEntities;

function startGame() {
  if (typeof stopMenuBgm === 'function') stopMenuBgm();
  if (typeof Hangar3D !== 'undefined' && Hangar3D.pause) Hangar3D.pause();
  initAudio();
  if (typeof validateVehicleRegistry === 'function') validateVehicleRegistry();   // 载具注册表启动自检(缺失项告警+已兜底,不中断)
  if (typeof sqCmdReset === 'function') sqCmdReset();               // 小队指挥状态重置(跨局防残留引用)
  if (typeof initBallisticsDB === 'function') initBallisticsDB();   // 弹道数据库开局预计算一次(代表散布圈 + 交火底线缓存全组合预热)
  if (typeof window.clearBattleEntities === 'function') window.clearBattleEntities();
  setupMapWorld(startSeed, startRough, startMapLen, startMat, startMapWid); spawnTeams(); applyTimeOfDay(startHour);   // 每局重建世界,禁止沿用上一局 player
  gameState = 'playing';
  window._pointerPauseArmed = false;
  startT = gameT;
  el.hud.classList.remove('hidden');
  if (typeof window !== 'undefined' && window._touchUISync) window._touchUISync();   // 触控层第一时间显示(事件直挂)
  el.startov.classList.add('hidden');
  el.pauseov.classList.add('hidden');
  updateLockHint();
  initAimBaseline();                                  // ★进局即把兼容模式差分基准回中(旧值可能来自上一局,会造成首帧甩头)
  lockAvailable = true;                                // ★新对局重置锁定可用性(上一局的拒绝不该影响本局)
  if (!pointerLocked) attemptLock();                   // 手势内(出击/继续按钮)重取指针锁定
  snapCamera();
}

/* ============================================================
   输入处理
   ============================================================ */
var aimPX = 640, aimPY = 360;               // 兼容模式差分基准(锁定时按 movement 增量估计;不再作为瞄准目标——黄点已钉死屏心)
var aimChaseOn = true;                        // 炮口追视野开关:按下任一方向键暂停,移动任一鼠标恢复
var aimSensMul = 1;                           // 瞄准灵敏度乘数(设置页滑条 0~10 → ×1~×10;鼠标/触屏同吃)
/* 炮镜开关(Shift 键/触屏双指缩放跨越 1× 共用单一实现)。
   退出炮镜时先把第三人称的瞄准基准对齐到当前相机方位:
   若直接切换 scopeMode,下一次瞄准增量会立即修改 camAimY,而 cameraUpdate 仍处于
   scopeT 的过渡阶段,导致 _camYaw 与 camAimY 不一致,出现一次明显的视角跳变。 */
function scopeToggle() {
  if (scopeMode && player && player._camYaw != null) {
    camAimY = player._camYaw;
  }
  scopeMode = !scopeMode;
  if (!scopeMode && player) {
    /* 退出时立即结束炮镜插值状态。继续让 scopeT 在约一秒内衰减,
       会使相机位置和 lookAt 目标同时依赖新瞄准方向,造成输入相关的
       非线性跳变。相机位置本身仍通过 cameraUpdate 的阻尼平滑回到
       第三人称,因此不会产生硬切镜头。 */
    player._camYaw = camAimY;
    scopeT = 0;
    scoped = false;
    scopeTick = 0;
  }
  if (typeof comicMotionSmokeInvalidate === 'function') comicMotionSmokeInvalidate(); // 开/关镜触发烟尘可见表立即重建
}
/* 瞄准增量入口(鼠标 movement/触屏滑动共用单一实现):灵敏度/倍率手感补偿/火箭炮装定分支。 */
/* ★★BUGFIX(进局后转向角度受限,须点一次左键才解锁)★★
   原因:本作的视野是 FPS 式「吃无限增量」(camAimY 不钳位),只有指针锁定才拿得到无限增量;
        requestPointerLock 又只能在「用户手势」里成功 —— 而全工程只有左键 mousedown 与
        暂停/结算/接管/重生 这几处会 attemptLock()。出击后若那一次锁定请求被拒/被吞
        (沙箱 iframe 无 allow-pointer-lock、或同一手势里先 exitPointerLock 再重锁被拒),
        就停在「兼容模式」:dxC = clientX − 上一帧 aimPX,而 aimPX 被 clamp(0, innerWidth)
        → 一次划屏最多转 innerWidth×0.0025 rad(1920px≈275°、1000px 窗口≈143°),
        光标顶到窗口边缘后 mousemove 直接不再派发 → 该方向彻底转不动。
        点左键 = 第一次带手势的 attemptLock() → 锁上后无限增量,角度「解锁」。
   修法:①增量统一走 aimInputStep(),锁定态不再被屏宽钳位;
        ②进局/重生/接管/锁定态切换时把差分基准回中(initAimBaseline),消除首帧甩动;
        ③watchdog 在「对局中且未锁定」时按冷却自动重试锁定(不依赖玩家先点左键)。 */
function initAimBaseline() {                                            // 差分基准回屏心(与 combat.js 重生/接管处同一写法)
  aimPX = innerWidth * 0.5; aimPY = innerHeight * 0.5;
}
/* 把一次鼠标事件换算成 (dx, dy, 新基准)。纯函数、无副作用 → 可被回归测试直接调用。
   locked=true : 用 movementX/Y 无限增量,基准仅用于显示(钳在屏内),不限制累计量
   locked=false: 用 clientX/Y 差分;基准钳在屏内,但「增量」取自未被钳的累计位 →
                 光标顶到边缘时不会把反向第一帧变成巨大跳变(仍受浏览器不派发越界事件的物理限制,
                 故必须配合 watchdog 重试锁定) */
function aimInputStep(ev, locked, baseX, baseY, vw, vh) {
  var dxC, dyC;
  if (locked && typeof ev.movementX === 'number') {
    dxC = ev.movementX; dyC = ev.movementY || 0;
    return { dx: dxC, dy: dyC, bx: clamp(baseX + dxC, 0, vw), by: clamp(baseY + dyC, 0, vh) };
  }
  if (typeof ev.clientX === 'number' && typeof ev.clientY === 'number') {
    var nx = clamp(baseX + (ev.clientX - baseX), 0, vw);                 // 基准=屏内光标位
    dxC = ev.clientX - baseX; dyC = (ev.clientY - baseY);
    return { dx: dxC, dy: dyC, bx: nx, by: clamp(baseY + dyC, 0, vh) };
  }
  dxC = ev.movementX || 0; dyC = ev.movementY || 0;
  return { dx: dxC, dy: dyC, bx: clamp(baseX + dxC, 0, vw), by: clamp(baseY + dyC, 0, vh) };
}
var _lockTry = 0, _lockTryAt = -9e9, _lockHardDenied = false;             // watchdog 自限流状态
function aimPointerLockWatchdog(nowSec) {                                 // 由 interval 调用;常态=1 个时间比较
  nowSec = (typeof nowSec === 'number') ? nowSec : (typeof gameT === 'number' ? gameT : Date.now() / 1000);
  if (nowSec - _lockTryAt < 2.0) return;                                  // 自限流:至少隔 2s 才可能再发一次
  if (typeof gameState === 'undefined' || gameState !== 'playing') return;
  if (typeof player === 'undefined' || !player || !player.alive) return;
  if (typeof respawnUiOpen !== 'undefined' && respawnUiOpen) return;
  if (typeof possessUiOpen !== 'undefined' && possessUiOpen) return;
  if (typeof pointerLocked !== 'undefined' && pointerLocked) { _lockTry = 0; _lockHardDenied = false; return; }
  if (typeof lockAvailable !== 'undefined' && !lockAvailable) return;    // 浏览器冷却期交给下一次 tick
  if (_lockHardDenied && _lockTry >= 8) return;                           // 从未锁上过 + 连拒 8 次=环境真不支持 → 停手,左键手势仍可重试
  _lockTry++; _lockTryAt = nowSec;
  if (!window._pointerPauseArmed) _lockHardDenied = true;                 // 一次都没成功过 → 按「硬性拒绝」保守计次
  attemptLock();
}
function aimApplyDelta(dxC, dyC) {
  aimChaseOn = true;                                            // 有瞄准输入 = 恢复准星追逐
  dxC *= aimSensMul; dyC *= aimSensMul;                         // 灵敏度乘数(设置页滑条;默认 ×1)
  var sf = 1 - 0.65 * scopeT;
  // 炮镜倍率手感补偿——准星屏幕移动量在不同倍率下与默认(1×)完全一致。
  //   原理:准星屏幕位移 ∝ 视角转动角度 × (屏幕高度/2tan(fov/2));倍率放大→fov 收窄→
  //   同角度在屏幕上位移更大,故灵敏度须乘 tan(fov/2)/tan(14°)(1×=1,20×≈0.049),
  //   使 输入像素→准星像素 的映射与倍率无关(=默认倍率手感)。
  var zoomF = 1;
  if (scopeT > 0.001) {
    var fovCur = scopeFov(scopeZoom, scopeT);   // 与 cameraUpdate 同公式(平滑过渡)
    zoomF = Math.tan(fovCur * Math.PI / 360) / Math.tan(14 * Math.PI / 180);
  }
  // 火箭炮开镜齐射中:瞄准与装定全部冻结(AI 齐射同样锁瞄),保证 16 发落在同一指示点
  if (player.kind === 'arty' && scopeT > 0.5 && player.salvoLeft > 0) return;
  if (player.kind === 'arty' && scopeT > 0.5) {
    // 纵横全部直驱视角(与坦克/歼击车同准则)——装定通道下注视点恒钉死镜心,距离变化只产生
    //   ~0.01° 级视角旋转+微缩放,场景视觉位移趋零,系数怎么调都"很慢";现直驱视角俯仰,场景随视角扫屏
    camAimY -= dxC * 0.0025 * sf * zoomF;
    // 再减速 20%(0.0015→0.0012)——俯仰存在几何放大(俯仰→装定距离→相机高度联动,
    //   典型射程处屏上位移≈角增量×1.5~1.8,横向纯偏航无此放大),纵向系数按放大折算保持与水平感知同速
    artyPitch = clamp(artyPitch - dyC * 0.0012 * sf * zoomF, -0.8, -0.001);
    return;
  }
  // 坦克/歼击车炮镜 = FPS 式视野:瞄具(镜框+十字丝)钉屏幕中心,视野直接吃输入增量(不反向);
  // 主循环里真炮口按载具实际炮塔速度追踪跟随这个瞄具方向。
  camAimY -= dxC * 0.0025 * sf * zoomF;                        // 视野随输入增量(原 FPS 手感,不反向)
  /* 火箭炮第三人称开放完整 -0.14~1.05rad 发射架俯仰;只有真正进入炮镜后才用 0.05rad 视场上限。
     旧表达式按 kind 无条件钳 0.05,使第三人称炮架最多抬约 2.9°。 */
  camAimP = playerAimPitchClamp(player, camAimP - dyC * 0.002 * sf * zoomF, scopeT > 0.5);
}
/* ===== 指挥模式指令落点解算与入口(Z/X 键与触控占领/跟随键共用) ----
   占领点=屏心黄点视轴的地面/车体落点(laserRange 宽相位射线,事件级一次解算,零逐帧);
   无落点(朝天/超 2000m)发战斗提示不落令。非指挥态=空操作(键位无冲突面)。 ===== */
var _sqOrdV = null;
function sqCmdOrderOccupyAtCursor() {
  if (typeof sqCmd === 'undefined' || !sqCmd.active || !camera || !player || !player.alive) return;
  if (!_sqOrdV) _sqOrdV = new THREE.Vector3();
  camera.getWorldDirection(_sqOrdV);
  var d = laserRange(camera.position, _sqOrdV);
  if (!isFinite(d) || d < 8 || d > 1990) { if (typeof aimHint === 'function') aimHint('无法标定落点'); return; }
  sqCmdOrderSet('occupy', camera.position.x + _sqOrdV.x * d, camera.position.z + _sqOrdV.z * d);
}
function initInput() {

  addEventListener('keydown', function (e) {
    keys[e.code] = true;
    if (e.code === 'Backspace' && !e.repeat && !(e.target && e.target.tagName === 'INPUT')) {   // 指挥模式键(输入框退格不劫持):小队标识与指挥模式联动同步开关
      e.preventDefault();                                 // 阻止浏览器后退等默认行为
      if (gameState === 'playing' && player && player.alive) {
        // 直升机座舱: Backspace = A射B导(借用最近友机导弹); 地面载具: 仍是小队指挥(sqbSyncToCmd 同步开关小队标识)
        if (isHeliVehicle(player) && typeof heliABGToggle === 'function') heliABGToggle();
        else if (typeof sqCmdToggle === 'function') sqCmdToggle();
      }
    }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].indexOf(e.code) >= 0) {   // 方向键不再控炮塔,仅 WASD 用于车体移动
      if (!e.repeat) {                                    // 仅“新按下”暂停:浏览器对按住键 ~30Hz 自动连发 keydown,
        aimChaseOn = false;                               // 若连发也算,鼠标一停追逐就被永久关闭(开镜细调/挪车必死)
        if (player && player.alive) player.turretYawDelta = 0;   // 并冲掉追逐尾量,炮塔立即停稳
        if (gameState === 'playing' && player && player.alive && (e.code === 'KeyW' || e.code === 'KeyS') &&
            typeof playerImmobile === 'function' && playerImmobile() &&
            typeof aimHint === 'function') aimHint('不可移动');   // 键盘按下沿同款提示(桌面对齐)
      }
    }
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) scopeToggle();   // 按一次开镜,再按一次关镜(实现见 scopeToggle,触屏缩放共用)
    if (e.code === 'KeyN' && !e.repeat && playerHasNV && player && player.alive) {  // 任意小时任意视角开/关;设备门=座车装备缓存(59式无)
      nvOn = !nvOn; nvSync();                                 // 开/关夜视仪(生效态=nvActive;阵亡/换装自动复原)
    }
    if (e.code === 'KeyH' && !e.repeat && playerHasTH && player && player.alive) {  // 任意视角开/关热成像(与夜视互斥;设备门=99式/M1A1)
      thermalOn = !thermalOn; thermalSync();
    }
    if (e.code === 'KeyT' && !e.repeat && !(e.target && e.target.tagName === 'INPUT')) {  // 敌我标识
      if (gameState === 'playing') { e.preventDefault(); if (typeof iffToggle === 'function') iffToggle(); }
    }
    if (e.code === 'KeyZ' && !e.repeat && typeof sqCmdOrderOccupyAtCursor === 'function') sqCmdOrderOccupyAtCursor();   // 指挥模式:占领 (Z键)
    if (e.code === 'KeyX' && !e.repeat && typeof sqCmdOrderSet === 'function' && sqCmd.active) sqCmdOrderSet('follow', 0, 0);   // 指挥模式:跟随 (X键)
    // 直升机 1 / 2 / 3 切换武器(1=导弹[默认], 2=火箭弹, 3=机炮);火控雷达自动常亮,无手动开关键
    if (gameState === 'playing' && player && player.alive && isHeliVehicle(player)) {
      if ((e.code === 'Digit1' || e.code === 'Numpad1') && !e.repeat) {   // 1号位=导弹(内部3)
        player._heliWeapon = 3;
        if (typeof camAimP !== 'undefined') camAimP = playerAimPitchClamp(player, camAimP, scopeT > 0.5);
        if (typeof aimHint === 'function') aimHint('武器 [1]：导弹');
      } else if ((e.code === 'Digit2' || e.code === 'Numpad2') && !e.repeat) {
        player._heliWeapon = 2;
        if (typeof camAimP !== 'undefined') camAimP = playerAimPitchClamp(player, camAimP, scopeT > 0.5);
        if (typeof aimHint === 'function') aimHint('武器 [2]：火箭弹');
      } else if ((e.code === 'Digit3' || e.code === 'Numpad3') && !e.repeat) {   // 3号位=机炮(内部1)
        player._heliWeapon = 1;
        if (typeof camAimP !== 'undefined') camAimP = playerAimPitchClamp(player, camAimP, scopeT > 0.5);
        if (typeof aimHint === 'function') aimHint('武器 [3]：机炮');
      }
    }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].indexOf(e.code) >= 0) e.preventDefault();
    if (e.code === 'Space' && player && isHeliVehicle(player)) {   // 直升机总距上行;CTRL 交还浏览器,不拦截
      e.preventDefault();
    }
  });
  addEventListener('keyup', function (e) {
    keys[e.code] = false;
    if (e.code.indexOf('Control') >= 0) keys.Control = false;
  });
  // 失焦(ALT+TAB/系统弹窗/切换窗口)会吞掉 keyup 造成 Ctrl/Shift 等卡键——
  // 表现为回来后滚轮一直按 isCtrl=10 倍步进走。失焦统一清零键位与鼠标按住状态。
  addEventListener('blur', function () {
    for (var k in keys) keys[k] = false;
    mouseDown = false;
    _rmbHeld = false;
  });
  addEventListener('mousedown', function (e) {
    // 复活/接管界面开着时点按钮绝不再锁指针(防光标被吃掉,选钮无需先按 ESC)
    if (gameState === 'playing' && !respawnUiOpen && !possessUiOpen) {
      if (e.button === 0) {
        mouseDown = true;
        if (!pointerLocked && lockAvailable) attemptLock();
      } else if (e.button === 2) {
        // 右键:在直升机雷达开启时选定/取消选定锁定目标; 07: 99式按住=激光压制照射
        _rmbHeld = true;
        e.preventDefault();
        if (player && player.alive && isHeliVehicle(player) && player._heliRadarActive) {
          heliRadarRightClickDesignate(player);
        }
      }
    }
  });
  addEventListener('mouseup', function (e) {
    if (e.button === 0) mouseDown = false;
    if (e.button === 2) _rmbHeld = false;   // 激光压制照射松开
  });
  addEventListener('contextmenu', function (e) { e.preventDefault(); });
  // ★转向角度受限修复:进入对局后不依赖「玩家先点一次左键」才拿到指针锁定 ——
  //   ①在「出击/继续」按钮的手势里已 attemptLock;若那一发被拒(沙箱 iframe 无
  //   allow-pointer-lock、或同手势内先 exit 再 request 被吞),旧代码会把「无限增量瞄准」
  //   一路降级成「屏宽差分」,于是转向被钳在一屏之内、光标顶到窗口边就转不动。
  //   ②这里补一个 300ms 的轻量 watchdog:只要「对局中 + 未锁定 + 不在冷却」就再要一次,
  //   任何真实用户手势(点击/键鼠/focus)之后浏览器即会放行。空转成本可忽略(4 个布尔判断)。
  if (typeof setInterval === 'function') {
    setInterval(aimPointerLockWatchdog, 300);
    addEventListener('focus', function () {            // 切回窗口=天然用户手势,立刻重试
      lockAvailable = true;
      aimPointerLockWatchdog();
    });
  }
  // 鼠标滚轮操作——开镜模式下统一缩放倍率(1~20×);直升机非开镜视角下调节升力/总距与发动机启停
  addEventListener('wheel', function (e) {
    // 浏览器默认把 Ctrl/Cmd+滚轮(含触控板捏合)当作页面缩放手势:指针锁定期间触发缩放会使
    // 光标隐匿与锁定状态错乱(对局表现=鼠标"消失"+自动暂停+瞄准/命中坐标全错)。
    // 本页即全屏战场,一律拦下;确需缩放页面请走浏览器菜单或 Ctrl+加/减号。
    if (e.ctrlKey || e.metaKey) e.preventDefault();
    if (gameState !== 'playing' || !player || !player.alive) return;
    var isCtrl = !!(e.ctrlKey || (keys && (keys.ControlLeft || keys.ControlRight || keys.Control)));
    if (scopeMode) {
      // 炮镜模式下: 统一使用鼠标滚轮缩放倍率(向上放大、向下缩小, 1~20×; 按住 CTRL 一次调整 10 倍倍率)
      e.preventDefault();
      var step = isCtrl ? 10 : (5 / 3);
      if (e.deltaY < 0) scopeZoom = Math.min(20, scopeZoom + step);
      else scopeZoom = Math.max(1, scopeZoom - step);       // 向下滚 = 缩小(最小=默认1×)
      return;
    }
    if (isHeliVehicle(player)) {
      // 直升机非开镜视角下: 滚轮控制升力与发动机启停 (按住 CTRL 一次调整 10% 桨距)
      e.preventDefault();
      heliHandleWheel(e.deltaY, isCtrl);
      return;
    }
  }, { passive: false });

  // 鼠标瞄准——视野(FPS 式,黄点钉死屏心)先吃增量,真实炮塔在主循环里按炮塔转速限幅追踪。
  // 指针锁定吃 movementX/Y 无限增量;兼容模式(沙箱拒锁)按 clientX 差分(屏幕边缘会顶死,属已知退化)。
  addEventListener('mousemove', function (e) {
    if (gameState !== 'playing' || !player || !player.alive) return;
    // ★指针锁定时 clientX 冻结,必须吃 movement 增量(否则一锁定=瞄死);未锁定时有 client 源按真实位置差分
    var _st = aimInputStep(e, pointerLocked && typeof e.movementX === 'number', aimPX, aimPY, innerWidth, innerHeight);
    var dxC = _st.dx, dyC = _st.dy;
    aimPX = _st.bx; aimPY = _st.by;
    aimApplyDelta(dxC, dyC);                  // 灵敏度/倍率补偿/火箭炮装定分支单一实现(触屏滑动共用)
  });

  document.addEventListener('pointerlockchange', function () {
    var nowLocked = (document.pointerLockElement === renderer.domElement);
    if (nowLocked) window._pointerPauseArmed = true;
    // 仅「已经锁上过、现在丢掉」才暂停。进局 exitPointerLock / 从未锁成功 不得误开暂停。
    if (window._pointerPauseArmed && !nowLocked && gameState === 'playing' && lockAvailable && !respawnUiOpen && !possessUiOpen) {
      window._pointerPauseArmed = false;
      gameState = 'paused';
      el.pauseov.classList.remove('hidden');
      if (typeof sfxUiDi === 'function') sfxUiDi(2);
    }
    pointerLocked = nowLocked;
    updateLockHint();
  });
  document.addEventListener('pointerlockerror', function () {
    lockAvailable = false;
    pointerLocked = false;
    setTimeout(function () { lockAvailable = true; }, 1600);   // ESC 后短暂冷却(~1.25s)内重锁也会触发 error:冷却后允许再锁;硬性沙箱拒绝=每次点击重试一次,无害
    updateLockHint();
  });

}
function lockPointer() {

  // 起恢复指针锁定:第三人称也全面 FPS 化(黄点钉死屏心、视野吃鼠标增量),
  // 必须有指针锁定提供不受屏幕边缘限制的无限增量;锁定被拒绝(iframe 沙箱等)自动退兼容模式(自由光标差分)
  if (!lockAvailable) return;
  var c = renderer.domElement;
  try {
    var r = c.requestPointerLock({ unadjustedMovement: true });
    if (r && typeof r.catch === 'function') {
      r.catch(function () { try { c.requestPointerLock(); } catch (e) {} });
    }
  } catch (err) {
    try { c.requestPointerLock(); } catch (e) {}
  }

}
function attemptLock() {

  lockPointer();
  // 不设"超时未锁即永久禁用":ESC 解锁后的浏览器冷却期(~1.25s)内重锁必然失败,
  // 永久禁用会让整局退化为兼容模式;失败统一交给 pointerlockerror 的冷却重开处理

}
function updateLockHint() {

  // 锁定/兼容模式文字提示不显示,只保持元素隐藏
  if (!el.lockhint) return;
  el.lockhint.classList.add('hidden');

}

/* ============================================================
   触屏操控层——纯事件驱动,零逐帧:
   · 左半屏摇杆驱动车体(touchJoy* 模拟量,playerUpdate 消费;摇杆=左下角常驻,位置/大小进自定义编辑器);
   · 右半屏单指滑动=瞄准(与鼠标共用 aimApplyDelta 单一实现);
   · 右半屏双指缩放=炮镜倍率:张开跨越 1.15× 自动开镜(scopeToggle 共用),
     捏合回 1× 自动关镜;镜内连续变焦 1~20×(与滚轮同 clamp);
   · 漫画风开火键(#tfire)=mouseDown 同位;炮镜键(#tscope)=scopeToggle;弃车键(#tquit)=KeyJ 同位;
     返回菜单键(#tmenu)=呼出暂停菜单;指挥模式键(#tsqb)=单击开关盾徽+进出指挥模式,盾徽随阵营着色;
     全键漫画基类 .tbtn 统一(纸白+墨描边+硬投影),位置/大小可进自定义编辑器;
   · 仅粗指针设备挂载(桌面零监听器);菜单/按钮触摸不拦截(交还浏览器合成 click)。
   ============================================================ */
(function () {
  var TOUCH_ON = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
  /* 瞄准灵敏度滑条:倍数=滑条值直读(≤1 归 1;默认 3×,最高 10×);鼠标/触屏同吃,桌面同样生效故绑定在 TOUCH_ON 门前。
     旧映射 1+0.9v 已废(默认改 3 倍时同步简化);旧存档值按新口径直读,偏差 ≤10% 一次性可接受。 */
  var si = document.getElementById('sensinput'), sv = document.getElementById('sensval');
  function sensApply(v) {
    aimSensMul = v > 1 ? v : 1;
    if (sv) sv.textContent = '×' + aimSensMul.toFixed(1);
  }
  if (si) {
    var sv0 = 3;
    try { var _sp = parseFloat(localStorage.getItem('prefAimSens')); if (!isNaN(_sp)) sv0 = _sp; } catch (e) {}
    si.value = sv0; sensApply(sv0);
    si.addEventListener('input', function () {
      var v = parseFloat(si.value) || 0;
      sensApply(v);
      try { localStorage.setItem('prefAimSens', String(v)); } catch (e) {}
    });
  }
  /* 击杀信息开关(默认开;桌面同吃故绑定在 TOUCH_ON 门前) */
  var kb = document.getElementById('killmsgbtn');
  try { if (localStorage.getItem('prefKillMsg') === '0') killMsgOn = false; } catch (e) {}
  function kbRender() {
    if (!kb) return;
    kb.textContent = '击杀信息:' + (killMsgOn ? '开' : '关');
    kb.classList.toggle('sel', killMsgOn);       // 开启态变色(与帧率显示按钮同款 .sel 琥珀选中态)
  }
  if (kb) {
    kbRender();
    kb.addEventListener('click', function () {
      killMsgOn = !killMsgOn;
      try { localStorage.setItem('prefKillMsg', killMsgOn ? '1' : '0'); } catch (e) {}
      kbRender();
    });
  }
  var cb = document.getElementById('custbtn');   // 自定义按钮入口(手势操作,桌面隐藏)
  if (!TOUCH_ON) { if (cb) cb.classList.add('hidden'); return; }   // 桌面(精确指针):零监听器零 DOM 显示

  var base = document.getElementById('tjoy'), knob = document.getElementById('tjoyknob');
  var fire = document.getElementById('tfire');
  var scpBtn = document.getElementById('tscope'), quitBtn = document.getElementById('tquit');
  var menuB = document.getElementById('tmenu'), sqbB = document.getElementById('tsqb');
  var capB = document.getElementById('tcap'), folB = document.getElementById('tfol');   // 指挥指令键(占领/跟随,仅指挥模式显示)
  var nvB = document.getElementById('tnv'), sense = document.getElementById('tsense');
  var thB = document.getElementById('tth');
  var JOY_R0 = 62;                               // 摇杆行程半径基准 px(=底盘半径,knob 顶到缘=满舵;×自定义缩放)
  /* ===== 自定义布局:{id:{fx,fy,s}}=视口分数中心坐标+缩放;无条目=CSS 默认位(零回归) ===== */
  var tlay = {};
  try { tlay = JSON.parse(localStorage.getItem('prefTouchLayout') || '{}') || {}; } catch (e) { tlay = {}; }
  var custOn = false, custWork = null;           // 编辑模式开关/工作副本(保存并退出才落 tlay)
  function curLay() { return custOn ? custWork : tlay; }
  function joyS() { var L = curLay().tjoy; return L && L.s ? L.s : 1; }
  function JOY_R() { return JOY_R0 * joyS(); }
  /* 摇杆感应圈:圆形,恒比摇杆大(下限=杆半径+24px 硬保证),独立缩放(tsense.s),
     圆心恒=摇杆心(相对位置固定,拖杆同拖圈);运行期隐形纯逻辑判定,自定义界面可视 */
  var SENSE_R0 = 110;
  function senseS() { var L = curLay().tsense; return L && L.s ? L.s : 1; }
  function senseR() { return Math.max(JOY_R() + 24, SENSE_R0 * senseS()); }
  function inSense(x, y) { var dx = x - fixedCX(), dy = y - fixedCY(); return dx * dx + dy * dy <= senseR() * senseR(); }
  var CTL_W = { tfire: { w: 84, h: 84 }, tscope: { w: 64, h: 64 }, tquit: { w: 64, h: 64 },
                tmenu: { w: 52, h: 52 }, tsqb: { w: 64, h: 64 }, tnv: { w: 64, h: 64 },
                tth: { w: 64, h: 64 }, tcap: { w: 64, h: 64 }, tfol: { w: 64, h: 64 } };   // CSS 基准宽高(transform scale 不改布局盒,居中定位用;弃车/热成像与其余同 64,仅开火 84)
  function layApply() {                          // 布局落地(事件级:进出编辑/拖动/缩放/转屏时调)
    var L = curLay(), m = { tfire: fire, tscope: scpBtn, tquit: quitBtn, tmenu: menuB, tsqb: sqbB, tnv: nvB, tth: thB, tcap: capB, tfol: folB }, id, el2, e3;
    for (id in m) {
      el2 = m[id]; if (!el2) continue;
      e3 = L[id];
      if (e3) {
        el2.style.left = (e3.fx * innerWidth - CTL_W[id].w / 2) + 'px';
        el2.style.top = (e3.fy * innerHeight - CTL_W[id].h / 2) + 'px';
        el2.style.right = 'auto'; el2.style.bottom = 'auto'; el2.style.marginTop = '0';
        el2.style.setProperty('--ts', e3.s || 1);
      } else {
        el2.style.left = el2.style.top = el2.style.right = el2.style.bottom = el2.style.marginTop = '';
        el2.style.removeProperty('--ts');
      }
    }
    var s = joyS();
    base.style.width = 124 * s + 'px'; base.style.height = 124 * s + 'px';
    knob.style.width = 54 * s + 'px'; knob.style.height = 54 * s + 'px';
    if (sense) {                                 // 感应圈:圆心=摇杆心,直径=2×senseR(含比杆大下限)
      var sr = senseR();
      sense.style.width = sense.style.height = sr * 2 + 'px';
      sense.style.left = fixedCX() + 'px'; sense.style.top = fixedCY() + 'px';
    }
    if (joyId == null) baseTo(fixedCX(), fixedCY(), 0, 0);
  }
  addEventListener('resize', layApply);          // 事件级:转屏/窗口变化重排(坐标为视口分数)
  var joyId = null, joyCX = 0, joyCY = 0;        // 摇杆触点 id 与杆心
  var aimId = null, aimLX = 0, aimLY = 0;        // 瞄准触点 id 与上次坐标
  var p2Id = null, p2X = 0, p2Y = 0;             // 缩放第二指
  var pinchD0 = 0, pinchZ0 = 1;                  // 捏合基准距离/基准倍率(虚拟倍率:未开镜=1)
  var fireId = null, quitId = null;   // 开火/弃车触点 id(松手复位)

  function playing() { return gameState === 'playing' && player && player.alive && !respawnUiOpen && !possessUiOpen; }
  function uiSync() {                            // 事件驱动显隐(开战/结算/切模式时调;无逐帧检查)
    if (custOn) return;                          // 编辑模式:显隐由 custShow 全权接管
    var on = TOUCH_ON && gameState === 'playing';
    if (fire) fire.classList.toggle('hidden', !on);
    if (scpBtn) scpBtn.classList.toggle('hidden', !on);
    if (quitBtn) quitBtn.classList.toggle('hidden', !on);
    if (menuB) menuB.classList.toggle('hidden', !on);
    if (nvB) {
      nvB.classList.toggle('hidden', !on || (typeof playerHasNV !== 'undefined' && !playerHasNV));   // 座车无夜视仪(59式)=隐藏;编辑器内由 custShow 全量显示
      if (on) nvB.classList.toggle('lit', typeof nvOn !== 'undefined' && !!nvOn);   // 点亮态跟随夜视开关记忆(任意视角)
    }
    if (thB) {
      thB.classList.toggle('hidden', !on || (typeof playerHasTH !== 'undefined' && !playerHasTH));   // 座车无热成像(99式/M1A1 外)=隐藏;编辑器内由 custShow 全量显示
      if (on) thB.classList.toggle('lit', typeof thermalOn !== 'undefined' && !!thermalOn);   // 点亮态跟随热像开关记忆(任意视角)
    }
    if (sense && !custOn) sense.classList.add('hidden');   // 感应圈:运行期恒隐形(纯逻辑判定,仅编辑器可视)
    if (sqbB) {
      sqbB.classList.toggle('hidden', !on);
      if (on && player) {                        // 盾徽随玩家阵营着色(红方红/蓝方蓝)+点亮态跟随指挥模式开关
        var sf2 = document.getElementById('tsqbfill');
        if (sf2) sf2.setAttribute('fill', player.team === 'ally' ? '#c81e12' : '#2f6fd0');
        sqbB.classList.toggle('lit', typeof sqCmd !== 'undefined' && !!sqCmd.active);
      }
    }
    /* 指挥指令键(占领/跟随):仅指挥模式显示(Z/X 同入口);点亮态=当前指令(进模式默认跟随) */
    var cmdOn = on && typeof sqCmd !== 'undefined' && !!sqCmd.active;
    if (capB) { capB.classList.toggle('hidden', !cmdOn); capB.classList.toggle('lit', cmdOn && sqCmd.order === 'occupy'); }
    if (folB) { folB.classList.toggle('hidden', !cmdOn); folB.classList.toggle('lit', cmdOn && sqCmd.order !== 'occupy'); }
    if (base) {
      base.classList.toggle('hidden', !on);                        // 摇杆=常驻
      if (on && joyId == null) baseTo(fixedCX(), fixedCY(), 0, 0);
    }
  }
  function fixedCX() { var L = curLay().tjoy; return L ? L.fx * innerWidth : 24 + JOY_R() + 8; }
  function fixedCY() { var L = curLay().tjoy; return L ? L.fy * innerHeight : innerHeight - 24 - JOY_R() - 8; }
  function baseTo(cx, cy, kx, ky) {
    base.style.left = cx + 'px'; base.style.top = cy + 'px';
    knob.style.transform = 'translate(-50%,-50%) translate(' + kx + 'px,' + ky + 'px)';
  }
  function joyDrop() {
    joyId = null; touchJoyOn = false; touchJoyX = 0; touchJoyY = 0;
    baseTo(fixedCX(), fixedCY(), 0, 0);
  }
  function pinchDrop(tid) {                      // 双指其一抬起:余指顺位转瞄准指
    if (tid === p2Id) { p2Id = null; return; }
    if (tid === aimId) { aimId = p2Id; aimLX = p2X; aimLY = p2Y; p2Id = null; }
  }
  var TCTL_IDS = ['tfire', 'tscope', 'tquit', 'tmenu', 'tsqb', 'tnv', 'tth', 'tcap', 'tfol'];   // 触控层自有键 ID 表(uiTarget/ctrlOf 共用单一出处)
  function uiTarget(t) {                         // 菜单/按钮/滑杆触摸不拦截(浏览器合成 click 接管);触控层自有键除外
    var n = t; while (n && n !== document.body) {
      if (TCTL_IDS.indexOf(n.id) >= 0) return false;   // 触控层自有键走触摸处理(button 标签不得被菜单放行规则吞掉)
      if (n.tagName === 'BUTTON' || n.tagName === 'INPUT' || n.tagName === 'A' || n.tagName === 'SELECT') return true;
      n = n.parentNode;
    }
    return false;
  }
  function ctrlOf(t) {                           // 触点所属触控键(SVG 子节点向上归并)
    var n = t; while (n && n !== document.body) {
      if (TCTL_IDS.indexOf(n.id) >= 0) return n.id;
      n = n.parentNode;
    }
    return null;
  }

  document.addEventListener('touchstart', function (e) {
    if (custOn) { edStart(e); return; }                      // 自定义布局编辑模式:触摸全交编辑器
    if (uiSyncQ) { uiSyncQ = false; uiSync(); }              // 状态迁移后的惰性同步点
    if (gameState === 'playing' && ctrlOf(e.target) === 'tmenu') {   // 返回菜单键置 playing() 门前:复活/接管界面开着同样可用
      gameState = 'paused'; el.pauseov.classList.remove('hidden');   // 呼出暂停菜单(明确暂停意图,复活/接管界面开着同样放行)
      if (typeof sfxUiDi === 'function') sfxUiDi(2);
      uiSync(); e.preventDefault(); return;
    }
    if (!playing() || uiTarget(e.target)) return;
    var i, t, cid;
    for (i = 0; i < e.changedTouches.length; i++) {
      t = e.changedTouches[i];
      cid = ctrlOf(t.target);
      if (cid === 'tfire') {                                   // 开火键:按下=持续开火(mouseDown 同位)
        fireId = t.identifier; mouseDown = true; fire.classList.add('pressed');
      } else if (cid === 'tscope') {                           // 炮镜键:点按开关(Shift 同一实现)
        scopeToggle(); scpBtn.classList.toggle('lit', scopeMode);
      } else if (cid === 'tquit') {                            // 弃车键:长按 3s(KeyJ 同位,倒数/红环/松手复位全链复用)
        quitId = t.identifier; keys.KeyJ = true; quitBtn.classList.add('pressed');
      } else if (cid === 'tsqb') {                             // 指挥模式键:小队标识与指挥模式同步开关(Backspace 同入口)
        if (gameState === 'playing' && player && player.alive) {
          if (isHeliVehicle(player) && typeof heliABGToggle === 'function') heliABGToggle();   // 直升机座舱= A射B导
          else if (typeof sqCmdToggle === 'function') sqCmdToggle();
        }
        if (sqbB) sqbB.classList.toggle('lit', typeof sqCmd !== 'undefined' && !!sqCmd.active);
      } else if (cid === 'tcap') {                             // 占领键:指挥模式内把小队派往屏心落点(插旗);Z 同入口
        sqCmdOrderOccupyAtCursor();
      } else if (cid === 'tfol') {                             // 跟随键:撤销占领收旗回跟随(进模式默认);X 同入口
        if (typeof sqCmd !== 'undefined' && sqCmd.active) sqCmdOrderSet('follow', 0, 0);
      } else if (cid === 'tnv') {                              // 夜视仪键:任意视角开关(KeyN 同语义;设备门=座车装备缓存;阵亡/换装自动失效由 nvActive 兜底)
        if ((typeof playerHasNV === 'undefined' || playerHasNV) && player && player.alive && typeof nvSync === 'function') {
          nvOn = !nvOn; nvSync(); nvB.classList.toggle('lit', nvOn);
          if (thB) thB.classList.toggle('lit', typeof thermalOn !== 'undefined' && !!thermalOn);   // 互斥后热像灯随动
        }
      } else if (cid === 'tth') {                              // 热成像键:任意视角开关(KeyH 同语义;与夜视互斥;设备门=99式/M1A1;阵亡/换装自动失效由 thermalActive 兜底)
        if ((typeof playerHasTH === 'undefined' || playerHasTH) && player && player.alive && typeof thermalSync === 'function') {
          thermalOn = !thermalOn; thermalSync(); thB.classList.toggle('lit', thermalOn);
          if (nvB) nvB.classList.toggle('lit', typeof nvOn !== 'undefined' && !!nvOn);             // 互斥后夜视灯随动
        }
      } else if (joyId == null && inSense(t.clientX, t.clientY)) {
        /* 摇杆:感应圈内按下(圈外左半屏落瞄准分支) */
        joyId = t.identifier;
        joyCX = fixedCX();
        joyCY = fixedCY();
        base.classList.remove('hidden');
        joyVec(t.clientX, t.clientY);
        if (player && player.alive && typeof playerImmobile === 'function' && playerImmobile() &&
            typeof aimHint === 'function') aimHint('不可移动');   // 摇杆按下沿:不可移动提示(事件触发,节流在 aimHint 内)
      } else {                                                 // 其余区域(右半屏+感应圈外的左半屏):瞄准/双指缩放
        if (aimId == null) { aimId = t.identifier; aimLX = t.clientX; aimLY = t.clientY; }
        else if (p2Id == null) {
          p2Id = t.identifier; p2X = t.clientX; p2Y = t.clientY;
          pinchD0 = Math.max(20, Math.hypot(p2X - aimLX, p2Y - aimLY));
          pinchZ0 = scopeMode ? scopeZoom : 1;
        }
      }
    }
    e.preventDefault();                                      // 战斗中触摸不产生滚动/合成鼠标事件
  }, { passive: false });

  function joyVec(x, y) {
    var R = JOY_R();
    var dx = x - joyCX, dy = y - joyCY, l = Math.hypot(dx, dy);
    if (l > R) { dx *= R / l; dy *= R / l; }
    touchJoyOn = true; touchJoyX = dx / R; touchJoyY = -dy / R;   // 屏幕 y 下正 → 前进为正
    baseTo(joyCX, joyCY, dx, dy);
  }

  document.addEventListener('touchmove', function (e) {
    if (custOn) { edMove(e); return; }
    if (joyId == null && aimId == null && fireId == null) return;
    var i, t;
    for (i = 0; i < e.changedTouches.length; i++) {
      t = e.changedTouches[i];
      if (t.identifier === joyId) joyVec(t.clientX, t.clientY);
      else if (t.identifier === aimId || t.identifier === p2Id) {
        if (t.identifier === aimId) { var adx = t.clientX - aimLX, ady = t.clientY - aimLY; aimLX = t.clientX; aimLY = t.clientY; }
        else { p2X = t.clientX; p2Y = t.clientY; }
        if (p2Id != null) {                                  // 双指=纯缩放(瞄准增量抑制)
          var d = Math.max(20, Math.hypot(p2X - aimLX, p2Y - aimLY));
          var z = clamp(pinchZ0 * d / pinchD0, 1, 20);       // 与滚轮同 clamp(1~20×)
          if (!scopeMode && z > 1.15) { scopeToggle(); scopeZoom = z; if (scpBtn) scpBtn.classList.add('lit'); }         // 张开跨阈=开镜
          else if (scopeMode && z <= 1.02) { scopeZoom = 1; scopeToggle(); if (scpBtn) scpBtn.classList.remove('lit'); }   // 捏回 1×=关镜(开 1.15/关 1.02 迟滞防抖,同手势可开可关)
          else if (scopeMode) scopeZoom = z;
        } else if (t.identifier === aimId && playing()) aimApplyDelta(adx, ady);   // 单指=瞄准(鼠标同一入口)
      }
    }
    e.preventDefault();
  }, { passive: false });

  function touchDone(e) {
    if (custOn) { edEnd(e); return; }
    var i, t;
    for (i = 0; i < e.changedTouches.length; i++) {
      t = e.changedTouches[i];
      if (t.identifier === joyId) joyDrop();
      else if (t.identifier === fireId) { fireId = null; mouseDown = false; if (fire) fire.classList.remove('pressed'); }
      else if (t.identifier === quitId) { quitId = null; keys.KeyJ = false; if (quitBtn) quitBtn.classList.remove('pressed'); }
      else if (t.identifier === aimId || t.identifier === p2Id) pinchDrop(t.identifier);
    }
  }
  document.addEventListener('touchend', touchDone);
  document.addEventListener('touchcancel', touchDone);

  /* ===== 自定义按钮布局编辑器:拖动=移动,按住+双指开合=缩放;重置/保存并退出 ----
     入口=设置页 #custbtn(仅触屏显示);工作副本 custWork,保存才落 tlay+localStorage;
     tjoy 条目=摇杆杆位/大小。全事件驱动。 ===== */
  var custOv = document.getElementById('tcustomov');
  var edId = null, edCtl = null, edX = 0, edY = 0, edP2 = null, edD0 = 1, edS0 = 1;
  function custCtls() { return { tjoy: base, tfire: fire, tscope: scpBtn, tquit: quitBtn, tmenu: menuB, tsqb: sqbB, tnv: nvB, tth: thB, tcap: capB, tfol: folB, tsense: sense }; }
  function custShow(on) {
    custOn = on;
    if (custOv) custOv.classList.toggle('hidden', !on);
    var m = custCtls(), id;
    for (id in m) if (m[id]) m[id].classList.toggle('hidden', on ? false : (id === 'tsense' ? true : gameState !== 'playing'));   // 感应圈:仅编辑器可视
    if (!on) { edId = edCtl = edP2 = null; }
    layApply();
    if (!on) uiSync();
  }
  if (cb) cb.addEventListener('click', function () { custWork = JSON.parse(JSON.stringify(tlay)); custShow(true); });
  var rstB = document.getElementById('tcreset'), savB = document.getElementById('tcsave');
  if (rstB) rstB.addEventListener('click', function () { custWork = {}; layApply(); });   // 重置=清工作副本回 CSS 默认(不退出,保存才生效)
  if (savB) savB.addEventListener('click', function () {
    tlay = custWork || {};
    try { localStorage.setItem('prefTouchLayout', JSON.stringify(tlay)); } catch (e) {}
    custShow(false);
  });
  function hitCtl(x, y) {                        // 手动命中检测(tjoy pointer-events:none 收不到 target;事件时一次矩形查询)
    var m = custCtls(), order = ['tmenu', 'tquit', 'tsqb', 'tcap', 'tfol', 'tscope', 'tnv', 'tth', 'tfire', 'tjoy', 'tsense'], i, el2, r;   // tsense 最大置末(内圈优先命中)
    for (i = 0; i < order.length; i++) {
      el2 = m[order[i]]; if (!el2) continue;
      r = el2.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return order[i];
    }
    return null;
  }
  function edEnsure(id) {                        // 首次触碰:按当前渲染位建条目
    if (!custWork[id]) {
      var el2 = custCtls()[id], r = el2.getBoundingClientRect();
      custWork[id] = { fx: (r.left + r.width / 2) / innerWidth, fy: (r.top + r.height / 2) / innerHeight,
                       s: id === 'tjoy' ? joyS() : id === 'tsense' ? senseS()
                        : (parseFloat(el2.style.getPropertyValue('--ts')) || 1) };
    }
    return custWork[id];
  }
  function edStart(e) {
    if (uiTarget(e.target)) return;              // 重置/保存按钮走浏览器合成 click
    var i, t2, c2;
    for (i = 0; i < e.changedTouches.length; i++) {
      t2 = e.changedTouches[i];
      if (edId == null) {
        c2 = hitCtl(t2.clientX, t2.clientY);
        if (c2) { edId = t2.identifier; edCtl = c2; edX = t2.clientX; edY = t2.clientY; edEnsure(c2); }
      } else if (edP2 == null) {                 // 按住目标后第二指=缩放基准
        edP2 = t2.identifier;
        edD0 = Math.max(24, Math.hypot(t2.clientX - edX, t2.clientY - edY));
        edS0 = edEnsure(edCtl).s || 1;
      }
    }
    e.preventDefault();
  }
  function edMove(e) {
    var i, t2, L2;
    for (i = 0; i < e.changedTouches.length; i++) {
      t2 = e.changedTouches[i];
      if (t2.identifier === edId) {
        edX = t2.clientX; edY = t2.clientY;
        if (edP2 == null && edCtl) {             // 单指=拖动(中心跟随指尖,视口 4%~96% 夹取防拖丢)
          L2 = edEnsure(edCtl === 'tsense' ? 'tjoy' : edCtl);   // 拖感应圈=拖摇杆(圆心恒同,相对位置固定)
          L2.fx = clamp(edX / innerWidth, 0.04, 0.96);
          L2.fy = clamp(edY / innerHeight, 0.06, 0.94);
          layApply();
        }
      } else if (t2.identifier === edP2 && edCtl) {   // 双指开合=缩放 0.55~2.2(感应圈独立缩放,另有比杆大硬下限)
        L2 = edEnsure(edCtl);
        L2.s = clamp(edS0 * Math.hypot(t2.clientX - edX, t2.clientY - edY) / edD0, 0.55, 2.2);
        layApply();
      }
    }
    e.preventDefault();
  }
  function edEnd(e) {
    var i, t2;
    for (i = 0; i < e.changedTouches.length; i++) {
      t2 = e.changedTouches[i];
      if (t2.identifier === edId) { edId = null; edCtl = null; edP2 = null; }
      else if (t2.identifier === edP2) edP2 = null;
    }
  }

  /* 状态迁移同步:全部入口都是用户点击(开战/继续/复活按钮)——click 冒泡后置位,
     下一次触摸开场惰性刷新;外加立即刷新一次(本次点击本身)。零轮询零逐帧。 */
  var uiSyncQ = false;
  /* 状态迁移同步三通道:①开战/结算入口直挂 _touchUISync(第一时间,治"开局要点一下才显示"——
     菜单按钮动作延迟 48ms,旧 0ms 兜底跑在 gameState 置位之前扑空);②click 兜底延时 120ms
     盖过动作延迟;③下一次触摸惰性刷新。全事件驱动零轮询。 */
  window._touchUISync = uiSync;
  document.addEventListener('click', function () { uiSyncQ = true; setTimeout(uiSync, 120); });
  layApply();                                    // 开机套用已保存布局(无存档=CSS 默认零回归)
  uiSync();
})();

