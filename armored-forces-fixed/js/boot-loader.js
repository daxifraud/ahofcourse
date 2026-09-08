(function () {
  var pct = 0;
  var targetPct = 20;
  var fillEl = null, pctEl = null, statEl = null, loaderEl = null;
  var isDone = false;
  var pakEl = null, containerEl = null, pakArmed = false, pakCb = null;
  var pakUsed = false;   // 「按任意键开始游戏」只在游戏初始化启用一次: 开始之后(含对局退回车库的重建)不再拦截手势

  /* ===== 「按任意键开始游戏」中转层 =====
     加载完成后不直接露出主菜单: 先黑屏闪烁提示, 等一个真实用户手势(任意键/鼠标/触摸)
     再收层进菜单 —— 该手势同时是浏览器 Autoplay 的用户手势, BGM 在 dismiss 时播放必然放行。
     合成事件(isTrusted=false, 如加载起始派发的合成左键)一律不认, 防止自动"按键"。 */
  function _pakGesture(e) {
    if (typeof e.isTrusted === 'boolean' && !e.isTrusted) return;
    _pakDismiss();
  }
  function _pakDismiss() {
    if (!pakArmed) return;
    pakArmed = false;
    var cb = pakCb; pakCb = null;
    window.removeEventListener('keydown', _pakGesture);
    window.removeEventListener('pointerdown', _pakGesture);
    window.removeEventListener('mousedown', _pakGesture);
    window.removeEventListener('touchstart', _pakGesture);
    var pe = getPakEl();
    if (pe) pe.classList.add('pak-off');
    setTimeout(function () {
      if (loaderEl) {
        loaderEl.classList.add('hidden-loader');
        loaderEl.style.display = 'none';
        loaderEl.style.pointerEvents = 'none';
      }
      if (typeof playMenuBgm === 'function') playMenuBgm();
      if (cb) cb();
      if (pe) setTimeout(function () { pe.classList.remove('pak-on', 'pak-off'); }, 400);
    }, 380);
  }
  function _pakShow(cb) {
    getEls();
    if (pakUsed) {   // 已用过: 直接收层并回调, 不再闪烁提示/拦截手势(开始之后不要再启用)
      if (containerEl) containerEl.style.display = 'none';
      if (loaderEl) {
        loaderEl.classList.add('hidden-loader');
        loaderEl.style.display = 'none';
        loaderEl.style.pointerEvents = 'none';
      }
      var peDone = getPakEl();
      if (peDone) peDone.classList.remove('pak-on', 'pak-off');
      if (typeof playMenuBgm === 'function') { try { playMenuBgm(); } catch (eBgm) {} }
      if (cb) cb();
      return;
    }
    pakUsed = true;
    var pe = getPakEl();
    if (!pe) {   // DOM 无提示层时兜底: 直接隐藏加载层(旧行为)
      if (loaderEl) {
        loaderEl.classList.add('hidden-loader');
        loaderEl.style.display = 'none';
        loaderEl.style.pointerEvents = 'none';
      }
      if (typeof playMenuBgm === 'function') playMenuBgm();
      if (cb) cb();
      return;
    }
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (eBlur) {}
    if (containerEl) containerEl.style.display = 'none';   // 收起进度条, 保持纯黑底
    pe.classList.remove('pak-off');
    pe.classList.add('pak-on');
    pakCb = cb;
    if (!pakArmed) {
      pakArmed = true;
      window.addEventListener('keydown', _pakGesture);
      window.addEventListener('pointerdown', _pakGesture);
      window.addEventListener('mousedown', _pakGesture);
      window.addEventListener('touchstart', _pakGesture, { passive: true });
    }
  }

  /* 实验:加载刚开始派发合成左键。isTrusted=false,不能当作 Autoplay 用户手势。 */
  (function trySyntheticLeftClick() {
    try {
      var host = document.getElementById('game-boot-loader') || document.body;
      var x = 12, y = 12;
      var common = { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1, clientX: x, clientY: y };
      if (typeof PointerEvent === 'function') {
        host.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ pointerId: 1, pointerType: 'mouse' }, common)));
      }
      host.dispatchEvent(new MouseEvent('mousedown', common));
      host.dispatchEvent(new MouseEvent('mouseup', common));
      host.dispatchEvent(new MouseEvent('click', common));
    } catch (eSyn) {}
    setTimeout(function () {
      if (typeof playMenuBgm === 'function') playMenuBgm();
    }, 0);
  })();

  function getPakEl() {
    if (!pakEl) pakEl = document.getElementById('boot-pak');
    return pakEl;
  }
  function getEls() {
    if (!fillEl) fillEl = document.getElementById('loader-fill');
    if (!pctEl) pctEl = document.getElementById('loader-pct');
    if (!statEl) statEl = document.getElementById('loader-status');
    if (!loaderEl) loaderEl = document.getElementById('game-boot-loader');
    if (!containerEl && loaderEl) containerEl = loaderEl.querySelector('.loader-container');
  }

  window._setBootProgress = function (p, statusText) {
    targetPct = Math.max(targetPct, Math.min(100, Math.round(p)));
    getEls();
    if (statEl && statusText) statEl.textContent = statusText;
  };

  window._finishBootLoader = function () {
    window._setBootProgress(100, 'SYSTEM READY // LAUNCHING...');
    isDone = true;
    setTimeout(function () {
      if (typeof playMenuBgm === 'function') playMenuBgm();
    }, 200);
  };

  window.showBootLoading = function (statusText, onDone) {
    getEls();
    if (!loaderEl) {
      loaderEl = document.createElement('div');
      loaderEl.id = 'game-boot-loader';
      loaderEl.innerHTML = '<div class="loader-container">' +
        '<div class="loader-header">' +
          '<span class="loader-title">TACTICAL SYSTEM // INITIALIZING</span>' +
          '<span id="loader-pct" class="loader-pct">0%</span>' +
        '</div>' +
        '<div class="loader-track">' +
          '<div id="loader-fill" class="loader-fill"></div>' +
          '<div class="loader-grid-overlay"></div>' +
        '</div>' +
        '<div class="loader-footer">' +
          '<span id="loader-status" class="loader-status">LOADING ASSETS &amp; COMPILED SHADERS...</span>' +
          '<span class="loader-cursor blink">_</span>' +
        '</div>' +
      '</div>';
      document.body.appendChild(loaderEl);
      fillEl = pctEl = statEl = null;
      getEls();
    }
    loaderEl.classList.remove('hidden-loader');
    loaderEl.style.display = 'flex';
    loaderEl.style.opacity = '1';
    loaderEl.style.pointerEvents = 'auto';
    if (statEl && statusText) statEl.textContent = statusText;
    if (fillEl) fillEl.style.width = '0%';
    if (pctEl) pctEl.textContent = '0%';

    var cur = 0;
    var startT = (window.performance && performance.now) ? performance.now() : Date.now();
    var dur = 460;
    function anim(now) {
      var t = Math.min(1, (now - startT) / dur);
      cur = t * 100;
      if (fillEl) fillEl.style.width = cur.toFixed(1) + '%';
      if (pctEl) pctEl.textContent = Math.floor(cur) + '%';
      if (t < 1) {
        requestAnimationFrame(anim);
      } else {
        if (pctEl) pctEl.textContent = '100%';
        if (statEl) statEl.textContent = 'SYSTEM READY // LAUNCHING...';
        _pakShow(function () { if (onDone) onDone(); });   // 回车库重建完成后同样走「按任意键」中转
      }
    }
    requestAnimationFrame(anim);
  };

  function tick() {
    getEls();
    if (pct < targetPct) {
      pct += Math.max(0.6, (targetPct - pct) * 0.22);
      if (pct > targetPct) pct = targetPct;
    }
    var intP = Math.floor(pct);
    if (fillEl) fillEl.style.width = pct + '%';
    if (pctEl) pctEl.textContent = intP + '%';

    if (isDone && pct >= 99.5) {
      if (fillEl) fillEl.style.width = '100%';
      if (pctEl) pctEl.textContent = '100%';
      _pakShow(null);   // 加载完成≠进入: 先闪烁「按任意键开始游戏」, 等真实手势后再收层露出主菜单
      return;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
