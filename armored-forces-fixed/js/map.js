
/* ===== Module: map.js ===== */
/* ============================================================
   模块: map.js — 地图:远景丘陵环 / 特效事件可见性门 / 命中事件路由
   (加载顺序由 index.html MODULES 表决定,勿单独调整)
   ============================================================ */
'use strict';
/* ============================================================
   远景丘陵环(草地/沃土双材质地平线):方形网格环 (half-60)~half+2200,
   越脊台肩(逐方位追踪地图外缘地形最高轮廓,肩线恒在其上,数学灭绝
   "远山低于地图轮廓"的天缝)+ 三重山脊(以 MAP.half 为基准平移,
   随所选边长整体外移)+ "沃土红碎花/草地草甸"程序化贴图 + 顶点明暗
   (接缝带向土地明度过渡,杜绝黑色裂谷带),确定性值噪声(不动战斗 RNG),
   含雾自然淡出;纯视觉,不参与碰撞与弹道。
   ============================================================ */

var hillMesh = null;                                     // 远景丘陵环(草地/沃土双材质地平线)
var hillCrestTab = null;
function buildHillCrestTab() {                      // 128 方位 × 切比雪夫半径 (half-300)~half 地形最高轮廓表(建景一次性,不打战斗 RNG)
  var NA = 128;                                     // 带上限到 half:缝合带的地形基准起伏也必须被肩线压住(否则顶点穿出丘陵)
  hillCrestTab = new Float32Array(NA);
  for (var i = 0; i < NA; i++) {
    var th = i / NA * Math.PI * 2, dx = Math.cos(th), dz = Math.sin(th);
    var m = Math.max(Math.abs(dx), Math.abs(dz)), mx = -1e9;
    for (var t = (MAP.half - 300) / m; t <= MAP.half / m; t += 1) {   // 地图外缘轮廓带
      var v = terrainBase(dx * t, dz * t);
      if (v > mx) mx = v;
    }
    hillCrestTab[i] = mx;
  }
}
function hillCrest(th) {                            // 方位角 → 该方向地图外缘地形最高轮廓(环形线性插值)
  if (!hillCrestTab) buildHillCrestTab();
  var NA = hillCrestTab.length, u = th / (Math.PI * 2);
  u -= Math.floor(u);
  var f = u * NA, i0 = Math.floor(f) % NA, w = f - Math.floor(f);
  return hillCrestTab[i0] * (1 - w) + hillCrestTab[(i0 + 1) % NA] * w;
}
function hillProfile(x, z) {
  var half = MAP.half;
  var r = Math.max(Math.abs(x), Math.abs(z)), tb = terrainBase(x, z);   // 切比雪夫半径:与方形地面边缘缝合
  // 内带(地图本体):丘陵始终低于地面 2.5m,灭绝裂隙与浮空贴图覆盖地面的问题
  // 大地图(>2000m)时丘陵从真实地面 tb 平滑抬升(接缝带 120m),
  //   保证 r ≤ half 处丘陵高度严格 ≤ 地面高度,远景贴图不会覆盖新增地面。
  var SEAM_IN = half - 20;    // 内缘起抬点(贴近地图边内)
  var SEAM_OUT = half + 160;  // 外缘抬满(近脊顶)
  var n1 = hillNoise(x, z, 340), n2 = hillNoise(x + 917, z - 541, 150);
  var rr1 = hillSstep((r - (half + 80)) / 140) * (1 - hillSstep((r - (half + 400)) / 180));
  var rr2 = hillSstep((r - (half + 340)) / 190) * (1 - hillSstep((r - (half + 1400)) / 260));
  var rr3 = hillSstep((r - (half + 1300)) / 300);
  var ridge = 4 + rr1 * (26 + 26 * n1) + rr2 * (42 + 38 * n2) + rr3 * (60 + 44 * n1) + (n2 - 0.5) * 14;
  // 越脊台肩:从 tb-2.5(地图内) 平滑抬升到 crest+ridge(远脊);接缝带用 smoothstep 过渡
  var crest = hillCrest(Math.atan2(z, x));
  var shoulderFull = crest + 2 + 32 * hillSstep((r - half) / 360)
    + hillNoise(x - 331, z + 877, 210) * 5 * hillSstep((r - (half + 20)) / 120);
  if (r <= SEAM_IN) return tb - 2.5;
  var tSeam = clamp((r - SEAM_IN) / (SEAM_OUT - SEAM_IN), 0, 1);
  tSeam = tSeam * tSeam * (3 - 2 * tSeam);
  // 内端:tb - 2.5(贴地之下);外端:max(shoulderFull, ridge)
  var inside = tb - 2.5;
  var outside = Math.max(shoulderFull, ridge);
  return inside + (outside - inside) * tSeam;
}
function buildHillRing(style) {
  if (hillMesh) { scene.remove(hillMesh); hillMesh.geometry.dispose(); hillMesh = null; }
  var half = MAP.half;
  // 外缘=half+2200:2km→3200(与现版一致),1km→2700,4km→4200 仍 ≤ 雾远 4300/相机远平面 4500;
  // 内缘(half-60)压入地面板下,填补一圈裂隙
  var HALF = half + 2200, STEP = 64, INNER = half - 60;
  var NN = Math.round((HALF * 2) / STEP) + 1;              // 2km→101×101;4km→133×133
  var posA = new Float32Array(NN * NN * 3), colA = new Float32Array(NN * NN * 3), uvA = new Float32Array(NN * NN * 2);
  var st = GROUND_STYLES[style] || GROUND_STYLES.grass;    // 丘陵顶点色=对应材质土地基色(与 repaintGround 同款渐变)
  var i2, j2, o, x, z, h;
  for (j2 = 0; j2 < NN; j2++) {
    for (i2 = 0; i2 < NN; i2++) {
      o = j2 * NN + i2;
      x = -HALF + i2 * STEP; z = -HALF + j2 * STEP;
      h = hillProfile(x, z);
      posA[o * 3] = x; posA[o * 3 + 1] = h; posA[o * 3 + 2] = z;
      var r2 = Math.max(Math.abs(x), Math.abs(z));
      var shFar = 0.60 + 0.40 * clamp(h / 105, 0, 1);      // 远处:谷暗顶亮出层次
      var w = hillSstep((r2 - 520) / 280);                 // 接缝明度过渡:近处向土地亮度(0.95)靠拢,杜绝"黑裂谷带"
      var sh = 0.95 * (1 - w) + shFar * w;
      sh *= 0.90 + 0.20 * hillNoise(x * 3.1, z * 3.1, 46); // 破碎斑驳
      var dry = terrainDry(h);                           // 与 repaintGround 同款:高程干燥度渐变
      var r0 = st.g[0] + (st.d[0] - st.g[0]) * dry,
          g0 = st.g[1] + (st.d[1] - st.g[1]) * dry,
          b0 = st.g[2] + (st.d[2] - st.g[2]) * dry;
      colA[o * 3] = r0 * sh; colA[o * 3 + 1] = g0 * sh; colA[o * 3 + 2] = b0 * sh;   // 材质土地基色 × 山形明暗
      uvA[o * 2] = x / (1000 / 140); uvA[o * 2 + 1] = z / (1000 / 140);              // 与土地纹理同世界尺度(7.14m/簇),贴图逐像素同相位
    }
  }
  var idx = [];
  for (j2 = 0; j2 < NN - 1; j2++) {
    for (i2 = 0; i2 < NN - 1; i2++) {
      var cxs = -HALF + (i2 + 0.5) * STEP, czs = -HALF + (j2 + 0.5) * STEP;
      if (Math.max(Math.abs(cxs), Math.abs(czs)) < INNER) continue;         // 腹地让位给真实地图
      var v0 = j2 * NN + i2, v1 = v0 + 1, v2 = v0 + NN + 1, v3 = v0 + NN;
      idx.push(v0, v2, v1, v0, v3, v2);                  // ★面朝上绕向:FrontSide 从上方可见
    }
  }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posA, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colA, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvA, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  var mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });   // 与对应材质土地一模一样(MeshStandardMaterial 同参数)
  mat.onBeforeCompile = function (shader) { shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.a = 0.0;'); };
  var tex = buildGrassTexture(style);                      // 与土地共享同一纹理实例(完全一样的贴图)
  if (tex) {
    mat.map = tex.clone();                                  // 独立 clone,UV 为世界尺度 7.14m/簇→repeat=(1,1)
    mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
    mat.map.repeat.set(1, 1);
    if (renderer && renderer.capabilities && renderer.capabilities.getMaxAnisotropy)
      mat.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    mat.map.needsUpdate = true;
  } else {
    mat.color = new THREE.Color(style === 'soil' ? 0xa85460 : 0x6e8058);   // 沃土=暖褐红兜底;草地=草绿兜底
  }
  hillMesh = new THREE.Mesh(geo, mat);
  hillMesh.frustumCulled = false;                                            // 地平线常显,免疫包围球剔除误判
  scene.add(hillMesh);
  if (DBG_ON) console.log('[DBG] 远景' + (style === 'soil' ? '沃土' : '草地') + '丘陵: ' + (idx.length / 3) + ' 三角形 / 越脊台肩 ' + half + '~' + (half + 320) + 'm·三重山脊 ' + (half + 60) + '~' + HALF + 'm / 花丘贴图' + (tex ? '' : '(兜底色)'));
}

/* 命中火光可见门:纯命中事件触发,不做任何逐帧目标扫描。
   600m 内直接放行;600m 外仅炮镜圆形视野内放行。同一模拟 tick 的多发命中共享一次镜轴/FOV。 */
/* ============================================================
   炮镜屏幕矩形可见性(通用渲染限制门)
   判定"点+米级余量球"是否落在炮镜视角的完整屏幕画面内(矩形视锥):
   只有完全在屏幕画面外才判不可见;圆形镜框遮罩不参与判定——
   遮罩外多渲染的部分由遮罩自然裁剪,零视觉损失(根治"目标压圆形视野边缘
   时阴影/特效/动画被裁"一族 BUG)。帧级缓存相机基向量与半角正切;
   非炮镜状态返回 true(距离门由调用方自理)。全部炮镜渲染限制统一调本函数。
   ============================================================ */
var _svTick = -1, _svZoom = -1, _svBlend = -1, _svTanV = 0, _svTanH = 0;
var _svF = new THREE.Vector3(), _svR = new THREE.Vector3(), _svU = new THREE.Vector3(), _svP = new THREE.Vector3();
function scopeScreenVisible(x, y, z, marginM) {
  if (typeof scoped === 'undefined' || !scoped || !camera) return true;
  var tick = typeof gameT !== 'undefined' ? gameT : 0;
  var zf = typeof scopeZoom !== 'undefined' ? scopeZoom : 1, st = typeof scopeT !== 'undefined' ? scopeT : 1;
  if (_svTick !== tick || _svZoom !== zf || Math.abs(_svBlend - st) > 0.001) {
    _svTick = tick; _svZoom = zf; _svBlend = st;
    var fov = scopeFov(zf, st);
    _svTanV = Math.tan(fov * Math.PI / 360);
    _svTanH = _svTanV * (camera.aspect || (innerWidth / innerHeight));
    camera.getWorldDirection(_svF);
    _svR.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    _svU.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    _svP.copy(camera.position);
  }
  var dx = x - _svP.x, dy = y - _svP.y, dz = z - _svP.z;
  var ax = dx * _svF.x + dy * _svF.y + dz * _svF.z, R = marginM || 0;
  if (ax <= 0.5) return ax > -R;                     // 贴脸/自车直通;完全在相机后方拒绝
  var lx = Math.abs(dx * _svR.x + dy * _svR.y + dz * _svR.z);
  var ly = Math.abs(dx * _svU.x + dy * _svU.y + dz * _svU.z);
  return lx <= _svTanH * ax + R && ly <= _svTanV * ax + R;
}
var FX_EVENT_SCOPE_R = 6;   // 炮镜事件门米级余量(m):命中点必在车上,覆盖整车+火花卡半径
/* 特效事件可见性门:600m 距离圈 + 炮镜全屏矩形豁免(scopeScreenVisible),
   命中火花/地面扬尘等事件级特效共用同一口径。 */
function fxEventVisible(p) {                            // 事件级特效门:600m 距离圈 + 炮镜全屏矩形
  if (!p || !player || !player.group) return false;
  var pp = player.group.position, px = p.x - pp.x, py = p.y - pp.y, pz = p.z - pp.z;
  if (px * px + py * py + pz * pz <= 360000) return true;       // 玩家周围 600m
  if (!scoped || !camera) return false;
  return scopeScreenVisible(p.x, p.y, p.z, FX_EVENT_SCOPE_R);
}
function hitSpark(p, nWorld, rayDir, type) {
  if (!fxEventVisible(p)) return;
  /* 命中火光=comic.js 三类型贴图(600m/炮镜圈事件门在 fxEventVisible)。 */
  if (typeof comicHitSpark === 'function') comicHitSpark(p, nWorld, rayDir, type);
}

/* ============================================================
   漫画纸板树(map.js 尾内联)—— 绕竖轴 billboard 面向玩家的贴图树
   · 单 InstancedMesh(1 draw call);自定义 shader:per-instance 图集 4 变体 + 雾 + 对数深度
   · 纸板质感:平涂色块 + 粗黑墨边 + 瓦楞纹;alphaTest 硬边(comic 描边 pass 天然勾墨线),不透明写深度
   · 生成:确定性种子(独立战斗 RNG)+ 噪声聚簇;避开大本营/陡坡/边界
   · 交互:被载具碾 / 被炮弹擦中 / 被爆炸波及 → 倒下并缩没(不阻挡射线与炮弹飞行)
   · 距离环 + 边缘缩没 LOD;倒地=缩放归零,全程不透明,无需混合/排序
   ============================================================ */
var _TREE_CAP = 4200;                       // 可见实例上限(缓冲容量;3km 视锥内峰值封顶)
var _TREE_RING = 3000, _TREE_FADE = 350;   // 可见半径 3km / 边缘缩没带(m)——只渲玩家视锥内,转视角再涌现
var _TREE_MAX = 20000;                      // R22-T1:活动工作集上限(现为随足迹滚动的 ±3.5km 加载窗,非全图;留头防截断,内存仍只随足迹)
var _TREE_FULL = 1200, _TREE_FARKEEP = 0.42;   // 距离抽稀:≤1200m 全渲,→3km 线性抽到 42%(封顶实例数,保帧率)
var _trees = [];                           // 全表 {x,z,y,h,w,cell,phase,sway,swsp,state(0立/1倒/2没),ft,fdir,stump}
var _treeGrid = null, _treeCELL = 18;      // 空间哈希(碾/炸/擦局部查询)
var _treeMesh = null, _treeGeo = null, _treeMat = null, _treeTex = null, _treeCellAttr = null;
var _tEuler = null, _tQuat = null, _tPos = null, _tScl = null, _tMat = null, _tnScratch = null;

// 树桩(树被碾/炸擦倒消失后原地留桩;爆炸倒树不留桩)
var _STUMP_CAP = 260, _STUMP_RING = 300, _STUMP_FADE = 50;
var _stumps = [];                          // {x,z,y,h,w,cell,flick} flick=闪烁计时(初生>0)
var _stumpMesh = null, _stumpGeo = null, _stumpMat = null, _stumpTex = null, _stumpCellAttr = null;

// 纸板花草丛(仅爆炸可摧毁;仅玩家的炮击/碾压/直升机低掠使其抖动)
var _GRASS_CAP = 4000, _GRASS_RING = 700, _GRASS_FADE = 90;   // 草丛小且量爆炸,拉到中程 700m(视锥内)即可铺满近中景
var _GRASS_FULL = 260, _GRASS_FARKEEP = 0.5;   // 距离抽稀:≤260m 全渲,→700m 抽到 50%(封顶实例数)
var _GRASS_MAX = 40000, _grassCELL = 16;   // 覆盖 ±3200 中央战场无截断(实测约 2.4 万株)
var _grass = [];                           // {x,z,y,h,w,cell,phase,sway,swsp,state(0/1没中/2没),vt,shk,shph,shdir}
var _grassGrid = null, _grassFalling = [];  // 爆炸倒没中的草(任意位置推进动画,与可见环解耦)
var _grassMesh = null, _grassGeo = null, _grassMat = null, _grassTex = null, _grassCellAttr = null;

/* 卡纸 billboard 通用着色器:图集 4 格(iCell)+ 对数深度 + 手动线性雾。
   树 / 树桩 / 花草丛共用同一编译路径(已在真 WebGL 验证可编译渲染)。 */
/* 场景 billboard(树/树桩/花草丛及未来任意场景精灵)统一热成像热度:
   全局唯一参数 SCENE_SPRITE_HEAT_HEX,热像下所有场景精灵一律取此灰阶(= 地面档 0x9c9c9c),
   不再透出贴图原色 —— 否则 unlit 精灵在热像里会过亮。改一处,全体(含未来精灵)继承。 */
var SCENE_SPRITE_HEAT_HEX = 0x4c4c4c;   // R22-T2:对齐地面「渲染亮度」≈0.58(readPixels实测),非旧0x9c9c9c的地面「材质hex」(unlit精灵会亮至≈0.80过曝);改此一处全体精灵继承
/* R25-T3 场景精灵昼夜亮度:unlit billboard 不受平行光/半球光,夜间会保持满幅白天亮度=过亮。
   全局唯一色调 SCENE_SPRITE_TINT(applyTimeOfDay 依 dayL/duskF/nightF 事件级写:白天≈白、黄昏微暖、夜晚冷蓝且整体压暗)
   由 _billboardFogSync 每帧随雾一起搬进各材质 uDayTint(零新增遍历);改此一处全体(含未来精灵)继承,与热像 uHeat 同架构。*/
var SCENE_SPRITE_TINT = new THREE.Color(1, 1, 1);
function _billboardMat(tex) {
  var fogCol = new THREE.Color(scene && scene.fog ? scene.fog.color.getHex() : 0x8fa3b8);
  var uniforms = {
    map: { value: tex },
    uFogColor: { value: fogCol },
    uFogNear: { value: scene && scene.fog ? scene.fog.near : 900 },
    uFogFar: { value: scene && scene.fog ? scene.fog.far : 6200 },
    uThermal: { value: 0.0 },
    uHeat: { value: new THREE.Color(SCENE_SPRITE_HEAT_HEX) },
    uDayTint: { value: new THREE.Color(1, 1, 1) }
  };
  var vs = [
    'attribute float iCell;', 'varying vec2 vUv;', 'varying float vFog;', 'varying float vH;',
    '#include <common>', '#include <logdepthbuf_pars_vertex>',
    'void main(){',
    '  float cxo = mod(iCell, 2.0) * 0.5;',
    '  float cyo = floor(iCell * 0.5) * 0.5;',
    '  vUv = uv * 0.5 + vec2(cxo, cyo);', '  vH = position.y;',   /* G5-rootao: quad y in [0,1], root=0 (geo translated) */
    '  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);',
    '  vFog = -mv.z;',
    '  gl_Position = projectionMatrix * mv;',
    '  #include <logdepthbuf_vertex>',
    '}'
  ].join('\n');
  var fs = [
    'uniform sampler2D map;', 'uniform vec3 uFogColor;', 'uniform float uFogNear;', 'uniform float uFogFar;',
    'uniform float uThermal;', 'uniform vec3 uHeat;', 'uniform vec3 uDayTint;', 'varying float vH;',
    'varying vec2 vUv;', 'varying float vFog;',
    '#include <common>', '#include <logdepthbuf_pars_fragment>',
    'void main(){',
    '  vec4 tx = texture2D(map, vUv);',
    '  if (tx.a < 0.5) discard;',
    '  #include <logdepthbuf_fragment>',
    '  vec3 col = tx.rgb;',
    '  if (uThermal > 0.5) {',            // 热像:统一压到地面档热度,仅保留极轻纹理明暗层次(不高于地面档)
    '    float lum = dot(tx.rgb, vec3(0.299, 0.587, 0.114));',
    '    col = uHeat * (0.85 + 0.30 * lum);',
    '  } else {',                         // R25-T3 昼夜:非热像时乘时态色调×亮度(白天≈1,黄昏微暖,夜晚冷蓝压暗)——与地面受光同步暗下去
    '    col *= uDayTint;',
    '  }',
    '  col *= mix(0.72, 1.0, smoothstep(0.0, 0.38, vH));',   /* G5-rootao: root AO gradient (view-independent grounding; also applies in thermal as colder root) */
    '  float f = smoothstep(uFogNear, uFogFar, vFog);',
    '  gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);',
    '}'
  ].join('\n');
  return new THREE.ShaderMaterial({
    uniforms: uniforms, vertexShader: vs, fragmentShader: fs,
    side: THREE.DoubleSide, transparent: false, depthWrite: true, depthTest: true, fog: false
  });
}
function _billboardFogSync(mat) {
  if (mat && mat.uniforms && scene && scene.fog) {
    mat.uniforms.uFogColor.value.copy(scene.fog.color);
    mat.uniforms.uFogNear.value = scene.fog.near;
    mat.uniforms.uFogFar.value = scene.fog.far;
    // 热像热度同步(全体场景精灵共用同一参数;每帧随 fog 一起写,零额外遍历)
    if (mat.uniforms.uThermal) {
      var on = (typeof thermalActive === 'function' && thermalActive()) ? 1.0 : 0.0;
      mat.uniforms.uThermal.value = on;
      if (on && mat.uniforms.uHeat) mat.uniforms.uHeat.value.setHex(SCENE_SPRITE_HEAT_HEX);
    }
    // R25-T3 昼夜色调同步(全体精灵共用 SCENE_SPRITE_TINT;applyTimeOfDay 事件级写,此处每帧随雾搬运,零额外遍历)
    if (mat.uniforms.uDayTint && typeof SCENE_SPRITE_TINT !== 'undefined') mat.uniforms.uDayTint.value.copy(SCENE_SPRITE_TINT);
  }
}

/* ============================================================
   场景精灵视锥剔除(树/草共用)——把可见半径拉到 3km 后,靠视锥+距离抽稀把实例数封顶:
   · 每帧从相机投影矩阵刷新一次 _spriteFrustum(所有精灵共用,零重复成本);
   · 精灵仅当其包围球落入视锥才实例化 → 只渲玩家画面内的,背面/画面外的转视角再涌现;
   · _spriteThin(距离抽稀):≤full 全渲,→ring 线性抽到 farKeep,用确定性哈希稳定选取(不闪烁)。
   ============================================================ */
var _spriteFrustum = new THREE.Frustum(), _spriteFrMat = new THREE.Matrix4(), _spriteSph = new THREE.Sphere();
var _spriteFrameT = -1;
function _spriteFrustumUpdate() {                       // 每帧至多刷新一次(gameT 门)
  if (!camera) return;
  if (_spriteFrameT === gameT) return;
  _spriteFrameT = gameT;
  camera.updateMatrixWorld();
  _spriteFrMat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _spriteFrustum.setFromProjectionMatrix(_spriteFrMat);
}
function _spriteInView(x, y, z, r) {                    // 包围球在视锥内?(r=精灵半高冗余)
  _spriteSph.center.set(x, y, z); _spriteSph.radius = r;
  return _spriteFrustum.intersectsSphere(_spriteSph);
}
function _spriteThin(idx, d, full, ring, farKeep) {     // 距离抽稀:近全渲,远按 farKeep 保留;确定性(逐株稳定,不闪)
  if (d <= full) return true;
  var keep = 1 - (1 - farKeep) * ((d - full) / (ring - full));   // full→ring 线性从 1 降到 farKeep
  if (keep >= 1) return true;
  if (keep <= 0) return false;
  var h = ((idx * 2654435761) >>> 0) / 4294967296;      // 逐株确定性哈希(与距离无关,稳定选取)
  return h < keep;
}

function _treeKey(ix, iz) { return ix * 100003 + iz; }

/* ============================================================
   R22-T1 场景精灵「区块流式 + 状态增量账本 + 弹坑区不生成」
   —— 生成从「开局一次性建满 ±3200」改为「按 500m 区块惰性流式」:
      · 确定性重生:每格用 hash(gx,gz,salt,seedF) 独立种子 → 任何时候重算逐位一致(deterministic regen,与遍历顺序无关,可分块);
      · 状态增量账本 _spriteDelta:只记「被倒/被炸」的稳定 id(格坐标)→ 卸载后回来按账本重建为「变更后的样子」(该长桩长桩、该空则空);
      · 弹坑区不生成:生成时查 scorchGrid,焦土处不生成任何精灵(弹坑/焦土永久光秃,跨换肤成立);
      · 覆盖足迹:区块随玩家足迹生成 → 远端出生点 / 直升机远程降落点周围也即时长出植被(补全「远处光秃秃」最后一环)。
   数据表 _trees/_grass/_treeGrid/_grassGrid 仍是渲染 / 碾炸查询的活动工作集;
   流式仅在玩家「跨区块」时增量重建(非每帧),渲染 / 阴影 / 碾炸链路无感。内存与生成成本只随足迹增长。
   ============================================================ */
var _SPR_CHUNK = 500;                        // 区块边长(m)
var _SPR_TREE_CR = 7, _SPR_GRASS_CR = 2;     // 保留半径(区块数):树覆盖 ±3.5km(>3km 渲染环),草 ±1km(>700m 环)
var _treeChunks = new Map(), _grassChunks = new Map();   // 区块 key -> [该块精灵对象...](对象引用,rebuild 只重收集不重建)
var _spriteDelta = { tree: new Map(), grass: new Map() };// 稳定 id -> {gone,stump};只记倒/炸,内存随战损增长(非常驻全表)
var _stumpSids = new Set();                  // 已落桩的稳定 id(防区块反复加载重复落桩)
var _sprLastBX = 1e9, _sprLastBZ = 1e9;
function _sprKey(bx, bz) { return (bx + 1024) * 4096 + (bz + 1024); }
function _sprSid(gx, gz, step) { return (((gx / step) | 0) + 4096) * 16384 + (((gz / step) | 0) + 4096); }   // 格坐标→稳定 id(树/草各自 step + delta Map 隔离)
function _sprCellRng(gx, gz, salt) {         // 每格独立确定性随机流(与遍历顺序无关 → 可分块逐位复现)
  var h = (Math.imul(gx | 0, 374761393) + Math.imul(gz | 0, 668265263)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0; h = Math.imul(h, 1274126177) >>> 0;
  h = (h ^ (salt >>> 0) ^ (MAP.seedF >>> 0)) >>> 0;
  return mulberry32(h);
}
/* 焦土强度双线性采样(旧式取最近顶点 → 判定边界本身就是锯齿多边形,正好在过渡带里
   随机放行/拦截:同一条焦土外缘,有的格长草有的格不长,看着像"没炸干净的补丁")。 */
function scorchSampleQ(x, z) {
  if (typeof scorchGrid === 'undefined' || !scorchGrid) return 0;
  var fx = (x + MAP.halfW) / GRID_CELL_X, fz = (z + MAP.halfL) / GRID_CELL_Z;   // 顶点锚定:与 flushCraters/terrainH 同一映射(原 -0.5 为格心相位,差半格)
  var ix = Math.floor(fx), iz = Math.floor(fz);
  if (ix < 0 || iz < 0 || ix >= GRID_N - 1 || iz >= GRID_N - 1) return 0;
  var tx = fx - ix, tz = fz - iz, i00 = iz * GRID_N + ix;
  var a = scorchGrid[i00] * (1 - tx) + scorchGrid[i00 + 1] * tx;
  var b = scorchGrid[i00 + GRID_N] * (1 - tx) + scorchGrid[i00 + GRID_N + 1] * tx;
  return a * (1 - tz) + b * tz;
}
/* 焦土 / 弹坑区判定:命中则不生成。与 scorchClearVegetation 共用同一把 f 尺子 +
   同一套逐格确定性哈希(step 必须传进来,sid 才对得上)—— 焦土上的植被走开再走回来
   不会自己长回来,也不会"上一帧有、这一帧没了"地闪。 */
function _sprInScorch(x, z, gx, gz, step) {
  if (typeof scorchGrid === 'undefined' || !scorchGrid) return false;
  var q = scorchSampleQ(x, z);
  if (q <= 0) return false;
  var p = scorchVegKillP(scorchF(1 - q));
  if (p <= 0) return false;
  if (p >= 1) return true;
  return _sidHash01(_sprSid(gx, gz, step)) < p;
}
function _addStumpFromLedger(x, z, h, cell, sid) {  // 账本重建:回到旧场景,原倒树处静默留桩(flick=0 不再闪)
  _ensureStumpMesh(); if (!_stumpMesh) return;
  var sh = Math.max(1.1, Math.min(1.9, h * 0.13));
  _stumps.push({ x: x, z: z, y: terrainH(x, z), h: sh, w: Math.max(1.4, h * 0.57 * 0.66), cell: cell, flick: 0, sid: (sid != null ? sid : null) });
  if (_stumps.length > _STUMP_MAX_TABLE) _stumps.shift();
  if (typeof bsMarkDirty === 'function') bsMarkDirty('stump');
}
/* 场景精灵区块生成骨架(树 / 草共用)。网格扫描 + 五重过滤:
   地图边界(格心与抖动后落点各判一次)→ 陡坡 → HQ 形变区 → 焦土 / 弹坑区。
   cfg.step     格距(m)                cfg.salt     每格随机流盐值
   cfg.noise    (gx,gz) -> 密度噪声      cfg.pass     (n, rr) -> 是否落生(恰好消耗 1 次 rr())
   cfg.jitter   格内抖动系数              cfg.steepMax 可生成的最大坡度
   cfg.emit     (gx,gz,x,z,rr,STEP) -> 精灵对象 | null(null=被账本抹除)
   ⚠ 契约:rr() 的调用次数与先后顺序参与确定性重生(deterministic regen),
     改动会让同一地图种子长出完全不同的植被。修改 pass/emit 时必须保持 rr() 序列不变。 */
function _genSpriteChunk(bx, bz, cfg) {
  var C = _SPR_CHUNK, STEP = cfg.step, arr = [];
  if (typeof THREE === 'undefined') return arr;
  if (!_tnScratch) _tnScratch = new THREE.Vector3();
  /* ★BUGFIX(矩形地图「场景贴图跑到远景/天空上」):
     旧写法只有一个标量 edge，且取 MAP.bounds(从未被赋值 → 回退 MAP.half = 长度/2) 同时当 X/Z 两轴用。
     12000×7000 图上 X 方向因此被放到 ±5974m，而地面网格只到 ±3500m：实测 26.7%(8053/30164) 的树
     生成在地面三角形之外 —— 底下没有地面、y=terrainH() 落在边缘坡外，看上去就是"贴在远景贴图/天空上"。
     正方形图 halfW==halfL==half，所以这个 bug 只在宽≠长时出现。现改为按轴各自限界。 */
  var edgeX = (CONF.boundsX != null ? CONF.boundsX : (MAP.halfW != null ? MAP.halfW : MAP.half) - 20) - 6;
  var edgeZ = (CONF.boundsZ != null ? CONF.boundsZ : (MAP.halfL != null ? MAP.halfL : MAP.half) - 20) - 6;
  var x0 = bx * C, z0 = bz * C, gx, gz;
  for (gx = Math.ceil(x0 / STEP) * STEP; gx < x0 + C; gx += STEP) {
    if (Math.abs(gx) > edgeX) continue;
    for (gz = Math.ceil(z0 / STEP) * STEP; gz < z0 + C; gz += STEP) {
      if (Math.abs(gz) > edgeZ) continue;
      var n = cfg.noise(gx, gz);
      var rr = _sprCellRng(gx, gz, cfg.salt);
      if (!cfg.pass(n, rr)) continue;
      var x = gx + (rr() - 0.5) * STEP * cfg.jitter, z = gz + (rr() - 0.5) * STEP * cfg.jitter;
      if (Math.abs(x) > edgeX || Math.abs(z) > edgeZ) continue;
      terrainNormal(x, z, _tnScratch);
      if (terrainSteep(_tnScratch.y) > cfg.steepMax) continue;
      if (typeof getHQZoneDeformFactor === 'function' && getHQZoneDeformFactor(x, z) < 0.85) continue;
      if (_sprInScorch(x, z, gx, gz, STEP)) continue;             // 弹坑 / 焦土区不生成(与清除判定逐株同源)
      var o = cfg.emit(gx, gz, x, z, rr, STEP);
      if (o) arr.push(o);
    }
  }
  return arr;
}
var _SPR_TREE_CFG = {                                            // 树:30m 格,缓坡林地,枯树占比减半
  step: 30, salt: 0x7ee5c0de, jitter: 0.9, steepMax: 0.45,
  noise: function (gx, gz) { return hillNoise(gx + 1234, gz - 987, 240); },
  pass: function (n, rr) { return n < 0.52 ? rr() <= 0.04 : rr() <= (0.22 + (n - 0.52) * 1.4); },
  emit: function (gx, gz, x, z, rr, STEP) {
    var h = 5.5 + rr() * 4.5, cell = (rr() * 4) | 0;
    if (cell === 3 && rr() < 0.5) cell = (rr() * 3) | 0;         // 枯树占比减半
    var sid = _sprSid(gx, gz, STEP), d = _spriteDelta.tree.get(sid);
    if (d && d.gone) {                                           // 账本:曾被伐 → 重建为空或留桩(桩只落一次)
      if (d.stump && !_stumpSids.has(sid)) { _stumpSids.add(sid); _addStumpFromLedger(x, z, h, cell, sid); }
      return null;
    }
    return { x: x, z: z, y: terrainH(x, z), h: h, w: h * 0.57, cell: cell,
             phase: rr() * TAU, sway: 0.012 + rr() * 0.02, swsp: 0.8 + rr() * 0.6,
             state: 0, ft: 0, fdir: rr() < 0.5 ? -1 : 1, sid: sid };
  }
};
var _SPR_GRASS_CFG = {                                           // 草:22m 格,容坡更大,无留桩账本
  step: 22, salt: 0x9155aa77, jitter: 0.95, steepMax: 0.6,
  noise: function (gx, gz) { return hillNoise(gx - 640, gz + 410, 150); },
  pass: function (n, rr) { return n < 0.44 ? rr() <= 0.10 : rr() <= (0.40 + (n - 0.44) * 1.5); },
  emit: function (gx, gz, x, z, rr, STEP) {
    var h = 1.1 + rr() * 1.3, cell = (rr() * 4) | 0;
    var sid = _sprSid(gx, gz, STEP), d = _spriteDelta.grass.get(sid);
    if (d && d.gone) return null;                                // 账本:曾被炸没 → 不重建
    return { x: x, z: z, y: terrainH(x, z), h: h, w: h * (1.15 + rr() * 0.4), cell: cell,
             phase: rr() * TAU, sway: 0.05 + rr() * 0.05, swsp: 1.1 + rr() * 0.8,
             state: 0, vt: 0, shk: 0, shph: rr() * TAU, shdir: rr() < 0.5 ? -1 : 1, sid: sid };
  }
};
function _genTreeChunk(bx, bz)  { return _genSpriteChunk(bx, bz, _SPR_TREE_CFG); }
function _genGrassChunk(bx, bz) { return _genSpriteChunk(bx, bz, _SPR_GRASS_CFG); }
function _rebuildTreeTable() {                // 从当前加载区块重收集活动表 + 空间哈希(仅跨区块时调用)
  _trees.length = 0; _treeGrid = new Map();
  _treeChunks.forEach(function (a) {
    for (var i = 0; i < a.length && _trees.length < _TREE_MAX; i++) {
      var tr = a[i]; _trees.push(tr);
      var ix = Math.floor(tr.x / _treeCELL), iz = Math.floor(tr.z / _treeCELL), key = _treeKey(ix, iz);
      var b = _treeGrid.get(key); if (!b) { b = []; _treeGrid.set(key, b); } b.push(_trees.length - 1);
    }
  });
  if (_bsProviders && _bsProviders.tree) _bsProviders.tree.list = _trees;
  if (typeof bsMarkDirty === 'function') bsMarkDirty('tree');
}
function _rebuildGrassTable() {
  _grass.length = 0; _grassGrid = new Map();
  _grassChunks.forEach(function (a) {
    for (var i = 0; i < a.length && _grass.length < _GRASS_MAX; i++) {
      var gr = a[i]; _grass.push(gr);
      var ix = Math.floor(gr.x / _grassCELL), iz = Math.floor(gr.z / _grassCELL), key = _treeKey(ix, iz);
      var b = _grassGrid.get(key); if (!b) { b = []; _grassGrid.set(key, b); } b.push(_grass.length - 1);
    }
  });
  if (_grassFalling.length) {                 // 清理已卸载区块残留在下落队列的草(防泄漏;正常卸载远离下落点极少触发)
    var live = new Set(_grass);
    for (var fi = _grassFalling.length - 1; fi >= 0; fi--) if (!live.has(_grassFalling[fi])) _grassFalling.splice(fi, 1);
  }
  if (_bsProviders && _bsProviders.grass) _bsProviders.grass.list = _grass;
  if (typeof bsMarkDirty === 'function') bsMarkDirty('grass');
}
function _sprStream(px, pz) {                 // 每帧调用:未跨区块零成本;跨区块才增量加载 / 卸载 + 重建
  if (!_treeMesh || typeof THREE === 'undefined') return;
  var C = _SPR_CHUNK, pbx = Math.floor(px / C), pbz = Math.floor(pz / C);
  if (pbx === _sprLastBX && pbz === _sprLastBZ) return;
  _sprLastBX = pbx; _sprLastBZ = pbz;
  var tch = false, gch = false, bx, bz, k, drop = [], i;
  for (bx = pbx - _SPR_TREE_CR; bx <= pbx + _SPR_TREE_CR; bx++)
    for (bz = pbz - _SPR_TREE_CR; bz <= pbz + _SPR_TREE_CR; bz++) {
      k = _sprKey(bx, bz); if (!_treeChunks.has(k)) { _treeChunks.set(k, _genTreeChunk(bx, bz)); tch = true; }
    }
  _treeChunks.forEach(function (a, key) {
    var cbx = ((key / 4096) | 0) - 1024, cbz = (key % 4096) - 1024;
    if (Math.abs(cbx - pbx) > _SPR_TREE_CR + 1 || Math.abs(cbz - pbz) > _SPR_TREE_CR + 1) drop.push(key);
  });
  for (i = 0; i < drop.length; i++) { _treeChunks.delete(drop[i]); tch = true; }
  drop.length = 0;
  for (bx = pbx - _SPR_GRASS_CR; bx <= pbx + _SPR_GRASS_CR; bx++)
    for (bz = pbz - _SPR_GRASS_CR; bz <= pbz + _SPR_GRASS_CR; bz++) {
      k = _sprKey(bx, bz); if (!_grassChunks.has(k)) { _grassChunks.set(k, _genGrassChunk(bx, bz)); gch = true; }
    }
  _grassChunks.forEach(function (a, key) {
    var cbx = ((key / 4096) | 0) - 1024, cbz = (key % 4096) - 1024;
    if (Math.abs(cbx - pbx) > _SPR_GRASS_CR + 1 || Math.abs(cbz - pbz) > _SPR_GRASS_CR + 1) drop.push(key);
  });
  for (i = 0; i < drop.length; i++) { _grassChunks.delete(drop[i]); gch = true; }
  if (tch) _rebuildTreeTable();
  if (gch) _rebuildGrassTable();
}
function _sprStreamReset() {                  // 开局重建:清空流式与账本(新地图=新种子,旧 sid 无意义)
  _treeChunks.clear(); _grassChunks.clear();
  _spriteDelta.tree.clear(); _spriteDelta.grass.clear(); _stumpSids.clear();
  _sprLastBX = 1e9; _sprLastBZ = 1e9;
}

/* ===== 2×2 精灵图集共用工装(树 / 树桩 / 草 三张图集结构同构)=====
   流程一致:方形 POT 画布 → 四格逐格裁剪绘制 → 瓦楞纸纹压色收尾 → Clamp 贴图。
   逐格裁剪不可省:圆头笔帽与枝桠会越过格边界渗进相邻格,采样时表现为悬浮残片。 */
function _sprAtlasCanvas(size) {                        // 建方形图集画布;无 DOM 环境返回 null
  var a = make2DCanvas(size); if (!a) return null;
  a.g.clearRect(0, 0, size, size); a.g.lineJoin = 'round'; a.g.lineCap = 'round';
  return a;
}
function _sprCell(g, cell, cx0, cy0, fn) {              // 单格裁剪作用域内绘制
  g.save(); g.beginPath(); g.rect(cx0, cy0, cell, cell); g.clip(); fn(); g.restore();
}
/* 瓦楞纸纹 + 米黄压色(source-atop 只作用于已绘不透明像素 = 纸板质感),再出图集贴图。
   y0/step=横纹起点与行距,line=纹路色,wash=整体压色。 */
function _sprPaperTex(cv, g, y0, step, line, wash) {
  var size = cv.width;
  g.globalCompositeOperation = 'source-atop';
  g.strokeStyle = line; g.lineWidth = 2;
  for (var yy = y0; yy < size; yy += step) { g.beginPath(); g.moveTo(0, yy); g.lineTo(size, yy); g.stroke(); }
  g.fillStyle = wash; g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'source-over';
  var t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;        // 图集必须 Clamp:Repeat 会让边缘格互相渗色
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true;
  if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
  return t;
}

function _treeMakeTex() {
  if (_treeTex) return _treeTex;
  var _a = _sprAtlasCanvas(512); if (!_a) return null;
  var cv = _a.cv, g = _a.g;
  var INK = '#16130c';                       // ★v2 全图集统一墨线(暖黑)
  function circ(x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  function blade(x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  function woodGrain(x0, y0, x1, y1, col) {  // 干身竖向木纹(手绘感短笔触)
    g.strokeStyle = col; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  }
  function broad(cxp, gY, green, greenD, bark, accent) {  // 圆冠阔叶 · 军事漫画版
    // —— 墨线冠(整体放大一圈,与原版同法) ——
    g.fillStyle = INK;
    g.fillRect(cxp - 15, gY - 88, 30, 92);
    circ(cxp, gY - 150, 54); circ(cxp - 26, gY - 118, 40); circ(cxp + 26, gY - 118, 40); circ(cxp, gY - 192, 40);
    // —— 树干:基底 + 侧影 + 木纹线 + 节疤 ——
    g.fillStyle = bark; g.fillRect(cxp - 9, gY - 86, 18, 86);
    g.fillStyle = 'rgba(0,0,0,0.26)'; g.fillRect(cxp + 1, gY - 86, 8, 86);
    woodGrain(cxp - 5, gY - 78, cxp - 5, gY - 14, 'rgba(30,20,8,0.35)');
    woodGrain(cxp + 4, gY - 80, cxp + 4, gY - 18, 'rgba(0,0,0,0.22)');
    g.fillStyle = 'rgba(24,16,6,0.5)'; circ(cxp + 3, gY - 58, 1.7);
    // —— 树冠色阶:主色 + 暗部 + 叶簇间隙(以 INK 小洞模拟叶间透空)→ 平涂硬边 ——
    g.fillStyle = green;
    circ(cxp, gY - 150, 48); circ(cxp - 26, gY - 118, 34); circ(cxp + 26, gY - 118, 34); circ(cxp, gY - 192, 34);
    g.fillStyle = greenD;                      // 底部阴影区(向深灰绿,不向艳色)
    circ(cxp - 30, gY - 108, 27); circ(cxp + 28, gY - 110, 25); circ(cxp, gY - 122, 30);
    circ(cxp, gY - 92, 15);
    g.fillStyle = 'rgba(0,0,0,0.16)';          // 叶簇间隙:墨点=透空感
    circ(cxp - 38, gY - 128, 6); circ(cxp + 40, gY - 130, 5); circ(cxp - 22, gY - 196, 4.5);
    circ(cxp + 30, gY - 178, 4); circ(cxp - 8, gY - 170, 4);
    g.fillStyle = accent;                      // 顶部受光簇(低饱和浅橄榄)
    circ(cxp - 18, gY - 182, 12); circ(cxp - 30, gY - 158, 8); circ(cxp + 8, gY - 190, 7);
  }
  function conif(cxp, gY) {                    // 针叶三层 · 军漫硬边 + 阴影侧排线感
    g.fillStyle = INK; g.fillRect(cxp - 11, gY - 56, 22, 60);
    g.fillStyle = '#4e4436'; g.fillRect(cxp - 6, gY - 54, 12, 54);   // 深松干
    woodGrain(cxp, gY - 50, cxp, gY - 6, 'rgba(20,12,4,0.4)');
    function tri(yb, yt, hw, col) { g.fillStyle = col; g.beginPath(); g.moveTo(cxp, yt); g.lineTo(cxp - hw, yb); g.lineTo(cxp + hw, yb); g.closePath(); g.fill(); }
    tri(gY - 40, gY - 120, 66, INK); tri(gY - 95, gY - 170, 56, INK); tri(gY - 140, gY - 214, 44, INK);
    tri(gY - 46, gY - 116, 58, '#263d2d'); tri(gY - 99, gY - 165, 49, '#324c3a'); tri(gY - 143, gY - 208, 38, '#425e4b');
    g.fillStyle = 'rgba(0,0,0,0.20)';          // 背光侧(右下):平涂硬阴影
    g.beginPath(); g.moveTo(cxp, gY - 116); g.lineTo(cxp, gY - 46); g.lineTo(cxp - 40, gY - 46); g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.13)'; g.beginPath(); g.moveTo(cxp, gY - 46); g.lineTo(cxp, gY - 40); g.lineTo(cxp - 58, gY - 46); g.closePath(); g.fill();
    // 右下斜排线(近漫画 kakeami 的廉价实现:逐条短斜线)
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1.4;
    for (var k = 1; k <= 4; k++) { var yy = gY - 40 - k * 17; g.beginPath(); g.moveTo(cxp + 2, yy); g.lineTo(cxp + 2 + (50 - k * 11), yy + 12); g.stroke(); }
  }
  function dead(cxp, gY) {                     // 焦木枯树 · 战场枯木(墨线 + 焦枝 + 断口亮木)
    function limb(x0, y0, x1, y1, wO, wC) {
      g.strokeStyle = INK; g.lineWidth = wO; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.strokeStyle = '#524d46'; g.lineWidth = wC; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.strokeStyle = 'rgba(205,190,150,0.10)'; g.lineWidth = Math.max(1.2, wC * 0.22);
      g.beginPath(); g.moveTo(x0 - wC * 0.14, y0 - wC * 0.14); g.lineTo(x1 - wC * 0.14, y1 - wC * 0.14); g.stroke();
    }
    limb(cxp, gY, cxp, gY - 150, 26, 15);
    limb(cxp, gY - 90, cxp - 46, gY - 150, 16, 8); limb(cxp, gY - 110, cxp + 44, gY - 160, 16, 8);
    limb(cxp, gY - 140, cxp - 30, gY - 196, 12, 5); limb(cxp, gY - 140, cxp + 26, gY - 192, 12, 5);
    limb(cxp - 46, gY - 150, cxp - 64, gY - 182, 9, 4); limb(cxp + 44, gY - 160, cxp + 62, gY - 190, 9, 4);
    // 焦炭段:右侧枝干中段叠焦黑(断/战损感;压 α 保持枝形可读)
    g.strokeStyle = 'rgba(30,25,16,0.35)'; g.lineWidth = 8;
    g.beginPath(); g.moveTo(cxp + 6, gY - 120); g.lineTo(cxp + 30, gY - 152); g.stroke();
    g.lineWidth = 5; g.beginPath(); g.moveTo(cxp - 2, gY - 66); g.lineTo(cxp - 30, gY - 112); g.stroke();
    // 断口亮木(左上枝端):炮击/风折断面
    g.fillStyle = INK; circ(cxp - 62, gY - 186, 6.5);
    g.fillStyle = '#a99c7e'; circ(cxp - 62, gY - 186, 4);
    // 焦痕斑(干身)
    g.fillStyle = 'rgba(24,20,13,0.5)';
    g.beginPath(); g.ellipse(cxp + 4, gY - 26, 7, 9, 0.4, 0, TAU); g.fill();
  }
  function inCell(cx0, cy0, fn) { _sprCell(g, 256, cx0, cy0, fn); }
  // 配色 4 格对应生境同前(0/1 阔叶、2 针叶、3 焦木);色板=军事漫画(低饱和橄榄/卡其/焦灰褐)
  inCell(0, 256, function () { broad(128, 512, '#5d704f', '#364729', '#665443', '#6e8062'); });    // 阔叶·军绿
  inCell(256, 256, function () { broad(384, 512, '#626946', '#3c4224', '#6b5d4b', '#757b5c'); });  // 阔叶·卡其
  inCell(0, 0, function () { conif(128, 256); });                                                  // 针叶·深松
  inCell(256, 0, function () { dead(384, 256); });                                                 // 焦木
  // ★v2 纸张底纹:暖黄 wash 撤除 → 中性印刷灰纹(漫画原稿纸/印刷网点感,强度更低)
  _treeTex = _sprPaperTex(cv, g, 6, 7, 'rgba(56,50,38,0.10)', 'rgba(120,112,88,0.03)');
  return _treeTex;
}

function _treeDispose() {
  if (_treeMesh && scene) scene.remove(_treeMesh);
  if (_treeGeo && _treeGeo.dispose) _treeGeo.dispose();
  if (_treeMat && _treeMat.dispose) _treeMat.dispose();
  _treeMesh = null; _treeGeo = null; _treeMat = null; _treeCellAttr = null;
  _trees.length = 0; _treeGrid = null;        // _treeTex 缓存复用(确定性同图集)
}

function buildTrees() {
  _treeDispose();
  if (!scene || typeof THREE === 'undefined') return;
  var tex = _treeMakeTex(); if (!tex) return;                 // 无头环境无 2D canvas → 跳过
  _tEuler = new THREE.Euler(); _tQuat = new THREE.Quaternion();
  _tPos = new THREE.Vector3(); _tScl = new THREE.Vector3(); _tMat = new THREE.Matrix4();
  _tnScratch = new THREE.Vector3();
  _treeGeo = new THREE.PlaneGeometry(1, 1); _treeGeo.translate(0, 0.5, 0);   // 轴心贴地(y∈[0,1])
  var cellArr = new Float32Array(_TREE_CAP);
  _treeCellAttr = new THREE.InstancedBufferAttribute(cellArr, 1).setUsage(THREE.DynamicDrawUsage);
  _treeGeo.setAttribute('iCell', _treeCellAttr);
  _treeMat = _billboardMat(tex);
  _treeMesh = new THREE.InstancedMesh(_treeGeo, _treeMat, _TREE_CAP);
  _treeMesh.count = 0; _treeMesh.visible = false; _treeMesh.frustumCulled = false;
  _treeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(_treeMesh);
  // —— R22-T1:改为区块流式确定性生成(不再开局建满全表)——
  // 表 / 空间哈希由 _sprStream 随玩家足迹增量重建;此处仅清空并注册阴影来源,首帧 _sprStream 即填充玩家周围区块。
  _trees.length = 0; _treeGrid = new Map();
  if (typeof window !== 'undefined') window.__treeDbg = function () {   // 控制台自检:__treeDbg()
    return { total: _trees.length, drawn: _treeMesh ? _treeMesh.count : -1,
             visible: _treeMesh ? _treeMesh.visible : false,
             progErr: (_treeMat && _treeMat.program && _treeMat.program.diagnostics) || null };
  };
  // 烘焙式阴影:注册立树来源(仅 state===0 直立树投影;倒/没的不投)。剪影取自树图集自身 alpha → 阴影与卡通外形吻合
  if (typeof bsRegister === 'function') {
    bsRegister('tree', _trees, { tex: tex, cellOf: function (t) { return t.cell; }, filter: function (t) { return t.state === 0; }, wScale: 1.0, lScale: 0.6, throttle: 0.2 });   /* G4-decal: bound rebake rate during bombardment (same as stump/grass) */
    bakeSpriteShadows('tree');
  }
}

/* 局部倒树(碾/炸/擦共用):空间哈希邻域查询,立树进入 dist≤r 即置\"倒下\"。
   leaveStump: 倒完后是否原地留桩(碾/炮弹=true;爆炸=false)。 */
function collectTreesFell(x, z, r, leaveStump) {
  if (!_treeGrid) return;
  var r2 = r * r, nn = Math.ceil(r / _treeCELL), cx = Math.floor(x / _treeCELL), cz = Math.floor(z / _treeCELL);
  for (var ix = cx - nn; ix <= cx + nn; ix++) for (var iz = cz - nn; iz <= cz + nn; iz++) {
    var b = _treeGrid.get(_treeKey(ix, iz)); if (!b) continue;
    for (var j = 0; j < b.length; j++) {
      var tr = _trees[b[j]]; if (!tr || tr.state !== 0) continue;
      var dx = tr.x - x, dz = tr.z - z;
      if (dx * dx + dz * dz <= r2) { tr.state = 1; tr.ft = 0; tr.stump = !!leaveStump; }
    }
  }
}
function fellTreesInRadius(x, z, r) { collectTreesFell(x, z, r, false); }   // 爆炸波及(不留桩)
function treesSegBrush(x0, z0, x1, z1) {                              // 炮弹沿飞行段擦中(直击穿过;留桩)
  if (!_treeGrid) return;
  var dx = x1 - x0, dz = z1 - z0, L = Math.sqrt(dx * dx + dz * dz), steps = Math.max(1, Math.ceil(L / 4));
  for (var i = 0; i <= steps; i++) { var f = i / steps; collectTreesFell(x0 + dx * f, z0 + dz * f, 1.7, true); }
}
function treesRunOverScan() {                                        // 载具碾压(留桩)
  if (!_treeGrid || !aliveList) return;
  for (var i = 0; i < aliveList.length; i++) {
    var t = aliveList[i]; if (!t || !t.alive || !t.group) continue;
    var px = t.group.position.x, pz = t.group.position.z;
    if (isHeliVehicle(t) && (t.group.position.y - terrainH(px, pz)) > 2.2) continue;   // 直升机离地不碾
    if (t._troX != null) {                            // ★审查B7: 位移门——自上次碾压扫描位移 <0.4m 跳过(静止车队每步 0 次格查询; 0.4m 采样下碾半径收窄 ≤0.2m, 树干半径量级、不可感)
      var _ddx = px - t._troX, _ddz = pz - t._troZ;
      if (_ddx * _ddx + _ddz * _ddz < 0.16) continue;
    }
    t._troX = px; t._troZ = pz;
    collectTreesFell(px, pz, (t.radius || 2.2) * 0.85, true);
  }
}

/* 每渲染帧:推进倒地计时(全表)+ 面向相机 billboard 合成(仅可见环内)。相机定稿后调用。 */
function treesUpdate(dt) {
  if (!_treeMesh || !camera) return;
  _billboardFogSync(_treeMat);                                       // 雾同步(随 NV/热成像/黄昏变化)
  _spriteFrustumUpdate();                                            // 刷新共用视锥(每帧一次)
  var camX = camera.position.x, camZ = camera.position.z, ring2 = _TREE_RING * _TREE_RING, out = 0;
  for (var i = 0; i < _trees.length; i++) {
    var tr = _trees[i];
    if (tr.state === 2) continue;
    if (tr.state === 1) { tr.ft += dt / 0.62; if (tr.ft >= 1) { tr.state = 2; if (tr.stump) { _spawnStump(tr); if (tr.sid != null) _stumpSids.add(tr.sid); } if (tr.sid != null && _spriteDelta) _spriteDelta.tree.set(tr.sid, { gone: 1, stump: tr.stump ? 1 : 0 }); if (typeof bsMarkDirty === 'function') bsMarkDirty('tree'); continue; } }  // 全表推进,离环外也倒完;倒完→记账本(卸载后回来仍为空/桩)+树影事件级重烘焙
    if (out >= _TREE_CAP) continue;
    var dx = tr.x - camX, dz = tr.z - camZ, d2 = dx * dx + dz * dz;
    if (d2 > ring2) continue;
    var d = Math.sqrt(d2);
    if (!_spriteThin(i, d, _TREE_FULL, _TREE_RING, _TREE_FARKEEP)) continue;   // 远处按距离抽稀(封顶实例数)
    if (!_spriteInView(tr.x, tr.y + tr.h * 0.5, tr.z, tr.h * 0.6)) continue;   // 视锥剔除:只渲画面内的树
    var lod = d > _TREE_RING - _TREE_FADE ? (1 - (d - (_TREE_RING - _TREE_FADE)) / _TREE_FADE) : 1;
    if (lod <= 0.02) continue;
    var tilt, sc = 1;
    if (tr.state === 1) {
      tilt = tr.fdir * (0.05 + 1.45 * Math.min(1, tr.ft / 0.85));     // 倾倒到 ~85%
      if (tr.ft > 0.75) sc = 1 - (tr.ft - 0.75) / 0.25;               // 末 1/4 缩没
    } else {
      tilt = tr.sway * Math.sin(gameT * tr.swsp + tr.phase);          // 立树微摆
    }
    var yaw = Math.atan2(camX - tr.x, camZ - tr.z);                   // 绕竖轴面向玩家
    _tEuler.set(tilt, yaw, 0, 'YXZ'); _tQuat.setFromEuler(_tEuler);
    var s = sc * lod;
    _tPos.set(tr.x, tr.y, tr.z); _tScl.set(tr.w * s, tr.h * s, 1);
    _tMat.compose(_tPos, _tQuat, _tScl);
    _treeMesh.setMatrixAt(out, _tMat);
    _treeCellAttr.array[out] = tr.cell;
    out++;
  }
  _treeMesh.count = out; _treeMesh.visible = out > 0;
  if (out) { _treeMesh.instanceMatrix.needsUpdate = true; _treeCellAttr.needsUpdate = true; }
}

/* ============================================================
   树桩(纸板风格):树被碾/炮弹擦倒并缩没后原地留桩;爆炸倒树不留桩。
   刚生成时闪烁一下(flick 计时驱动亮度脉冲)。单 InstancedMesh,billboard 面向相机。
   ============================================================ */
function _stumpMakeTex() {
  if (_stumpTex) return _stumpTex;
  var _a = _sprAtlasCanvas(256); if (!_a) return null;
  var cv = _a.cv, g = _a.g;
  function inCell(cx0, cy0, fn) { _sprCell(g, 128, cx0, cy0, fn); }
  // 一株树桩:短粗断干 + 顶面年轮椭圆 + 参差断口墨边。gY=格底,cxp=格心。
  function stump(cxp, gY, barkO, bark, ringC, topC, jagged) {
    var w = 34, h = 40;
    g.fillStyle = barkO; g.beginPath();
    g.moveTo(cxp - w / 2 - 4, gY - 2);
    g.lineTo(cxp - w / 2 - 4, gY - h + 4);
    g.quadraticCurveTo(cxp, gY - h - (jagged ? 14 : 6), cxp + w / 2 + 4, gY - h + 4);
    g.lineTo(cxp + w / 2 + 4, gY - 2);
    g.closePath(); g.fill();
    g.fillStyle = bark; g.beginPath();
    g.moveTo(cxp - w / 2, gY - 3);
    g.lineTo(cxp - w / 2, gY - h + 5);
    g.quadraticCurveTo(cxp, gY - h - (jagged ? 9 : 3), cxp + w / 2, gY - h + 5);
    g.lineTo(cxp + w / 2, gY - 3);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(cxp + 4, gY - h + 6, w / 2 - 4, h - 6);
    // 树皮竖向裂纹 + 碳化下缘(★v2)
    g.strokeStyle = 'rgba(30,20,10,0.4)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(cxp - 8, gY - 34); g.lineTo(cxp - 9, gY - 8); g.stroke();
    g.beginPath(); g.moveTo(cxp + 8, gY - h + 8); g.lineTo(cxp + 10, gY - 12); g.stroke();
    g.fillStyle = 'rgba(20,16,10,0.35)';
    g.beginPath(); g.ellipse(cxp + 10, gY - 8, 9, 3, 0, 0, TAU); g.fill();
    // 顶面(浅椭圆)+ 年轮 + 裂纹(断面)
    g.fillStyle = barkO; g.beginPath(); g.ellipse(cxp, gY - h + 4, w / 2 + 3, 10, 0, 0, TAU); g.fill();
    g.fillStyle = topC;  g.beginPath(); g.ellipse(cxp, gY - h + 4, w / 2, 8, 0, 0, TAU); g.fill();
    g.strokeStyle = ringC; g.lineWidth = 2;
    g.beginPath(); g.ellipse(cxp, gY - h + 4, w / 2 - 6, 5.2, 0, 0, TAU); g.stroke();
    g.beginPath(); g.ellipse(cxp, gY - h + 4, w / 2 - 12, 3.0, 0, 0, TAU); g.stroke();
    g.strokeStyle = ringC; g.lineWidth = 1;
    g.beginPath(); g.ellipse(cxp, gY - h + 4, w / 2 - 2, 7.2, 0, 0, TAU); g.stroke();   // 边缘生长轮(新)
    // 断面径向裂纹(★v2):由心向边的两条短墨线
    g.strokeStyle = 'rgba(50,36,18,0.55)'; g.lineWidth = 1.3;
    g.beginPath(); g.moveTo(cxp, gY - h + 4); g.lineTo(cxp + 12, gY - h + 1); g.stroke();
    g.beginPath(); g.moveTo(cxp, gY - h + 4); g.lineTo(cxp - 9, gY - h + 7); g.stroke();
    g.fillStyle = ringC; g.beginPath(); g.arc(cxp, gY - h + 4, 1.6, 0, TAU); g.fill();
  }
  // 4 格与树图集配色对应:0/1 阔叶(军褐)、2 针叶(深松褐)、3 焦枯(灰褐+碳化)
  inCell(0, 128, function () { stump(64, 254, '#16130c', '#665545', '#423326', '#b8a588', false); });
  inCell(128, 128, function () { stump(192, 254, '#16130c', '#6b624d', '#473e2c', '#b2a788', false); });
  inCell(0, 0, function () { stump(64, 126, '#16130c', '#5c493b', '#3d2d22', '#ad957d', false); });
  inCell(128, 0, function () { stump(192, 126, '#16130c', '#57524e', '#423e39', '#a39c93', true); });
  _stumpTex = _sprPaperTex(cv, g, 4, 6, 'rgba(56,50,38,0.10)', 'rgba(120,112,88,0.03)');
  return _stumpTex;
}
function _stumpDispose() {
  if (_stumpMesh && scene) scene.remove(_stumpMesh);
  if (_stumpGeo && _stumpGeo.dispose) _stumpGeo.dispose();
  if (_stumpMat && _stumpMat.dispose) _stumpMat.dispose();
  _stumpMesh = null; _stumpGeo = null; _stumpMat = null; _stumpCellAttr = null;
  _stumps.length = 0;                          // _stumpTex 缓存复用
}
function _ensureStumpMesh() {
  if (_stumpMesh || !scene || typeof THREE === 'undefined') return;
  var tex = _stumpMakeTex(); if (!tex) return;
  _stumpGeo = new THREE.PlaneGeometry(1, 1); _stumpGeo.translate(0, 0.5, 0);
  var cellArr = new Float32Array(_STUMP_CAP);
  _stumpCellAttr = new THREE.InstancedBufferAttribute(cellArr, 1).setUsage(THREE.DynamicDrawUsage);
  _stumpGeo.setAttribute('iCell', _stumpCellAttr);
  _stumpMat = _billboardMat(tex);
  _stumpMesh = new THREE.InstancedMesh(_stumpGeo, _stumpMat, _STUMP_CAP);
  _stumpMesh.count = 0; _stumpMesh.visible = false; _stumpMesh.frustumCulled = false;
  _stumpMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(_stumpMesh);
  if (typeof bsRegister === 'function') bsRegister('stump', _stumps, { tex: tex, cellOf: function (s) { return s.cell; }, wScale: 0.9, lScale: 0.85, throttle: 0.2 });  // 树桩阴影来源:剪影取自树桩图集自身 alpha
}
function _spawnStump(tr) {
  _ensureStumpMesh();
  if (!_stumpMesh) return;
  // 树桩尺寸:与树同宽,矮墩(约树高 8%,钳 1.1~1.9m)。flick=闪烁计时(初生 0.45s)。
  var sh = Math.max(1.1, Math.min(1.9, tr.h * 0.13));
  /* 6b: 带 sid —— 树桩被焦土清除时要能同步清账本(_spriteDelta.tree[sid].stump=0 +
     _stumpSids.delete), 否则区块卸载重载后这根桩会原地长回来。 */
  _stumps.push({ x: tr.x, z: tr.z, y: tr.y, h: sh, w: Math.max(1.4, tr.w * 0.66), cell: tr.cell, flick: 0.45, sid: (tr.sid != null ? tr.sid : null) });
  if (_stumps.length > _STUMP_MAX_TABLE) _stumps.shift();   // 老树桩滚动淘汰(防表无限增长)
  if (typeof bsMarkDirty === 'function') bsMarkDirty('stump');   // 新桩出现 → 树桩阴影事件级重烘焙(节流合并)
}
var _STUMP_MAX_TABLE = 1400;
function stumpsUpdate(dt) {
  if (!_stumpMesh || !camera || !_stumps.length) { if (_stumpMesh) { _stumpMesh.count = 0; _stumpMesh.visible = false; } return; }
  _billboardFogSync(_stumpMat);
  var camX = camera.position.x, camZ = camera.position.z, ring2 = _STUMP_RING * _STUMP_RING, out = 0;
  for (var i = 0; i < _stumps.length; i++) {
    var st = _stumps[i];
    if (st.flick > 0) st.flick = Math.max(0, st.flick - dt);
    if (out >= _STUMP_CAP) continue;
    var dx = st.x - camX, dz = st.z - camZ, d2 = dx * dx + dz * dz;
    if (d2 > ring2) continue;
    var d = Math.sqrt(d2);
    var lod = d > _STUMP_RING - _STUMP_FADE ? (1 - (d - (_STUMP_RING - _STUMP_FADE)) / _STUMP_FADE) : 1;
    if (lod <= 0.02) continue;
    // 初生闪烁:flick 期间用缩放脉冲(0.45s 内 2 次弹跳),漫画\"叮\"的一下
    var pulse = 1;
    if (st.flick > 0) { var fp = 1 - st.flick / 0.45; pulse = 1 + 0.5 * Math.sin(fp * Math.PI * 2.0) * (1 - fp); }
    var yaw = Math.atan2(camX - st.x, camZ - st.z);
    _tEuler.set(0, yaw, 0, 'YXZ'); _tQuat.setFromEuler(_tEuler);
    var s = lod;
    _tPos.set(st.x, st.y, st.z); _tScl.set(st.w * s, st.h * s * pulse, 1);
    _tMat.compose(_tPos, _tQuat, _tScl);
    _stumpMesh.setMatrixAt(out, _tMat);
    _stumpCellAttr.array[out] = st.cell;
    out++;
  }
  _stumpMesh.count = out; _stumpMesh.visible = out > 0;
  if (out) { _stumpMesh.instanceMatrix.needsUpdate = true; _stumpCellAttr.needsUpdate = true; }
}

/* ============================================================
   纸板花草丛:多种类漫画贴图(草簇/开花草丛/蕨叶/枯黄草)。
   · 仅爆炸冲击可摧毁(倒下缩没);玩家攻击不摧毁,只\"抖动\"。
   · 玩家专属物理反馈(仅 player 触发):炮弹擦过 / 载具碾压 / 直升机低空掠过 → 卡通抖动(顶部横向摆动+压扁变形)。
   · 单 InstancedMesh,billboard 面向相机;抖动用 shk 计时驱动顶点偏移与压扁。
   ============================================================ */
function _grassMakeTex() {
  if (_grassTex) return _grassTex;
  var _a = _sprAtlasCanvas(512); if (!_a) return null;
  var cv = _a.cv, g = _a.g;
  function inCell(cx0, cy0, fn) { _sprCell(g, 256, cx0, cy0, fn); }
  // 一片草叶(带墨边):从根 (x0,gY) 弯向叶尖。
  function blade(x0, gY, tipx, tipy, wBase, col, colO) {
    var cxm = (x0 + tipx) / 2 + (tipx - x0) * 0.15;
    g.fillStyle = colO; g.beginPath();
    g.moveTo(x0 - wBase / 2 - 2, gY);
    g.quadraticCurveTo(cxm - 3, (gY + tipy) / 2, tipx, tipy);
    g.quadraticCurveTo(cxm + 3, (gY + tipy) / 2, x0 + wBase / 2 + 2, gY);
    g.closePath(); g.fill();
    g.fillStyle = col; g.beginPath();
    g.moveTo(x0 - wBase / 2, gY);
    g.quadraticCurveTo(cxm, (gY + tipy) / 2, tipx, tipy);
    g.quadraticCurveTo(cxm, (gY + tipy) / 2, x0 + wBase / 2, gY);
    g.closePath(); g.fill();
  }
  function tuft(cxp, gY, col, colD, colO) {                 // 草簇(军事漫画:刃直、簇底收拢)
    // 簇根聚拢阴影(新):让草"从土里长出来"
    g.fillStyle = 'rgba(10,12,6,0.20)';
    g.beginPath(); g.ellipse(cxp, gY - 4, 46, 10, 0, 0, TAU); g.fill();
    blade(cxp - 30, gY, cxp - 54, gY - 150, 20, colD, colO);
    blade(cxp + 30, gY, cxp + 56, gY - 146, 20, colD, colO);
    blade(cxp - 14, gY, cxp - 24, gY - 196, 22, col, colO);
    blade(cxp + 16, gY, cxp + 30, gY - 190, 22, col, colO);
    blade(cxp, gY, cxp + 2, gY - 214, 24, col, colO);
    // 少量枯尖/叶脉(手绘感)
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(cxp + 14, gY - 60); g.lineTo(cxp + 22, gY - 170); g.stroke();
    g.strokeStyle = 'rgba(240,235,190,0.12)';
    g.beginPath(); g.moveTo(cxp - 12, gY - 50); g.lineTo(cxp - 20, gY - 180); g.stroke();
  }
  function flowers(cxp, gY, col, colD, colO, petal, core) { // 战地野花(低饱和罂粟)
    tuft(cxp, gY, col, colD, colO);
    var spots = [[cxp - 40, gY - 150], [cxp + 44, gY - 140], [cxp - 6, gY - 205], [cxp + 22, gY - 178], [cxp - 26, gY - 120]];
    for (var i = 0; i < spots.length; i++) {
      var sx = spots[i][0], sy = spots[i][1];
      g.fillStyle = '#211a10'; g.beginPath(); g.arc(sx, sy, 12.5, 0, TAU); g.fill();
      g.fillStyle = petal;
      for (var k = 0; k < 5; k++) { var a = k / 5 * TAU + i; g.beginPath(); g.arc(sx + Math.cos(a) * 6.5, sy + Math.sin(a) * 6.5, 5.2, 0, TAU); g.fill(); }
      g.fillStyle = 'rgba(255,255,255,0.10)';               // 瓣顶受光(灰白,不提高饱和)
      for (var k2 = 0; k2 < 2; k2++) { var a2 = (k2 * 3 + 1) / 5 * TAU + i; g.beginPath(); g.arc(sx + Math.cos(a2) * 6.5, sy + Math.sin(a2) * 6.5, 2.2, 0, TAU); g.fill(); }
      g.fillStyle = core; g.beginPath(); g.arc(sx, sy, 4.6, 0, TAU); g.fill();   // 深色花芯(罂粟特征)
    }
  }
  function fern(cxp, gY, col, colD, colO) {                 // 蕨(军绿)
    function frond(rootx, tipx, tipy, side) {
      blade(rootx, gY, tipx, tipy, 16, colD, colO);
      var n = 6;
      for (var i = 1; i <= n; i++) {
        var f = i / (n + 1), bx = rootx + (tipx - rootx) * f, by = gY + (tipy - gY) * f;
        var ll = 26 * (1 - f) + 8;
        g.strokeStyle = colO; g.lineWidth = 7; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx - ll, by - ll * 0.5); g.stroke();
        g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + ll, by - ll * 0.5); g.stroke();
        g.strokeStyle = col; g.lineWidth = 4; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx - ll, by - ll * 0.5); g.stroke();
        g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + ll, by - ll * 0.5); g.stroke();
      }
    }
    frond(cxp - 24, cxp - 40, gY - 176, -1);
    frond(cxp + 24, cxp + 42, gY - 170, 1);
    frond(cxp, cxp + 4, gY - 210, 0);
  }
  inCell(0, 256, function () { tuft(128, 508, '#567043', '#334724', '#192113'); });     // 军绿草簇
  inCell(256, 256, function () { flowers(384, 508, '#5f6b47', '#3c4529', '#1a2012', '#853d38', '#291e12'); }); // 罂粟
  inCell(0, 0, function () { fern(128, 252, '#4c7058', '#294734', '#111a15'); });       // 蕨
  inCell(256, 0, function () { tuft(384, 252, '#80794f', '#544f2a', '#262417'); });     // 焦枯草
  _grassTex = _sprPaperTex(cv, g, 6, 8, 'rgba(48,54,36,0.09)', 'rgba(150,160,120,0.03)');
  return _grassTex;
}
function _grassDispose() {
  if (_grassMesh && scene) scene.remove(_grassMesh);
  if (_grassGeo && _grassGeo.dispose) _grassGeo.dispose();
  if (_grassMat && _grassMat.dispose) _grassMat.dispose();
  _grassMesh = null; _grassGeo = null; _grassMat = null; _grassCellAttr = null;
  _grass.length = 0; _grassGrid = null;       // _grassTex 缓存复用
}
function buildGrass() {
  _grassDispose();
  if (!scene || typeof THREE === 'undefined') return;
  var tex = _grassMakeTex(); if (!tex) return;
  if (!_tEuler) { _tEuler = new THREE.Euler(); _tQuat = new THREE.Quaternion(); _tPos = new THREE.Vector3(); _tScl = new THREE.Vector3(); _tMat = new THREE.Matrix4(); _tnScratch = new THREE.Vector3(); }
  _grassGeo = new THREE.PlaneGeometry(1, 1, 1, 3); _grassGeo.translate(0, 0.5, 0);   // 竖分 3 段:顶点抖动弯曲
  var cellArr = new Float32Array(_GRASS_CAP);
  _grassCellAttr = new THREE.InstancedBufferAttribute(cellArr, 1).setUsage(THREE.DynamicDrawUsage);
  _grassGeo.setAttribute('iCell', _grassCellAttr);
  _grassMat = _billboardMat(tex);
  _grassMesh = new THREE.InstancedMesh(_grassGeo, _grassMat, _GRASS_CAP);
  _grassMesh.count = 0; _grassMesh.visible = false; _grassMesh.frustumCulled = false;
  _grassMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(_grassMesh);
  // —— R22-T1:改为区块流式确定性生成(不再开局建满全表)——
  _grass.length = 0; _grassGrid = new Map(); _grassFalling.length = 0;
  if (typeof window !== 'undefined') window.__grassDbg = function () {
    return { total: _grass.length, drawn: _grassMesh ? _grassMesh.count : -1, visible: _grassMesh ? _grassMesh.visible : false };
  };
  // 烘焙式阴影:注册花草丛来源(仅未倒 state!==2 投影)。剪影取自草图集自身 alpha。草量大→带 throttle 合并连爆突发
  if (typeof bsRegister === 'function') {
    bsRegister('grass', _grass, { tex: tex, cellOf: function (g) { return g.cell; }, filter: function (g) { return g.state !== 2; }, wScale: 0.95, lScale: 0.55, throttle: 0.25 });
    bakeSpriteShadows('grass');
  }
}
/* 花草局部查询(共用空间哈希);cb(草对象) 对命中者施加效果。 */
function _grassEach(x, z, r, cb) {
  if (!_grassGrid) return;
  var r2 = r * r, nn = Math.ceil(r / _grassCELL), cx = Math.floor(x / _grassCELL), cz = Math.floor(z / _grassCELL);
  for (var ix = cx - nn; ix <= cx + nn; ix++) for (var iz = cz - nn; iz <= cz + nn; iz++) {
    var b = _grassGrid.get(_treeKey(ix, iz)); if (!b) continue;
    for (var j = 0; j < b.length; j++) {
      var gr = _grass[b[j]]; if (!gr || gr.state === 2) continue;
      var dx = gr.x - x, dz = gr.z - z;
      if (dx * dx + dz * dz <= r2) cb(gr, Math.atan2(dz, dx));
    }
  }
}
/* ===== 焦土区植被清除(与「可见焦土」同源)=====
   scorchClearVegetation(x, z, RINF) 由 queueCrater 调用,尺子就是焦土影响半径 RINF:
     · f ≥ SC_VEG_HARD(≈0.69 RINF 内)→ 必杀(焦土黑心里立着完好树冠是最刺眼的穿帮);
     · 过渡带 → 按 f 线性概率清除,边缘参差自然;
     · f ≤ SC_VEG_SOFT(≈0.92 RINF 外)→ 不杀。
   概率用逐格确定性哈希 _sidHash01 而非 Math.random,使「当场炸掉」与「区块卸载后
   按 _sprInScorch 重建」逐株一致。 */
function _sidHash01(sid) {
  var h = (Math.imul(sid | 0, 374761393) + 0x5f356495) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0; h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function _treeEachRing(x, z, rIn, rOut, cb) {          // 空间哈希遍历环带(rIn < d ≤ rOut)
  if (!_treeGrid) return;
  var r2o = rOut * rOut, r2i = rIn * rIn, nn = Math.ceil(rOut / _treeCELL);
  var cx = Math.floor(x / _treeCELL), cz = Math.floor(z / _treeCELL), ix, iz, j;
  for (ix = cx - nn; ix <= cx + nn; ix++) for (iz = cz - nn; iz <= cz + nn; iz++) {
    var b = _treeGrid.get(_treeKey(ix, iz)); if (!b) continue;
    for (j = 0; j < b.length; j++) {
      var tr = _trees[b[j]]; if (!tr || tr.state !== 0) continue;
      var dx = tr.x - x, dz = tr.z - z, d2 = dx * dx + dz * dz;
      if (d2 > r2o || d2 <= r2i) continue;
      cb(tr, Math.sqrt(d2));
    }
  }
}
function _grassEachRing(x, z, rIn, rOut, cb) {
  if (!_grassGrid) return;
  var r2o = rOut * rOut, r2i = rIn * rIn, nn = Math.ceil(rOut / _grassCELL);
  var cx = Math.floor(x / _grassCELL), cz = Math.floor(z / _grassCELL), ix, iz, j;
  for (ix = cx - nn; ix <= cx + nn; ix++) for (iz = cz - nn; iz <= cz + nn; iz++) {
    var b = _grassGrid.get(_treeKey(ix, iz)); if (!b) continue;
    for (j = 0; j < b.length; j++) {
      var gr = _grass[b[j]]; if (!gr || gr.state !== 0) continue;
      var dx = gr.x - x, dz = gr.z - z, d2 = dx * dx + dz * dz;
      if (d2 > r2o || d2 <= r2i) continue;
      cb(gr, Math.sqrt(d2));
    }
  }
}
function scorchClearVegetation(x, z, RINF) {
  var rHard = scorchUForF(SC_VEG_HARD) * RINF;         // 必杀核半径(该处 f = SC_VEG_HARD)
  var rOut  = scorchUForF(SC_VEG_SOFT) * RINF;         // 概率环外沿(该处 f = SC_VEG_SOFT)
  if (typeof fellTreesInRadius === 'function') fellTreesInRadius(x, z, rHard);
  if (typeof grassBlastDestroy === 'function') grassBlastDestroy(x, z, rHard);
  if (rOut <= rHard) return;
  _treeEachRing(x, z, rHard, rOut, function (tr, d) {
    var p = scorchVegKillP(scorchF(d / RINF));
    if (p > 0 && _sidHash01(tr.sid) < p) { tr.state = 1; tr.ft = 0; tr.stump = false; }
  });
  _grassEachRing(x, z, rHard, rOut, function (gr, d) {
    var p = scorchVegKillP(scorchF(d / RINF));
    if (p > 0 && _sidHash01(gr.sid) < p) {
      gr.state = 1; gr.vt = 0; _grassFalling.push(gr);
      if (gr.sid != null && _spriteDelta) _spriteDelta.grass.set(gr.sid, { gone: 1 });
    }
  });
}
// 爆炸摧毁花草(仅此可摧毁):倒下缩没,不留桩。入 _grassFalling 保证离环也能推进倒没动画。
function grassBlastDestroy(x, z, r) { _grassEach(x, z, r, function (gr) { if (gr.state === 0) { gr.state = 1; gr.vt = 0; _grassFalling.push(gr); if (gr.sid != null && _spriteDelta) _spriteDelta.grass.set(gr.sid, { gone: 1 }); } }); }   // 炸没即记账本(卸载后回来不再重建)
// 仅玩家触发的抖动(炮击擦过 / 碾压 / 直升机低掠):不摧毁,只 shake
function grassShake(x, z, r, strength, dir) {
  _grassEach(x, z, r, function (gr, ang) {
    if (gr.state !== 0) return;
    gr.shk = Math.min(1.0, Math.max(gr.shk, strength));
    gr.shdir = (dir != null) ? dir : (Math.cos(ang) >= 0 ? 1 : -1);
  });
}
function grassSegShake(x0, z0, x1, z1, r, strength) {                 // 玩家炮弹沿飞行段擦草
  if (!_grassGrid) return;
  var dx = x1 - x0, dz = z1 - z0, L = Math.sqrt(dx * dx + dz * dz), steps = Math.max(1, Math.ceil(L / 3));
  var d = L > 0.001 ? (Math.cos(Math.atan2(dz, dx)) >= 0 ? 1 : -1) : 1;
  for (var i = 0; i <= steps; i++) { var f = i / steps; grassShake(x0 + dx * f, z0 + dz * f, r, strength, d); }
}
// 玩家载具碾压 / 直升机低空掠过 → 抖动(每帧扫描,仅 player)
function grassPlayerScan() {
  if (!_grassGrid || !player || !player.alive || !player.group) return;
  var px = player.group.position.x, pz = player.group.position.z;
  if (isHeliVehicle(player)) {
    var agl = player.group.position.y - terrainH(px, pz);
    if (agl > 0.05 && agl < 6.0) {                                    // 直升机会产生地面尘土的低空高度
      var rr = 7.0 + (6.0 - agl) * 1.6;                              // 越低下洗越广
      grassShake(px, pz, rr, agl < 3.0 ? 0.9 : 0.55, null);
    }
  } else {
    var agl2 = player.group.position.y - terrainH(px, pz);
    if (agl2 < 2.2) grassShake(px, pz, (player.radius || 2.2) * 1.1, 0.85, null);   // 地面载具碾压
  }
}
function _grassCompose(gr, camX, camZ, dt, out) {
  // 基础微摆 + 抖动(顶部横向弯 tilt)+ 压扁(sy)。爆炸倒没=整体压扁+侧倒。
  var tilt = gr.sway * Math.sin(gameT * gr.swsp + gr.phase);
  var sx = 1, sy = 1;
  if (gr.shk > 0) {                                                                        // ★弹性/橡皮管抖动(取代旧僵硬定频摆)
    // 观感对齐\"树桩冒出\"的叮回弹(damped sine):实时高频阻尼正弦 + ease-out 包络,回摆过冲、收尾柔软。
    var env = gr.shk * (2 - gr.shk);                                                       // ease-out 包络(1-(1-shk)^2):首拍强、收尾软(去线性僵硬)
    var osc = Math.sin(gameT * 20.0 + gr.shph);                                            // 实时均匀高频回弹(频率不随 shk 漂移=去机械感)
    tilt += gr.shdir * (0.50 * env) + 0.44 * osc * env;                                    // 侧推 + 弹性过冲(左右回摆)
    sy = 1 - 0.24 * env;                                                                   // 被压矮(橡皮挤扁)
    sx = 1 + 0.22 * env;                                                                   // 横向鼓出(挤压回弹)
  }
  if (gr.state === 1) { tilt += gr.shdir * (1.2 * gr.vt); sy = 1 - 0.85 * gr.vt; sx = 1 + 0.3 * gr.vt; }   // 爆炸压没
  var dx2 = gr.x - camX, dz2 = gr.z - camZ, d = Math.sqrt(dx2 * dx2 + dz2 * dz2);
  var lod = d > _GRASS_RING - _GRASS_FADE ? (1 - (d - (_GRASS_RING - _GRASS_FADE)) / _GRASS_FADE) : 1;
  if (lod <= 0.02) return false;
  var yaw = Math.atan2(camX - gr.x, camZ - gr.z);
  _tEuler.set(tilt, yaw, 0, 'YXZ'); _tQuat.setFromEuler(_tEuler);
  var s = lod;
  _tPos.set(gr.x, gr.y, gr.z); _tScl.set(gr.w * s * sx, gr.h * s * sy, 1);
  _tMat.compose(_tPos, _tQuat, _tScl);
  _grassMesh.setMatrixAt(out, _tMat);
  _grassCellAttr.array[out] = gr.cell;
  return true;
}
function grassUpdate(dt) {
  if (!_grassMesh || !camera || !_grassGrid) { if (_grassMesh) { _grassMesh.count = 0; _grassMesh.visible = false; } return; }
  _billboardFogSync(_grassMat);
  // 爆炸倒没动画:全量推进 _grassFalling(与可见环解耦,离环也倒完)
  if (_grassFalling.length) {
    for (var fi = _grassFalling.length - 1; fi >= 0; fi--) {
      var gf = _grassFalling[fi]; gf.vt += dt / 0.5;
      if (gf.vt >= 1) { gf.state = 2; _grassFalling.splice(fi, 1); if (typeof bsMarkDirty === 'function') bsMarkDirty('grass'); }   // 爆炸没草完成→草影事件级重烘焙(节流合并连爆)
    }
  }
  _spriteFrustumUpdate();                                            // 刷新共用视锥(每帧一次;与树共用同一份)
  var camX = camera.position.x, camZ = camera.position.z, ring2 = _GRASS_RING * _GRASS_RING, out = 0;
  // 空间哈希:只遍历相机所在环内的格,避免逐帧扫描数万株
  var nn = Math.ceil(_GRASS_RING / _grassCELL), ccx = Math.floor(camX / _grassCELL), ccz = Math.floor(camZ / _grassCELL);
  for (var ix = ccx - nn; ix <= ccx + nn && out < _GRASS_CAP; ix++) {
    for (var iz = ccz - nn; iz <= ccz + nn && out < _GRASS_CAP; iz++) {
      var b = _grassGrid.get(_treeKey(ix, iz)); if (!b) continue;
      for (var j = 0; j < b.length && out < _GRASS_CAP; j++) {
        var gi = b[j], gr = _grass[gi];
        if (!gr || gr.state === 2) continue;
        if (gr.shk > 0) gr.shk = Math.max(0, gr.shk - dt / 0.9);                             // 抖动衰减(0.9s,弹性回弹更长更软)
        var dx = gr.x - camX, dz = gr.z - camZ, d2 = dx * dx + dz * dz; if (d2 > ring2) continue;
        var d = Math.sqrt(d2);
        if (!_spriteThin(gi, d, _GRASS_FULL, _GRASS_RING, _GRASS_FARKEEP)) continue;         // 远处按距离抽稀
        if (!_spriteInView(gr.x, gr.y + gr.h * 0.5, gr.z, gr.h * 0.7)) continue;             // 视锥剔除:只渲画面内的草
        if (_grassCompose(gr, camX, camZ, dt, out)) out++;
      }
    }
  }
  _grassMesh.count = out; _grassMesh.visible = out > 0;
  if (out) { _grassMesh.instanceMatrix.needsUpdate = true; _grassCellAttr.needsUpdate = true; }
}

/* ============================================================
   通用「烘焙式」地物阴影(baked scene-sprite shadows)—— 树 / 树桩 / 花草丛,以及未来任意场景 billboard 共用。
   随附方案与性能报告:/home/user/地物阴影烘焙方案.md
   ── 设计五要点 ──
   1) 非动态:阴影只在三类事件重烘焙 —— (a) 地图生成;(b) 战斗时刻(太阳方位)改变;
      (c) 地物状态变更(树被倒→留桩生成、爆炸没草)。渲染帧零重算(bsFlush 仅在「脏」时才算)。
   2) 方向 / 长度取自权威光向量 sunOffset(applyTimeOfDay 依所选小时 + 阵营半场翻转写入):
      · 地面投影方向 = 太阳水平分量取反(背光方向);
      · 长度 ∝ cot(太阳高度角) —— 正午最短、朝夕拉长;
      · 太阳没入地平(夜)→ 整体隐藏(不投影)。
   3) 贴合地形起伏:每株阴影是一张「贴地 decal 四边形」,其法线对齐落点地形法线(terrainNormal),
      随局部坡面倾斜就位(一阶贴合);小尺度地物(草 / 桩)完全服帖,长树影为一阶近似(报告详述其边界)。
   4) 一个 provider = 一个 InstancedMesh = 一次 draw call;实例矩阵在烘焙时一次性算好,GPU 逐帧零成本。
   5) 通用可复用接口:bsRegister(key,list,opt) 注册来源表;bakeSpriteShadows(key) 全量烘焙;
      bsMarkDirty(key)+bsFlush() 事件级增量重烘焙(草类带节流,合并连爆突发)。新增地物只需 bsRegister 一行即接入。
   ============================================================ */
var _bsProviders = {};                 // key -> {list, opt, mesh, geo, mat, cellAttr, capBuilt, dirty, lastT}
var _bsBlobTex = null, _bsEps = 0.14;  // _bsEps=抬离地面消坡面 z-fighting 与穿模
var _bsN = null, _bsF = null, _bsR = null, _bsQ = null, _bsP = null, _bsScl2 = null, _bsMat2 = null;
var _bsSunC = { opa: 0, dx: 1, dz: 0, len: 1 };

/* 通用后备 blob(仅当某地物「未提供图集纹理」时用):柔边深椭圆。
   —— 有图集的地物(树/桩/草)不走这里,而是直接采样自身图集的 alpha 剪影,阴影与卡通外形逐像素吻合。 */
function _bsMakeBlobTex() {
  if (_bsBlobTex) return _bsBlobTex;
  var _c = make2DCanvas(128); if (!_c) return null;
  var cv = _c.cv, g = _c.g;
  g.clearRect(0, 0, 128, 128);
  var grd = g.createRadialGradient(64, 96, 3, 64, 96, 74);
  grd.addColorStop(0.0, 'rgba(255,255,255,0.95)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  grd.addColorStop(0.85, 'rgba(255,255,255,0.18)');
  grd.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  var t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true;
  _bsBlobTex = t; return t;
}
/* 阴影材质:透明纯黑 decal。sil=1 → 采样地物图集(2×2 格,iCell 选格)的 alpha 作剪影;
   把地物「竖直贴片」放倒铺在地面,竖轴(根→梢)映射到背光方向(近→远)。sil=0 → 后备 blob。 */
function _bsMaterial(tex, sil) {
  var uniforms = {
    map: { value: tex }, uOpacity: { value: 0.0 }, uSil: { value: sil ? 1.0 : 0.0 },
    uFogNear: { value: scene && scene.fog ? scene.fog.near : 900 },
    uFogFar: { value: scene && scene.fog ? scene.fog.far : 6200 }
  };
  var vs = [
    'attribute float iCell;', 'varying vec2 vSuv;', 'varying vec2 vUvR;', 'varying float vFog;',
    '#include <common>', '#include <logdepthbuf_pars_vertex>',
    'void main(){',
    '  float cxo = mod(iCell, 2.0) * 0.5;',
    '  float cyo = floor(iCell * 0.5) * 0.5;',
    '  vSuv = vec2(uv.x, 1.0 - uv.y) * 0.5 + vec2(cxo, cyo);',   // 图集剪影 uv:decal 近边(uv.y=1)=地物根部(sprite v=0)
    '  vUvR = uv;',
    '  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);',
    '  vFog = -mv.z;',
    '  gl_Position = projectionMatrix * mv;',
    '  #include <logdepthbuf_vertex>',
    '}'
  ].join('\n');
  var fs = [
    'uniform sampler2D map;', 'uniform float uOpacity;', 'uniform float uSil;', 'uniform float uFogNear;', 'uniform float uFogFar;',
    'varying vec2 vSuv;', 'varying vec2 vUvR;', 'varying float vFog;',
    '#include <common>', '#include <logdepthbuf_pars_fragment>',
    'void main(){',
    '  float a = (uSil > 0.5) ? texture2D(map, vSuv).a : texture2D(map, vUvR).a;',
    '  float fade = mix(0.5, 1.0, vUvR.y);',        // 越靠梢部(uv.y→0)越淡,漫画软影
    '  a *= uOpacity * fade;',
    '  #include <logdepthbuf_fragment>',
    '  float f = smoothstep(uFogNear, uFogFar, vFog);',
    '  a *= (1.0 - f);',
    '  if (a < 0.03) discard;',
    '  gl_FragColor = vec4(0.0, 0.0, 0.0, a);',
    '}'
  ].join('\n');
  return new THREE.ShaderMaterial({
    uniforms: uniforms, vertexShader: vs, fragmentShader: fs,
    transparent: true, depthWrite: false, depthTest: true, fog: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.ZeroFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3
  });
}
function _bsSun() {                     // 由 sunOffset 解出:背光地面方向 + 长度倍率 + 整体不透明度
  var sy = (typeof sunOffset !== 'undefined' && sunOffset) ? sunOffset.y : 0.4;
  var c = _bsSunC;
  if (sy <= 0.05) { c.opa = 0; return c; }             // 太阳没入地平(夜)→ 不投影
  var hx = -sunOffset.x, hz = -sunOffset.z;            // 背光 = 太阳水平分量取反
  var hl = Math.sqrt(hx * hx + hz * hz);
  if (hl < 1e-3) { c.dx = 1; c.dz = 0; } else { c.dx = hx / hl; c.dz = hz / hl; }
  c.len = clamp(hl / Math.max(0.06, sy), 0.42, 3.6);   // cot(高度角):正午短、朝夕长
  c.opa = clamp(sy * 2.4, 0, 1) * 0.46;                // 白天最深≈0.46;低角度 / 夜渐隐
  return c;
}
function bsRegister(key, list, opt) {   // 注册一类地物的阴影来源(通用;新地物一行接入)
  var P = _bsProviders[key];
  if (!P) P = _bsProviders[key] = { mesh: null, geo: null, mat: null, cellAttr: null, capBuilt: 0, dirty: false, lastT: -1 };
  P.list = list; P.opt = opt || {}; P.dirty = true;
}
function _bsEnsureMesh(P, need) {
  if (P.mesh && P.capBuilt >= need) return;
  if (P.mesh && scene) { scene.remove(P.mesh); if (P.geo && P.geo.dispose) P.geo.dispose(); if (P.mat && P.mat.dispose) P.mat.dispose(); }
  var sil = !!(P.opt && P.opt.tex);                              // 提供图集→剪影模式;否则后备 blob
  var tex = sil ? P.opt.tex : _bsMakeBlobTex();
  if (!tex) { P.mesh = null; return; }                          // 无头环境无 2D canvas → 跳过
  var cap = Math.max(16, need);
  var geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2); geo.translate(0, 0, 0.5);          // 贴地 XZ 面;近边(根部)z=0,向 +z 伸展,宽沿 x
  var cellArr = new Float32Array(cap);
  P.cellAttr = new THREE.InstancedBufferAttribute(cellArr, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iCell', P.cellAttr);
  P.geo = geo; P.mat = _bsMaterial(tex, sil);
  P.mesh = new THREE.InstancedMesh(geo, P.mat, cap);
  P.mesh.count = 0; P.mesh.visible = false; P.mesh.frustumCulled = false;
  P.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  P.mesh.renderOrder = -1;                                       // 地面 decal:先于地物 billboard 排入透明队列
  P.capBuilt = cap;
  if (scene) scene.add(P.mesh);
}
function bakeSpriteShadows(key) {        // 全量烘焙一个 provider 的所有阴影实例(事件级调用)
  var P = _bsProviders[key]; if (!P || !P.list || !scene || typeof THREE === 'undefined') return;
  if (!_bsN) { _bsN = new THREE.Vector3(); _bsF = new THREE.Vector3(); _bsR = new THREE.Vector3(); _bsQ = new THREE.Quaternion(); _bsP = new THREE.Vector3(); _bsScl2 = new THREE.Vector3(); _bsMat2 = new THREE.Matrix4(); }
  var opt = P.opt, list = P.list, i, need = 0;
  for (i = 0; i < list.length; i++) { if (!opt.filter || opt.filter(list[i])) need++; }   // 仅活着/直立地物投影
  _bsEnsureMesh(P, need);
  if (!P.mesh) return;
  var sun = _bsSun();
  P.mat.uniforms.uOpacity.value = sun.opa;
  P.mat.uniforms.uFogNear.value = scene.fog ? scene.fog.near : 900;
  P.mat.uniforms.uFogFar.value = scene.fog ? scene.fog.far : 6200;
  if (sun.opa <= 0) { P.mesh.count = 0; P.mesh.visible = false; P.dirty = false; return; }   // 夜:隐藏
  var wS = opt.wScale != null ? opt.wScale : 1.0, lS = opt.lScale != null ? opt.lScale : 1.0;
  var out = 0, cap = P.capBuilt;
  for (i = 0; i < list.length && out < cap; i++) {
    var s = list[i]; if (opt.filter && !opt.filter(s)) continue;
    var x = s.x, z = s.z, y = terrainH(x, z);
    terrainNormal(x, z, _bsN);                                   // 落点地形法线 = decal 的「上」
    var dn = sun.dx * _bsN.x + sun.dz * _bsN.z;                  // 背光方向投影到坡面切平面(贴地形起伏)
    _bsF.set(sun.dx - _bsN.x * dn, -_bsN.y * dn, sun.dz - _bsN.z * dn);
    if (_bsF.lengthSq() < 1e-6) _bsF.set(sun.dx, 0, sun.dz);
    _bsF.normalize();
    _bsR.crossVectors(_bsN, _bsF).normalize();                  // 右 = 上 × 前(右手基)
    _bsMat2.makeBasis(_bsR, _bsN, _bsF); _bsQ.setFromRotationMatrix(_bsMat2);
    var W = (s.w || 1) * wS, L = (s.h || 1) * sun.len * lS;      // 宽=地物宽;长=地物高×前缩(剪影随之拉伸)
    _bsP.set(x + _bsN.x * _bsEps, y + _bsN.y * _bsEps, z + _bsN.z * _bsEps);
    _bsScl2.set(W, 1, L);
    _bsMat2.compose(_bsP, _bsQ, _bsScl2);
    P.mesh.setMatrixAt(out, _bsMat2);
    P.cellAttr.array[out] = opt.cellOf ? (opt.cellOf(s) || 0) : 0;   // 图集格号(与地物贴片同格→同一剪影)
    out++;
  }
  P.mesh.count = out; P.mesh.visible = out > 0;
  P.mesh.instanceMatrix.needsUpdate = true; P.cellAttr.needsUpdate = true;
  P.dirty = false; P.lastT = (typeof gameT !== 'undefined' ? gameT : 0);
}
function bsMarkDirty(key) { var P = _bsProviders[key]; if (P) P.dirty = true; }
/* G4-decal: crater batches re-anchor SURVIVING blob shadows (bake recomputes y=terrainH).
   Overlap test per provider with first-hit early-out; bsFlush throttles bound the cost. */
function bsDirtyByCraters(points, rinf) {
  if (!points || points.length < 2 || typeof bsMarkDirty !== 'function') return;
  if (typeof _bsProviders === 'undefined' || !_bsProviders) return;
  var nc = points.length >> 1, key, P, arr, i, j;
  for (key in _bsProviders) {
    if (!_bsProviders.hasOwnProperty(key)) continue;
    P = _bsProviders[key];
    if (!P || !P.list || !P.list.length || P.dirty) continue;
    arr = P.list;
    var hit = false;
    for (i = 0; i < arr.length && !hit; i++) {
      var s = arr[i]; if (!s || s.x == null || s.z == null) continue;
      for (j = 0; j < nc; j++) {
        var dx = s.x - points[j * 2], dz = s.z - points[j * 2 + 1], R = (rinf && rinf[j] != null) ? rinf[j] : 33.6;
        if (dx * dx + dz * dz <= R * R) { hit = true; break; }
      }
    }
    if (hit) bsMarkDirty(key);
  }
}
function bsRebakeAll() { for (var k in _bsProviders) if (_bsProviders.hasOwnProperty(k)) bakeSpriteShadows(k); }
function bsFlush() {                     // 渲染帧调用:仅重烘焙「脏」provider(草类节流合并连爆突发),非脏零成本
  var now = (typeof gameT !== 'undefined' ? gameT : 0), k;
  for (k in _bsProviders) {
    if (!_bsProviders.hasOwnProperty(k)) continue;
    var P = _bsProviders[k]; if (!P.dirty) continue;
    var thr = (P.opt && P.opt.throttle) ? P.opt.throttle : 0;
    if (thr > 0 && P.lastT >= 0 && (now - P.lastT) < thr) continue;   // 合并突发(如连环爆炸没草)
    bakeSpriteShadows(k);
  }
}
