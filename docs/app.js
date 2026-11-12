// 铁线饭点 · 单文件版（不依赖任何外部脚本，复制粘贴就能用）
// 仓库名写死在这里，配置文件读不到也不影响使用
(function () {
  'use strict';

  var REPO = 'ALEPH-ad/fan_dian';
  var API = 'https://api.github.com/repos/' + REPO + '/contents/data.json';
  var VAPID_FALLBACK = 'BC9D6xT_zCkI6LyCs66JsrzqYeiax7dsgQfVUFkK1Q_VOWD0SRcFuSPwT67Ici_BrJjHJFYOGdD8-94Iu_a0asI';
  var state = { data: null, sha: null, token: '', busy: false, lastError: '' };

  /* ---------------- 小工具 ---------------- */
  function $(id) { return document.getElementById(id); }
  function setText(id, t) { var e = $(id); if (e) e.textContent = t; }
  function showEl(id, on) { var e = $(id); if (e) e.classList[on ? 'remove' : 'add']('hide'); }
  function on(id, type, fn) { var e = $(id); if (e) e.addEventListener(type, fn); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function toast(msg, icon) {
    var t = $('toast');
    if (!t) { console.log('[toast]', msg); return; }
    setText('toastIcon', icon || '🍚');
    setText('toastText', msg);
    t.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function b64uToBytes(s) {
    var t = s.replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    return Uint8Array.from(atob(t), function (c) { return c.charCodeAt(0); });
  }
  function randomId() {
    var a = new Uint8Array(9); crypto.getRandomValues(a);
    return btoa(String.fromCharCode.apply(null, a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function todayKey() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent); }
  function isStandalone() { return (matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }

  /* ---------------- 默认数据 ---------------- */
  function defaults() {
    return {
      subs: [],
      prefs: { enabled: true, window: 60, times: ['07:30', '11:45', '17:45'], days: [0, 1, 2, 3, 4, 5, 6], theme: 'terracotta', nameBad: true },
      fired: {}
    };
  }
  function normalize(d) {
    var o = clone(defaults());
    d = d || {};
    o.subs = Array.isArray(d.subs) ? d.subs : [];
    o.prefs = Object.assign(o.prefs, d.prefs || {});
    o.fired = d.fired || {};
    return o;
  }
  function data() { if (!state.data) state.data = defaults(); return state.data; }

  /* ---------------- 和 GitHub 同步 ---------------- */
  function headers() {
    var h = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' };
    if (state.token) h.Authorization = 'Bearer ' + state.token;
    return h;
  }
  function readRemote() {
    return fetch(API + '?t=' + Date.now(), { headers: headers(), cache: 'no-store' }).then(function (r) {
      if (r.status === 404) { state.data = defaults(); state.sha = null; return; }
      if (!r.ok) throw new Error('读取失败 ' + r.status);
      return r.json().then(function (j) {
        var d = defaults();
        try { d = JSON.parse(decodeURIComponent(escape(atob(j.content.replace(/\s/g, ''))))); } catch (e) {}
        state.data = normalize(d);
        state.sha = j.sha;
      });
    });
  }
  function writeRemote(msg) {
    if (!state.token) return Promise.reject(new Error('还没有令牌'));
    if (state.busy) return Promise.reject(new Error('正在同步，请稍等'));
    state.busy = true;
    return readRemote().catch(function () {}).then(function () {
      var body = {
        message: 'fan-dian: ' + (msg || '更新'),
        content: btoa(unescape(encodeURIComponent(JSON.stringify(data(), null, 2)))),
        branch: 'main'
      };
      if (state.sha) body.sha = state.sha;
      return fetch(API, { method: 'PUT', headers: headers(), body: JSON.stringify(body) });
    }).then(function (r) {
      if (!r.ok) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          var hint = r.status === 401 ? '令牌无效或过期' : r.status === 403 ? '令牌没权限' : r.status === 409 ? '文件刚被改过，再点一次' : '';
          throw new Error('写入失败 ' + r.status + (hint ? '：' + hint : '') + (j.message ? ' · ' + j.message : ''));
        });
      }
      return r.json().then(function (j) { state.sha = j && j.content && j.content.sha; });
    }).then(function () {
      localStorage.setItem('fd_token', state.token);
      state.lastError = '';
      showEl('subError', false);
    })['catch'](function (e) {
      state.lastError = e.message || String(e);
      setText('subError', '❌ ' + state.lastError);
      showEl('subError', true);
      throw e;
    })['finally'](function () { state.busy = false; });
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    var p = data().prefs;
    // 开关
    if ($('onSwitch')) $('onSwitch').checked = p.enabled !== false;
    if ($('nameSwitch')) $('nameSwitch').checked = p.nameBad !== false;
    // 时间
    var box = $('times');
    if (box) {
      var labels = ['🌅 早饭', '☀️ 午饭', '🌙 晚饭'];
      box.innerHTML = labels.map(function (m, i) {
        return '<div class="time-row"><span class="meal">' + m + '</span><input type="time" data-t="' + i + '" value="' + (p.times[i] || '07:30') + '"></div>';
      }).join('');
      box.querySelectorAll('input[type=time]').forEach(function (inp) {
        inp.addEventListener('change', function () {
          if (!inp.value) return;
          data().prefs.times[Number(inp.dataset.t)] = inp.value;
          save('改饭点时间');
        });
      });
    }
    // 星期
    ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].forEach(function (d, i) {
      var e = $('day-' + d);
      if (e) e.classList[p.days.indexOf(i) >= 0 ? 'add' : 'remove']('on');
    });
    // 提醒时长
    var seg = $('windowSeg');
    if (seg) seg.querySelectorAll('button').forEach(function (b) { b.classList[Number(b.dataset.win) === p.window ? 'add' : 'remove']('on'); });
    // 主题
    document.documentElement.setAttribute('data-theme', p.theme || 'terracotta');
    document.querySelectorAll('#themes button').forEach(function (b) { b.classList[b.dataset.theme === p.theme ? 'add' : 'remove']('on'); });
    // 设备
    var mine = localStorage.getItem('fd_sub');
    setText('subsCount', data().subs.length + ' 台设备已登记');
    var list = $('subsList');
    if (list) {
      list.innerHTML = data().subs.length ? data().subs.map(function (s, i) {
        return '<div class="sub' + (s.id === mine ? ' mine' : '') + '"><div><b>' + (s.id === mine ? '📱 这台手机' : '🖥 其他设备') + '</b></div><button class="x" data-del="' + i + '">×</button></div>';
      }).join('') : '<div class="empty">还没有设备</div>';
      list.querySelectorAll('button[data-del]').forEach(function (b) {
        b.addEventListener('click', function () { data().subs.splice(Number(b.dataset.del), 1); save('移除设备'); });
      });
    }
    // 同步状态
    var connected = !!localStorage.getItem('fd_token');
    setText('syncState', connected ? '已连接 ' + REPO : '未连接（只需一次令牌）');
    setText('syncBtn', connected ? '重新同步' : '连接仓库');
    // 铃铛状态
    var sub = data().subs.filter(function (s) { return s.id === mine; })[0];
    var bell = $('bell');
    if (bell) bell.classList[sub ? 'add' : 'remove']('on');
    setText('bellState', sub ? '已开启 · 手机系统会自动提醒' : '未开启 · 点下面开启');
    showEl('disableBtn', !!sub);
    showEl('webPushTestBtn', !!sub);
    var perm = ('Notification' in window) ? Notification.permission : 'unsupported';
    setText('permPill', { granted: '已允许', denied: '已拒绝', default: '待允许', unsupported: '不支持' }[perm] || '');
    if ($('permPill')) $('permPill').className = 'pill' + (perm === 'granted' ? ' ok' : '');
    showEl('iosCard', !(isIOS() && !isStandalone()));
    drawWire();
  }
  function save(msg) {
    render();
    if (!localStorage.getItem('fd_token')) { toast('已保存在本机（令牌可自动同步）', '💾'); return; }
    writeRemote(msg).then(function () { toast('已同步 ✓', '☁️'); })['catch'](function (e) { toast(String(e.message || e), '⚠️'); });
  }

  /* ---------------- 铁线时钟 ---------------- */
  function drawWire() {
    var host = $('wire');
    if (!host) return;
    var NS = 'http://www.w3.org/2000/svg';
    var meals = [
      { label: '早饭', time: (data().prefs.times[0] || '07:30'), x: 74, y: 100 },
      { label: '午饭', time: (data().prefs.times[1] || '11:45'), x: 226, y: 212 },
      { label: '晚饭', time: (data().prefs.times[2] || '17:45'), x: 96, y: 330 }
    ];
    var today = todayKey(), fired = data().fired || {};
    var sent = [0, 1, 2].some(function (i) { return fired[today + '|' + i]; });
    host.innerHTML = '';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 320 420');
    svg.setAttribute('class', 'wire-svg');
    var path = document.createElementNS(NS, 'path');
    path.setAttribute('d', 'M 26 18 C 150 16, 34 120, 104 132 S 246 160, 232 208 S 60 282, 116 302 S 190 352, 150 404');
    path.setAttribute('class', 'wire-line');
    svg.appendChild(path);
    meals.forEach(function (m, i) {
      var g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'wire-node');
      g.style.setProperty('--i', i);
      [['circle', { cx: m.x, cy: m.y, r: 16, 'class': 'node-halo' }],
       ['circle', { cx: m.x, cy: m.y, r: 7.5, 'class': 'node-dot' }],
       ['text', { x: m.x, y: m.y - 24, 'text-anchor': 'middle', 'class': 'node-label', text: m.label }],
       ['text', { x: m.x, y: m.y + 34, 'text-anchor': 'middle', 'class': 'node-time', text: m.time }]
      ].forEach(function (spec) {
        var el = document.createElementNS(NS, spec[0]);
        Object.keys(spec[1]).forEach(function (k) {
          if (k === 'text') el.textContent = spec[1][k]; else el.setAttribute(k, spec[1][k]);
        });
        g.appendChild(el);
      });
      svg.appendChild(g);
    });
    host.appendChild(svg);
    var cap = document.createElement('div');
    cap.className = 'wire-caption' + (sent ? ' sent' : '');
    cap.innerHTML = sent
      ? '<b>今天的提醒已送达</b><span>线走到这里，剩下的交给晚饭前的那阵饥饿感吧。</span>'
      : '<b>铁丝正在路上</b><span>到点手机会自己响 · ' + meals.map(function (m) { return m.time; }).join(' / ') + '</span>';
    host.appendChild(cap);
  }

  /* ---------------- 推送 ---------------- */
  function vapidKey() {
    return fetch('config.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (c) { return (c && c.vapidPublicKey) || VAPID_FALLBACK; })
      ['catch'](function () { return VAPID_FALLBACK; });
  }
  function waitSW() {
    return new Promise(function (resolve, reject) {
      if (!('serviceWorker' in navigator)) return reject(new Error('这个浏览器不支持网页推送'));
      navigator.serviceWorker.register('sw.js')['catch'](function () {});
      navigator.serviceWorker.ready.then(resolve);
      setTimeout(function () { reject(new Error('Service Worker 没有就绪，请刷新页面重试')); }, 12000);
    });
  }
  function enablePush() {
    if (isIOS() && !isStandalone()) { showIOS(); return Promise.resolve(); }
    if (!('Notification' in window)) { toast('浏览器不支持通知', '⚠️'); return Promise.resolve(); }
    return waitSW().then(function (reg) {
      return Promise.all([Notification.requestPermission(), vapidKey()]).then(function (res) {
        var perm = res[0], key = res[1];
        if (perm !== 'granted') throw new Error('通知被拒绝了，请到浏览器设置里允许本站通知');
        return reg.pushManager.getSubscription().then(function (sub) {
          if (sub) return sub;
          return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(key) });
        });
      }).then(function (sub) {
        var j = sub.toJSON();
        var mine = localStorage.getItem('fd_sub');
        var rec = {
          id: mine || randomId(),
          endpoint: j.endpoint,
          keys: j.keys,
          ua: (navigator.userAgent || '').slice(0, 120),
          days: [0, 1, 2, 3, 4, 5, 6],
          created: Date.now()
        };
        var old = data().subs.filter(function (s) { return s.id === mine; })[0];
        if (old) { rec.days = old.days || rec.days; rec.created = old.created || rec.created; }
        data().subs = data().subs.filter(function (s) { return s.id !== rec.id && s.endpoint !== rec.endpoint; });
        data().subs.push(rec);
        localStorage.setItem('fd_sub', rec.id);
        render();
        // 本机先弹一条，确认通知真的能用
        try {
          reg.showNotification('🔔 已开启推送', {
            body: '这是本机测试。到饭点会像这样叫你：午饭别吃膨化、别吃涨肚。',
            tag: 'fd-enabled', icon: 'icon-192.png', badge: 'badge-72.png', vibrate: [150, 60, 150]
          });
        } catch (e) {}
        toast('本机通知已开启，正在上传到云端…', '🔔');
        if (!localStorage.getItem('fd_token')) {
          showUnlock('还差一步：粘贴一次 GitHub 令牌，把手机登记到云端。');
          return;
        }
        return writeRemote('登记推送订阅').then(function () { toast('云端也登记好了！点「测试真推送」', '🎉'); });
      });
    })['catch'](function (e) {
      setText('subError', '❌ ' + (e.message || e));
      showEl('subError', true);
    });
  }
  function testPush() {
    var mine = localStorage.getItem('fd_sub');
    var sub = data().subs.filter(function (s) { return s.id === mine; })[0];
    if (!sub) { toast('请先开启推送', '⚠️'); return; }
    sub.test = Date.now();
    if (!localStorage.getItem('fd_token')) { showUnlock('需要一个令牌才能把「测试」通知服务器'); return; }
    writeRemote('测试推送').then(function () { toast('测试已排队，5 分钟内到（可锁屏等）', '🧪'); })['catch'](function () {});
  }

  /* ---------------- 令牌 ---------------- */
  function showUnlock(msg) {
    showEl('unlockCard', true);
    setText('unlockMsg', msg || '粘贴一次 GitHub 令牌（只保存在本机）');
  }
  function checkToken(t) {
    return fetch('https://api.github.com/user', { headers: { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json' } })
      .then(function (r) {
        if (r.status === 401) throw new Error('令牌无效或已过期（401），请重新生成');
        if (!r.ok) throw new Error('检查令牌失败（' + r.status + '）');
        return r.json();
      });
  }
  function bindToken() {
    on('syncBtn', 'click', function () { showUnlock(); });
    on('testTokenBtn', 'click', function () {
      var t = ($('tokenInput') || {}).value || '';
      t = t.trim();
      if (!t) { setText('unlockMsg', '请先把令牌粘贴到上面的框里'); return; }
      if (!/^gh[ps]_/.test(t)) { setText('unlockMsg', '这串不像 GitHub 令牌（应以 ghp_ 开头）'); return; }
      setText('unlockMsg', '正在检查…');
      checkToken(t).then(function (u) {
        setText('unlockMsg', '✅ 令牌有效（账号 ' + (u.login || '') + '），现在点「保存并同步」');
      })['catch'](function (e) { setText('unlockMsg', '❌ ' + e.message); });
    });
    on('saveToken', 'click', function () {
      var btn = $('saveToken');
      var t = (($('tokenInput') || {}).value || '').trim();
      if (!t) { setText('unlockMsg', '请先把令牌粘贴到上面的框里'); return; }
      if (!/^gh[ps]_/.test(t)) { setText('unlockMsg', '这串不像 GitHub 令牌（应以 ghp_ 开头）'); return; }
      if (btn) { btn.disabled = true; btn.textContent = '正在同步…'; }
      state.token = t;
      checkToken(t)
        .then(function () { return writeRemote('连接仓库'); })
        .then(function () {
          showEl('unlockCard', false);
          toast('连接成功，以后自动同步 ✓', '☁️');
          render();
        })
        ['catch'](function (e) {
          setText('unlockMsg', '❌ ' + (e.message || e));
        })['finally'](function () {
          if (btn) { btn.disabled = false; btn.textContent = '保存并同步'; }
        });
    });
  }

  /* ---------------- iOS 提示 ---------------- */
  function showIOS() {
    showEl('unlockSheet', true);
    setText('iosTitle', 'iPhone 需要先「添加到主屏幕」');
    var ul = $('iosSteps');
    if (ul) ul.innerHTML = '<li>用 Safari 打开本页 → 底部「分享」→「添加到主屏幕」</li><li>从桌面图标打开本页</li><li>再点「开启推送」并允许通知</li><li>之后关掉 App、锁屏也会响（iOS 16.4+）</li>';
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    state.token = localStorage.getItem('fd_token') || '';
    render();
    readRemote().then(render)['catch'](function () { render(); });

    on('enableBtn', 'click', enablePush);
    on('disableBtn', 'click', function () {
      navigator.serviceWorker.ready.then(function (reg) {
        return reg.pushManager.getSubscription();
      }).then(function (sub) { return sub ? sub.unsubscribe() : null; })['catch'](function () {});
      var mine = localStorage.getItem('fd_sub');
      if (mine) {
        data().subs = data().subs.filter(function (s) { return s.id !== mine; });
        localStorage.removeItem('fd_sub');
        if (localStorage.getItem('fd_token')) writeRemote('取消订阅')['catch'](function () {});
      }
      render();
      toast('已关闭推送', '🔕');
    });
    on('webPushTestBtn', 'click', testPush);
    on('onSwitch', 'change', function (e) { data().prefs.enabled = e.target.checked; save(e.target.checked ? '开启提醒' : '暂停提醒'); });
    on('nameSwitch', 'change', function (e) { data().prefs.nameBad = e.target.checked; save('改文案'); });
    on('windowSeg', 'click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      data().prefs.window = Number(b.dataset.win); save('改提醒时长');
    });
    on('themes', 'click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      data().prefs.theme = b.dataset.theme; render(); save('换主题');
    });
    document.querySelectorAll('.days').forEach(function (row) {
      row.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        var d = Number(b.dataset.day), p = data().prefs;
        p.days = p.days.indexOf(d) >= 0 ? p.days.filter(function (x) { return x !== d; }) : p.days.concat([d]).sort();
        b.classList.toggle('on'); save('改提醒日');
      });
    });
    on('iosCardBtn', 'click', showIOS);
    on('iosGotIt', 'click', function () { showEl('unlockSheet', false); });
    on('iosClose', 'click', function () { showEl('unlockSheet', false); });
    bindToken();

    setInterval(function () { var c = $('clock'); if (c) c.textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false }); }, 1000);
    var c0 = $('clock'); if (c0) c0.textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js')['catch'](function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
