/* ============================================================
   画质 / 爆炸效果 / 模型质量 —— 运行时热切换(无需刷新页面)
   部署环境不允许依赖刷新页面,设置页点选后立即调用 acApplyQuality 生效:
   · 画质(GFX):主渲染器像素比、漫画后处理 RT 缩放、阴影视距上限、植被实例系数 —— 即时生效
   · 爆炸(FXQ):并发阈值/硬顶/残骸烟/殉爆合并/尾迹/音效合并/距离与当量放大 —— 即时生效
                (爆炸贴图分辨率在加载期烘焙,保持当前贴图,不影响玩法)
   · 模型质量(MODQ):主场景太阳阴影尺寸与软阴影、车库像素比/阴影、炮塔小窗 MSAA 与后处理 —— 即时生效
   只调整渲染参数,不触碰任何游戏逻辑状态。
   ============================================================ */
(function () {
  'use strict';
  function recompileMaterials(root) {
    if (!root || !root.traverse) return;
    root.traverse(function (o) {
      var m = o.material; if (!m) return;
      (Array.isArray(m) ? m : [m]).forEach(function (mm) { if (mm) mm.needsUpdate = true; });
    });
  }

  function applyGfx(v) {
    if (typeof GFX_PRESETS === 'undefined' || !GFX_PRESETS[v]) return;
    GFX_PROFILE = v;
    GFX = GFX_PRESETS[v];                    // 显式选档:不再套用触屏默认钳制
    if (typeof GFX_TOUCH_CLAMP !== 'undefined') GFX_TOUCH_CLAMP = false;
    if (typeof GFX_TOUCH !== 'undefined' && GFX_TOUCH) {
      if (typeof COMIC_RT_SCALE !== 'undefined') COMIC_RT_SCALE = v === 'low' ? 0.66 : (v === 'mid' ? 0.75 : 1.0);
      if (typeof _shCap3rd !== 'undefined') {
        if (v === 'low') { _shCap3rd = 120; _shCapArtyTop = 200; }
        else if (v === 'mid') { _shCap3rd = 160; _shCapArtyTop = 260; }
        else { _shCap3rd = 420; _shCapArtyTop = 2400; }
      }
    }
    if (typeof _spriteCapK === 'function') {   // 植被实例系数原为惰性一次读,重置为下次重新读取
      _spriteCapK = function () {
        var k = (typeof _SPRITE_MOBILE !== 'undefined' && _SPRITE_MOBILE && typeof gfxFx === 'function') ? gfxFx('fxSpriteCap', 1.0) : 1.0;
        _spriteCapK = function () { return k; };
        return k;
      };
    }
    if (typeof renderer !== 'undefined' && renderer && typeof gfxMaxPr === 'function') {
      _basePixelRatio = gfxMaxPr();
      if (typeof drsApply === 'function') drsApply();
      else renderer.setPixelRatio(_basePixelRatio);
      renderer.setSize(innerWidth, innerHeight);
    }
    try { window.dispatchEvent(new Event('resize')); } catch (e) {}   // 让漫画 RT 等按新尺寸重建
  }

  function applyFxq(v) {
    if (typeof FXQ_PRESETS === 'undefined' || !FXQ_PRESETS[v]) return;
    FXQ_PROFILE = v;
    FXQ = FXQ_PRESETS[v];
    var f = function (k, d) { return (typeof gfxFx === 'function') ? gfxFx(k, d) : d; };
    if (typeof WRSMOKE_MAX !== 'undefined') WRSMOKE_MAX = f('fxWreckSmoke', 999);
    if (typeof WRSMOKE_R2 !== 'undefined') { var r = f('fxSmokeR', 0); WRSMOKE_R2 = r > 0 ? r * r : Infinity; }
    if (typeof CB_SAT_HI !== 'undefined') CB_SAT_HI = f('fxSatHi', 12);
    if (typeof CB_SAT_LO !== 'undefined') CB_SAT_LO = f('fxSatLo', 8);
    if (typeof CB_HARD_MAX !== 'undefined') CB_HARD_MAX = f('fxHardMax', 24);
    if (typeof _cbGroundLight !== 'undefined') _cbGroundLight = f('fxGroundLight', true);
    if (typeof VB_FRAME_MAX !== 'undefined') VB_FRAME_MAX = f('fxBurstMerge', 0);
    if (typeof _gfxTrailAdapt !== 'undefined') _gfxTrailAdapt = f('fxTrailAdapt', false);
    if (typeof _boomMerge !== 'undefined') _boomMerge = null;   // 音效合并开关下次触发时重新读取
  }

  function applyModq(v) {
    if (typeof MODQ_PRESETS === 'undefined' || !MODQ_PRESETS[v]) return;
    MODQ_PROFILE = v;
    MODQ = MODQ_PRESETS[v];
    var mq = function (k, d) { return (typeof modQ === 'function') ? modQ(k, d) : d; };
    /* 主场景太阳阴影:尺寸 + 软/硬阴影类型 */
    if (typeof renderer !== 'undefined' && renderer && typeof sunLight !== 'undefined' && sunLight && sunLight.shadow) {
      var size = mq('modSunMap', 1024);
      sunLight.shadow.mapSize.set(size, size);
      if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; }
      var type = mq('modSunSoft', true) ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
      if (renderer.shadowMap.type !== type) {
        renderer.shadowMap.type = type;
        if (typeof scene !== 'undefined') recompileMaterials(scene);
      }
    }
    /* 车库 */
    if (typeof window.__hgApplyModQ === 'function') { try { window.__hgApplyModQ(); } catch (e) {} }
    /* 炮塔 HUD 小窗:MSAA 是上下文参数 → 换一张新画布重建渲染器;后处理按档重建 */
    try {
      if (typeof _phud !== 'undefined' && _phud) {
        var wantAA = mq('modAA', true) !== false;
        if (_phud.rnd && _phud._aa !== undefined && _phud._aa !== wantAA) {
          var old = _phud.rnd.domElement;
          if (typeof _phudClear === 'function') _phudClear();
          try { _phud.rnd.dispose(); _phud.rnd.forceContextLoss(); } catch (e1) {}
          if (old && old.parentNode) {
            var nc = old.cloneNode(false);
            old.parentNode.replaceChild(nc, old);
          }
          _phud.rnd = null; _phud.scn = null; _phud.cam = null; _phud.rt = null; _phud.post = null;
        }
        if (!mq('modPost', true) && _phud.post) _phud.post = null;   // 关后处理:playerHudTick 自动走直渲分支
        _phud._aa = wantAA;
        if (typeof player !== 'undefined' && player && player.alive && typeof _phudBuild === 'function') _phudBuild();
      }
    } catch (e2) {}
  }

  window.acApplyQuality = function (kind, v) {
    try {
      if (kind === 'gfx') applyGfx(v);
      else if (kind === 'fxq') applyFxq(v);
      else if (kind === 'modq') applyModq(v);
      return true;
    } catch (e) {
      if (window.console) console.warn('acApplyQuality failed', kind, v, e);
      return false;
    }
  };
  /* 记录炮塔小窗初始 MSAA 状态,供热切换判断是否需要重建上下文 */
  try { if (typeof _phud !== 'undefined' && _phud && _phud._aa === undefined) _phud._aa = (typeof modQ === 'function') ? modQ('modAA', true) !== false : true; } catch (e) {}
})();
