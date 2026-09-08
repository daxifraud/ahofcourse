
/* ===== Module: core_util.js ===== */
/* ============================================================
   模块: core_util.js — core 通用工具(数学/RNG/几何合并/池/避障/弹道口径)
   (本模块通用部分,须先于 core.js 加载;加载顺序由 index.html MODULES 表决定)
   ============================================================ */
'use strict';

/* ===== 工具 ===== */
var clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };

/* 2D 画布创建的统一入口(全部程序化贴图共用)。
   一处收口三件事:无 DOM 环境(SSR / 无头自检)返回 null、getContext 不可用返回 null、尺寸设定。
   返回 { cv, g };调用方只需判一次 null。 */
function make2DCanvas(size) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  var cv = document.createElement('canvas');
  if (!cv || typeof cv.getContext !== 'function') return null;
  cv.width = cv.height = size;
  var g = cv.getContext('2d');
  return g ? { cv: cv, g: g } : null;
}

var rand  = function (a, b) { return a + Math.random() * (b - a); };

var TAU = Math.PI * 2;

function mulberry32(seed) {              // 独立种子随机(由 map 模块上移,音频烘焙/地面贴图/战斗流亦用;不占战斗 RNG 流)
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normAng(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }

/* 地形换肤共用公式(地面分块/远景丘陵/换肤三处同口径,防配色漂移):
   干燥度:低处湿/高处干;坡度因子:陡坡→岩色 */
function terrainDry(h)   { return clamp((h + 4) / 10, 0, 1); }

function terrainSteep(nY) { return clamp((1 - nY) * 5, 0, 1); }

/* ============================================================
   P1 · 地貌分区权重场(颜色层) —— 由 biome-p0-debug.html 验证后移植
   ------------------------------------------------------------
   要点(全部经无头实测,勿凭直觉改):
   (1) 覆盖性下界 R >= cell*(1/sqrt(3)+jitter)。低于此值存在"无锚点覆盖"的空洞,
       归一化分母为 0 → 退化兜底 → 权重 0<->1 硬跳变(车辆过界瞬间变色)。已自动钳位。
   (2) 域扭曲波长必须远大于幅度, 否则坐标映射非单射(空间自我折叠), 权重梯度暴涨成"假硬边"。
       实测 波长10m/幅度36m → 梯度 1.77/m(0.6m 内 0→1)。现取 波长=胞元、幅度<=0.22*胞元。
   (3) 过渡带最窄处须 >= 4*GRID_CELL, 否则顶点网格采样不到平滑斜坡 → 退化成锯齿硬边。
       默认 胞元=side/10、jitter .12、R .72 在 2km 图上过渡带约 23m = 8.3x 格距。
   (4) 本层只驱动"颜色/贴图", 不参与 terrainH。P1 零物理风险。
   ============================================================ */
var BIOMES = [
  /* g=湿(低地)色 d=干(高地)色 r=陡坡岩色  tex: 0=植被质感 1=土质 2=岩质
     rock/veg = 属性空间坐标(锚点指派用)。草原/沃土在此降级为普通两项。 */
  /* ★调色板亮度必须挤在同一窄带内(实测湿态极差 0.094、干态 0.108)。
     依据:漫画描边阈值 edgeL = smoothstep(0.11, 0.28, lumMag)。任意两地貌亮度差若落进
     [0.11, 0.28) 就会沿地貌边界描出断续脏边并随视角闪烁。初版沃土过暗(L=0.186),
     与干草原/沙土等 7 对组合全部踩进危险带 —— 已整体压缩亮度、改用"色相"而非"明度"区分。
     区分度由色相承担:草原偏绿、沃土偏红棕、沙土偏黄、砾石/裸岩近中性灰、石楠偏灰绿。 */
  { id:'grass', name:'干草原',   tex:0, rock:0.20, veg:0.85,
    g:[0.365,0.425,0.275],d:[0.500,0.480,0.320],r:[0.455,0.450,0.415] },
  { id:'soil',  name:'沃土',     tex:1, rock:0.25, veg:0.45,
    g:[0.360,0.300,0.225],d:[0.470,0.395,0.285],r:[0.400,0.360,0.320] },
  { id:'sand',  name:'沙土戈壁', tex:1, rock:0.35, veg:0.12,
    g:[0.430,0.395,0.285],d:[0.560,0.510,0.370],r:[0.470,0.440,0.375] },
  { id:'gravel',name:'砾石滩',   tex:2, rock:0.70, veg:0.18,
    g:[0.385,0.380,0.360],d:[0.495,0.487,0.458],r:[0.450,0.445,0.432] },
  { id:'scrub', name:'灌木丘陵', tex:0, rock:0.40, veg:0.62,
    g:[0.330,0.400,0.268],d:[0.462,0.463,0.325],r:[0.430,0.425,0.385] },
  { id:'rock',  name:'断崖裸岩', tex:2, rock:0.92, veg:0.08,
    g:[0.352,0.345,0.335],d:[0.450,0.440,0.425],r:[0.398,0.393,0.383] },
  { id:'heath', name:'石楠高地', tex:0, rock:0.55, veg:0.50,
    g:[0.330,0.365,0.318],d:[0.445,0.443,0.372],r:[0.418,0.414,0.398] }
];
var BIOME_N = BIOMES.length;
var BQ = { A:null, cell:0, R:0, R2:0, gx:0, gz:0, origin:0,
           warpAmp:0, warpFq:0, nWx:null, nWz:null, ready:false };
var BIOME_CELLS = 10, BIOME_JITTER = 0.12, BIOME_RR = 0.72, BIOME_WARP = 0.16;

function _bValNoise(seed) {              // 平滑值噪声(域扭曲用)
  var P = new Float32Array(256), rnd = mulberry32(seed);
  for (var i = 0; i < 256; i++) P[i] = rnd();
  function at(ix, iz) { return P[(((ix & 15) * 16) + (iz & 15)) & 255]; }
  return function (x, z) {
    var fx = Math.floor(x), fz = Math.floor(z), tx = x - fx, tz = z - fz;
    tx = tx * tx * (3 - 2 * tx); tz = tz * tz * (3 - 2 * tz);
    var a = at(fx, fz), b = at(fx + 1, fz), c = at(fx, fz + 1), d = at(fx + 1, fz + 1);
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  };
}
function biomeRebuild() {                // 抖动三角栅格锚点 + 属性空间最近邻指派
  var side = MAP.side, seedN = hashSeed(String(MAP.seed) + '|biome') >>> 0;
  var rnd = mulberry32(seedN);
  var cell = side / BIOME_CELLS;
  var rMin = cell * (1 / Math.sqrt(3) + BIOME_JITTER);
  var R = Math.max(cell * BIOME_RR, rMin);
  var margin = 2;
  var gx = Math.ceil(side / cell) + margin * 2;
  var gz = Math.ceil(side / (cell * 0.8660254)) + margin * 2;
  var origin = -side / 2 - margin * cell;
  /* 属性场:两张低频值噪声(硬度/植被)。
     ★不可用 sin*cos 乘积:两个 [-1,1] 的积强烈向 0 集中,rk/vg 几乎全落在 0.5 附近,
       最近邻指派的结果是"中心地貌垄断" —— 实测 7 种只出 3~4 种、单种占比达 68%。
     ★改用 秩归一化(rank-normalise):把两轴各自排序后线性映射到 [0,1],
       得到严格均匀的属性分布, 再做最近邻指派 → 7 种必定全部出现, 单种占比降到 20~29%。
       这是"配额"的无参数实现, 且完全确定性(同种子同结果)。 */
  var nR = _bValNoise(seedN ^ 0x1111), nV = _bValNoise(seedN ^ 0x2222);
  var F = 1 / (cell * 2.2);              // 特征尺度 ≈ 2 个胞元 → 同类地貌成片而非椒盐
  var pts = [];
  for (var jz = 0; jz < gz; jz++) for (var jx = 0; jx < gx; jx++) {
    var ox = (jz & 1) ? cell * 0.5 : 0;
    var px = origin + jx * cell + ox + (rnd() - 0.5) * 2 * BIOME_JITTER * cell;
    var pz = origin + jz * cell * 0.8660254 + (rnd() - 0.5) * 2 * BIOME_JITTER * cell;
    var q = pz;                          // ★场景v1:已取消南北镜像——锚点属性随真实坐标采样,南北生境(地貌/颜色带)各异
    pts.push({ x: px, z: pz, rk: nR(px * F, q * F), vg: nV(px * F + 31.7, q * F + 11.3), rkN: 0, vgN: 0, b: 0 });
  }
  var nP = pts.length, ii;
  var byR = pts.slice().sort(function (a, b2) { return a.rk - b2.rk; });
  for (ii = 0; ii < nP; ii++) byR[ii].rkN = ii / (nP - 1);
  var byV = pts.slice().sort(function (a, b2) { return a.vg - b2.vg; });
  for (ii = 0; ii < nP; ii++) byV[ii].vgN = ii / (nP - 1);
  var A = [];
  for (ii = 0; ii < nP; ii++) {
    var P0 = pts[ii], best = 0, bd = 1e9;
    for (var k = 0; k < BIOME_N; k++) {
      var dr = BIOMES[k].rock - P0.rkN, dv = BIOMES[k].veg - P0.vgN, dd = dr * dr + dv * dv;
      if (dd < bd) { bd = dd; best = k; }
    }
    A.push({ x: P0.x, z: P0.z, b: best });
  }
  BQ.A = A; BQ.cell = cell; BQ.R = R; BQ.R2 = R * R;
  BQ.gx = gx; BQ.gz = gz; BQ.origin = origin;
  BQ.warpAmp = cell * Math.min(BIOME_WARP, 0.22);
  BQ.warpFq = 1 / cell;
  BQ.nWx = _bValNoise(seedN ^ 0x9e37); BQ.nWz = _bValNoise(seedN ^ 0x85eb);
  BQ.ready = true;
}
var _bwTmp = new Float32Array(8);
function biomeWeightsAt(x, z, out) {     // 归一化稀疏卷积,恒有 sum(w)=1
  var k;
  for (k = 0; k < BIOME_N; k++) out[k] = 0;
  if (!BQ.ready) { out[0] = 1; return 1; }
  var wx = x, wz = z;
  if (BQ.warpAmp > 0) {                  // 两轴均用原始坐标取样(勿耦合)
    var f = BQ.warpFq;
    wx = x + (BQ.nWx(x * f + 2.5, z * f + 8.1) - 0.5) * 2 * BQ.warpAmp;
    wz = z + (BQ.nWz(x * f + 17.3, z * f + 41.7) - 0.5) * 2 * BQ.warpAmp;
  }
  var cell = BQ.cell, rowH = cell * 0.8660254;
  var jz0 = Math.floor((wz - BQ.origin - BQ.R) / rowH), jz1 = Math.ceil((wz - BQ.origin + BQ.R) / rowH);
  var tot = 0, n = 0, A = BQ.A, gx = BQ.gx;
  for (var jz = jz0; jz <= jz1; jz++) {
    if (jz < 0 || jz >= BQ.gz) continue;
    var ox = (jz & 1) ? cell * 0.5 : 0;
    var jx0 = Math.floor((wx - BQ.origin - ox - BQ.R) / cell), jx1 = Math.ceil((wx - BQ.origin - ox + BQ.R) / cell);
    for (var jx = jx0; jx <= jx1; jx++) {
      if (jx < 0 || jx >= gx) continue;
      var a = A[jz * gx + jx];
      var dx = a.x - wx, dz = a.z - wz, d2 = dx * dx + dz * dz;
      if (d2 >= BQ.R2) continue;
      var t = BQ.R2 - d2, w = t * t;
      out[a.b] += w; tot += w;
    }
  }
  if (tot <= 1e-20) {                    // 退化兜底(钳位后理论不可达)
    var bi = 0, bd = 1e9;
    for (var q2 = 0; q2 < A.length; q2++) {
      var ddx = A[q2].x - wx, ddz = A[q2].z - wz, dd2 = ddx * ddx + ddz * ddz;
      if (dd2 < bd) { bd = dd2; bi = A[q2].b; }
    }
    out[bi] = 1; return 1;
  }
  var inv = 1 / tot;
  for (k = 0; k < BIOME_N; k++) { out[k] *= inv; if (out[k] > 0.0008) n++; }
  return n;
}
/* 地貌加权基色(替代原 GROUND_STYLES 单调色板)。dry/steep 语义与原版完全一致。
   同时输出三类质感权重 tw[0..2](植被/土质/岩质),供贴图混合使用。 */
function biomeColorAt(x, z, dry, steep, outCol, outTW) {
  biomeWeightsAt(x, z, _bwTmp);        // ★场景v1:基色随真实坐标,南北色带各异(取消 |z| 镜像)
  var r = 0, g = 0, b = 0, t0 = 0, t1 = 0, t2 = 0;
  for (var k = 0; k < BIOME_N; k++) {
    var w = _bwTmp[k]; if (w < 1e-5) continue;
    var B = BIOMES[k];
    var cr = B.g[0] + (B.d[0] - B.g[0]) * dry,
        cg = B.g[1] + (B.d[1] - B.g[1]) * dry,
        cb = B.g[2] + (B.d[2] - B.g[2]) * dry;
    cr += (B.r[0] - cr) * steep; cg += (B.r[1] - cg) * steep; cb += (B.r[2] - cb) * steep;
    r += cr * w; g += cg * w; b += cb * w;
    if (B.tex === 0) t0 += w; else if (B.tex === 1) t1 += w; else t2 += w;
  }
  outCol[0] = r; outCol[1] = g; outCol[2] = b;
  if (outTW) { outTW[0] = t0; outTW[1] = t1; outTW[2] = t2; }
}
var _bCol3 = [0, 0, 0], _bTW3 = [0, 0, 0];
var _bColR = [0, 0, 0];   /* G2-slopefix: rock-color scratch (steep=1 bake for per-fragment steep) */


function scopeFov(scopeZoom, scopeT) { return 62 + (28 / scopeZoom - 62) * scopeT; }

// 炮镜开镜变焦(62°→28°;倍率档位只改这一处,相机/阴影/灵敏度同源)
/* N 网格按矩阵烘焙合并为单一 BufferGeometry(残骸个体/区合批 + 阴影模板共用内核,去重自 combat.bakeGeomList/vehicles._shMerge):
   jobs=[{geo,m4}],m4=几何→目标坐标系矩阵;withColor=true 时含 color(残骸全细节),false 仅 position/normal/uv;
   fillIndex=true 时无 index 几何顺序补索引(阴影模板);sharedFlag=true 打 _shared 标记(模板禁销毁,残骸产物不设)。 */
var _mgV = new THREE.Vector3(), _mgNM = new THREE.Matrix3();

// 模块 scratch(热路径零分配)
function mergeGeometries(jobs, withColor, fillIndex, sharedFlag) {
  var totalV = 0, totalI = 0, i;
  for (i = 0; i < jobs.length; i++) {
    totalV += jobs[i].geo.attributes.position.count;
    totalI += jobs[i].geo.index ? jobs[i].geo.index.count : (fillIndex ? jobs[i].geo.attributes.position.count : 0);
  }
  if (!totalV) return null;
  var pos = new Float32Array(totalV * 3), nrm = new Float32Array(totalV * 3),
      col = withColor ? new Float32Array(totalV * 3) : null, uvm = new Float32Array(totalV * 2);
  var idxA = totalV > 65535 ? new Uint32Array(totalI) : new Uint16Array(totalI);
  var vo = 0, io = 0;
  for (i = 0; i < jobs.length; i++) {
    var g = jobs[i].geo, m4 = jobs[i].m4, n = g.attributes.position.count;
    _mgNM.getNormalMatrix(m4);
    var pa = g.attributes.position.array, na = g.attributes.normal ? g.attributes.normal.array : null,
        ca = withColor && g.attributes.color ? g.attributes.color.array : null,
        ua = g.attributes.uv ? g.attributes.uv.array : null;
    for (var v = 0; v < n; v++) {
      _mgV.set(pa[v * 3], pa[v * 3 + 1], pa[v * 3 + 2]).applyMatrix4(m4);
      pos[(vo + v) * 3] = _mgV.x; pos[(vo + v) * 3 + 1] = _mgV.y; pos[(vo + v) * 3 + 2] = _mgV.z;
      if (na) {
        _mgV.set(na[v * 3], na[v * 3 + 1], na[v * 3 + 2]).applyMatrix3(_mgNM).normalize();
        nrm[(vo + v) * 3] = _mgV.x; nrm[(vo + v) * 3 + 1] = _mgV.y; nrm[(vo + v) * 3 + 2] = _mgV.z;
      }
      if (ca) { col[(vo + v) * 3] = ca[v * 3]; col[(vo + v) * 3 + 1] = ca[v * 3 + 1]; col[(vo + v) * 3 + 2] = ca[v * 3 + 2]; }
      if (ua) { uvm[(vo + v) * 2] = ua[v * 2]; uvm[(vo + v) * 2 + 1] = ua[v * 2 + 1]; }
    }
    if (g.index) {
      var ia = g.index.array;
      for (var k2 = 0; k2 < ia.length; k2++) idxA[io + k2] = ia[k2] + vo;
      io += ia.length;
    } else if (fillIndex) {
      for (var k3 = 0; k3 < n; k3++) idxA[io + k3] = vo + k3;
      io += n;
    }
    vo += n;
  }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  if (withColor) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvm, 2));
  geo.setIndex(new THREE.BufferAttribute(idxA, 1));
  if (sharedFlag) geo.userData._shared = true;   // 阴影模板禁销毁;残骸产物不设(区合批正常回收)
  return geo;
}

/* 通用对象池取件:优先空闲槽,全忙覆盖最旧(comic.js 漫画特效各池共用;槽位协议 it.on/it.age) */
function poolIdleOldest(pool, n) {
  var best = -1, bestAge = 1e9;
  for (var i = 0; i < n; i++) {
    var it = pool[i];
    if (!it.on) return it;
    if (it.age < bestAge) { bestAge = it.age; best = i; }
  }
  return pool[best];
}

// 线性加减速(二战坦克沉重的动力响应)
function approachSpeed(cur, target, accel, decel, dt) {
  if (cur === target) return cur;
  var sameDir = (cur === 0 || (target > 0) === (cur > 0));
  var rate = (Math.abs(target) > Math.abs(cur) && sameDir) ? accel : decel;
  var d = rate * dt;
  return cur < target ? Math.min(target, cur + d) : Math.max(target, cur - d);
}

// —— 障碍绕行转向:行进方向前方的固定障碍产生"法向推离 + 切向绕行"的合力,
//    AI 会贴着障碍边缘绕过去,而不是一直顶着它 ——
var _av = { x: 0, z: 0 };

// avoidSteer 复用 scratch(零分配;调方立即消费 .x/.z,无重入——steerCached/artyUpdate 均调用后随即读取)
function avoidSteer(t, dx, dz) {
  var p = t.group.position, L = Math.sqrt(dx * dx + dz * dz);
  if (L < 1e-4) { _av.x = dx; _av.z = dz; return _av; }
  var ux = dx / L, uz = dz / L;
  var rx = ux, rz = uz, changed = false;
  // 障碍网格邻域查询(静态注册/事件驱动;范围=最大障碍半径+reach 上界,候选集与全表逐位一致)
  var nObs = obstaclesNear(p.x, p.z, obstacleMaxR + t.radius + 10.5, _obsNear);
  for (var oi = 0; oi < nObs; oi++) {
    var o = _obsNear[oi];
    var ox = o.x - p.x, oz = o.z - p.z;
    var rr = o.r + t.radius + 1.5;
    var reach = rr + 9;
    var d2 = ox * ox + oz * oz;
    if (d2 > reach * reach) continue;
    var d = Math.sqrt(d2) || 0.01;
    if ((ox * ux + oz * uz) / d < 0.2) continue;            // 只避让行进方向前方的障碍
    ox /= d; oz /= d;
    var w = clamp(1 - (d - rr) / 9, 0.25, 1.5);
    rx -= ox * w * 0.55; rz -= oz * w * 0.55;               // 法向推离(越近推得越狠)
    var t1x = -uz, t1z = ux;                                // 单位切向(垂直行进方向)
    var sg = (ox * t1x + oz * t1z) > 0 ? -1 : 1;            // 绕向远离障碍的一侧
    rx += t1x * sg * w; rz += t1z * sg * w;                 // 切向绕行分量
    changed = true;
  }
  // —— 完整残骸:几乎不当障碍(可推的掩体)—— 只有贴脸 ±41° 窄锥内才极轻避让,
  //    其余一律允许贴身顶开(碰撞系统会把它推着走),绝不拿它当岩石那种死墙 ——
  //    簇化:堆叠残骸按簇(边缘距<6m)聚成单一虚拟体响应——逐具避让的切向分量
  //    符号互相打架导致贴堆抖动,整体化后一堆残骸=一次稳定的"法向推离+切向绕行"。
  var wcn = wreckClustersNear(p.x, p.z, t.radius + 14);
  for (var wci = 0; wci < wcn; wci++) {
    var wc = _wclOut[wci];
    var wx = wc.sx / wc.n - p.x, wz = wc.sz / wc.n - p.z;
    var rrW = wc.ext + t.radius + 0.5, reachW = rrW + 3;
    var d2W = wx * wx + wz * wz;
    if (d2W > reachW * reachW) continue;
    var dW = Math.sqrt(d2W) || 0.01;
    if ((wx * ux + wz * uz) / dW < 0.75) continue;          // 只在行进贴脸窄锥(±41°)内才稍微让一让
    var wW = clamp(1 - (dW - rrW) / 3, 0.1, 0.6);
    wx /= dW; wz /= dW;
    rx -= wx * wW * 0.22; rz -= wz * wW * 0.22;
    var t2x = -uz, t2z = ux;
    var sg2 = (wx * t2x + wz * t2z) > 0 ? -1 : 1;
    rx += t2x * sg2 * wW * 0.35; rz += t2z * sg2 * wW * 0.35;
    changed = true;
  }
  if (!changed) { _av.x = ux; _av.z = uz; return _av; }
  var l2 = Math.sqrt(rx * rx + rz * rz) || 1;
  _av.x = rx / l2; _av.z = rz / l2;
  return _av;
}

/* ===== 共享工具:重复逻辑归一(玩家/AI/弹道链路同口径) ===== */
function tickReload(t, dt) {
  t.reload = Math.max(0, t.reload - dt * reloadDamageMult(t));   // 装填速率:人工=炮塔血量方案/自动装弹机=弹药架血量方案(reloadDamageMult 分流;转速另走 turretMult)
}

function effectiveShellSpeed(t) {                  // 实际出膛初速(炮管血量因子 0.3 下限;fireShell/AI tof/装定同口径)
  return (t.shellSpeed0 || CONF.shellSpeedE) * Math.max(0.3, barrelEff(t));
}

function shellTof0(dirY, v) {                      // 抛物线到时(纵速/重力;弹道仿真与发射同公式)
  return Math.max(0.1, 2 * dirY * v / CONF.gravity);
}

function losIntersect(ax, az, bx, bz, ray) {       // LOS 宽相位候选+求交核心(ray 由调用方配置 origin/dir/far)
  collectCands(ax, az, bx, bz, _candList);
  return ray.intersectObjects(_candList, false);
}
