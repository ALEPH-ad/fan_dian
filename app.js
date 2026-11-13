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
  /* ---------------- 顶层小弹窗（类闹钟，但不全屏） ---------------- */
  var tipTimer = null;
  var MEALS = {
    breakfast: { name: '早饭', ico: '🌅', text: '该吃早饭了～温热一点：粥、蒸蛋、半个包子，垫一垫就好。\n⚠️ 不碰膨化零食，别拿饼干凑合。' },
    lunch: { name: '午饭', ico: '☀️', text: '午饭吃七八分就好：肉和菜多一点，主食别过量。\n❌ 雷区：薯片、虾条、锅巴、爆米花、辣条、方便面 —— 会涨肚，别买。\n⚠️ 汽水、糯米、豆类少吃，吃完别马上躺。' },
    dinner: { name: '晚饭', ico: '🌙', text: '晚饭清淡一点，少油少盐，吃到舒服就放下筷子。\n🥗 睡前至少留 3 小时，吃完出去走两步。' }
  };

  /* ---------------- 提醒文案库（每顿 4 份 + 开场/结尾，随机轮换） ---------------- */
  var COPY = {
    intros: ['肚子嘀嘀咕咕了，到饭点啦～', '该吃饭了，别硬扛～', '饭点到了，先照顾一下自己的胃吧。', '停一停手里的事，吃饭时间到咯。', '这个点你大概有点饿了，去吃点正经的。', '别让肚子空熬到下午，先吃口饭。'],
    endings: ['乖乖吃顿正经饭，零食盒子先收起来～', '吃饱了心情会变好，去吧～', '慢慢吃，别着急，胃会感谢你。', '吃完记得喝点温水。'],
    meals: {
      breakfast: [
        { title: '🌅 早饭时间', body: '温热的垫一垫：粥、蒸蛋、半个包子就够。\n🍞 别拿饼干和膨化食品凑合，越吃越饿。' },
        { title: '🌅 早饭时间 · 别空腹', body: '空腹先别灌汽水，对胃不好。\n🥚 先吃点蛋白质，一上午都有精神。' },
        { title: '🌅 早饭时间 · 七分饱', body: '吃个七分饱，别撑。\n☕ 想要精神好，比咖啡更管用的是一个热乎早饭。' },
        { title: '🌅 早饭时间 · 好好吃', body: '一口一口慢慢吃，别边走边塞。\n🍚 吃饱了，上午才有底气。' }
      ],
      lunch: [
        { title: '☀️ 午饭时间 · 别吃膨化', body: '午饭七八分就好：肉和菜多一点，主食别过量。\n❌ 雷区：薯片、虾条、锅巴、爆米花、辣条、方便面 —— 会涨肚，别买。\n⚠️ 汽水、糯米、豆类少吃，吃完别马上躺。' },
        { title: '☀️ 午饭时间 · 慢慢嚼', body: '吃慢点，嚼碎了再咽，肚子更好受。\n🥬 先吃几口青菜再动主食，饱得慢一点。\n🚫 零食留到下午再说，现在先吃饭。' },
        { title: '☀️ 午饭时间 · 别用零食应付', body: '一顿正经午饭，抵得上一整袋零食。\n⚠️ 吃完渴了喝温水，别再开一罐汽水。\n🍱 吃饱就好，别撑到下午打瞌睡。' },
        { title: '☀️ 午饭时间 · 七分饱', body: '筷子放下时应该还想再吃一点点，那就对了。\n❌ 膨化食品今天先放一放。\n🚶 吃完站起来走两步。' }
      ],
      dinner: [
        { title: '🌙 晚饭时间 · 清淡少油', body: '晚饭清淡一点，少油少盐，吃到舒服就放下筷子。\n🥗 睡前至少留 3 小时，吃完出去走两步。' },
        { title: '🌙 晚饭时间 · 别吃太撑', body: '晚上吃多了最容易涨肚子、睡不好。\n🍲 汤别喝太多，饭别添第二碗。\n🚶 吃完散散步，比躺沙发强。' },
        { title: '🌙 晚饭时间 · 别碰夜宵零食', body: '晚饭好好吃，晚上就不会想找零食。\n❌ 薯片、汽水、辣条这顿都先收起来。\n🌙 睡前留出 3 小时，睡得踏实。' },
        { title: '🌙 晚饭时间 · 好好收个尾', body: '一天最后一顿，吃得舒服最重要。\n🥦 菜多一点，油少一点。\n🍵 吃完喝杯温水，别急着躺下。' }
      ]
    },
    late: [
      { title: '⏰ 饭点过了一阵啦', body: '再拖下去容易饿到乱吃东西。\n现在去吃，还来得及。' },
      { title: '⏰ 还没吃饭吗？', body: '饿狠了最容易一顿乱吃，先吃点正经的吧。' }
    ],
    remind: [
      { title: '⏰ 再提醒一下', body: '刚刚那条看到了吗？饭还没吃的话，现在去。' },
      { title: '🍚 还饿着吗？', body: '别硬扛，吃两口也好过一直饿着。' }
    ],
    summary: [
      { title: '🌙 今天吃得怎么样', body: '如果今天没碰膨化、没吃太撑，给自己点个赞。\n明天早上还会准时叫你。' },
      { title: '🌙 睡前小总结', body: '晚饭吃舒服了吗？肚子没胀就没白坚持。\n早点睡，明早见。' }
    ],
    nextMorning: [
      { title: '🌅 明早 7:30 见', body: '今晚早睡一会儿，明早给你准备了一份早饭提醒。' }
    ]
  };
  var lastCopy = {};
  function pickCopy(meal) {
    var pool = (COPY.meals[meal] || COPY.meals.lunch);
    var idx = Math.floor(Math.random() * pool.length);
    if (pool.length > 1 && idx === lastCopy[meal]) idx = (idx + 1) % pool.length;
    lastCopy[meal] = idx;
    var base = pool[idx];
    var intro = COPY.intros[Math.floor(Math.random() * COPY.intros.length)];
    var ending = COPY.endings[Math.floor(Math.random() * COPY.endings.length)];
    return { title: base.title, body: intro + '\n' + base.body + '\n' + ending };
  }
  function pickAny(list) { return list[Math.floor(Math.random() * list.length)]; }
  function popLayer() {
    var layer = $('popLayer');
    if (layer) return layer;
    layer = document.createElement('div');
    layer.className = 'pop-layer';
    layer.id = 'popLayer';
    document.body.appendChild(layer);
    return layer;
  }
  /* opts: { title, sub, body, icon, kind: 'alarm'|'info'|'tip', actions: [{label, primary, fn}], timeout } */
  function popup(opts) {
    var layer = popLayer();
    var el = document.createElement('div');
    el.className = 'pop ' + (opts.kind || 'alarm');
    var actions = opts.actions || [];
    el.innerHTML =
      '<div class="pop-head">' +
        '<div class="pop-ico">' + (opts.icon || '🍚') + '</div>' +
        '<div class="t"><div class="pop-title"></div><div class="pop-sub"><span class="live"></span><span class="sub-text"></span><span class="pop-clock"></span></div></div>' +
        '<button class="pop-close" aria-label="关闭">×</button>' +
      '</div>' +
      (opts.body ? '<div class="pop-body"></div>' : '') +
      '<div class="pop-actions' + (actions.length > 1 ? ' two' : '') + '"></div>';
    el.querySelector('.pop-title').textContent = opts.title || '提醒';
    var subText = el.querySelector('.sub-text');
    if (subText) subText.textContent = opts.sub || '';
    var bodyEl = el.querySelector('.pop-body');
    if (bodyEl) bodyEl.textContent = opts.body || '';
    var clock = el.querySelector('.pop-clock');

    function close() {
      clearInterval(clockTick);
      el.classList.remove('show');
      el.classList.add('leaving');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
      if (opts.onClose) { try { opts.onClose(); } catch (e) {} }
    }
    // 醒木式：像闹钟一样显示已弹出的秒数
    var t0 = Date.now();
    var clockTick = setInterval(function () {
      var s = Math.floor((Date.now() - t0) / 1000);
      if (clock) clock.textContent = ' · 已响 ' + pad(Math.floor(s / 60)) + ':' + pad(s % 60);
      if (opts.maxSeconds && s >= opts.maxSeconds) close();
    }, 1000);
    if (clock) clock.textContent = ' · 刚刚';
    el.querySelector('.pop-close').addEventListener('click', function () { close(); if (opts.onCancel) opts.onCancel(); });

    var actBox = el.querySelector('.pop-actions');
    actions.forEach(function (a) {
      var b = document.createElement('button');
      b.className = 'pop-btn' + (a.primary ? ' primary' : '');
      b.textContent = a.label;
      b.addEventListener('click', function () { close(); if (a.fn) setTimeout(a.fn, 60); });
      actBox.appendChild(b);
    });
    if (!actions.length) { var cur = el.querySelector('.pop-actions'); if (cur && cur.remove) cur.remove(); }

    layer.appendChild(el);
    void el.offsetWidth; // 触发重排，保证动画生效
    el.classList.add('show');
    try { if (navigator.vibrate) navigator.vibrate(opts.kind === 'alarm' ? [120, 60, 120] : 30); } catch (e) {}
    if (opts.timeout) setTimeout(close, opts.timeout);
    return { close: close, el: el };
  }
  /* 轻提示：也是顶部小条，3 秒自动收起 */
  function toast(msg, icon) {
    if (!msg) return null;
    // tip 类型的弹窗不堆叠：后来的替换前面的
    if (toast._last) { try { toast._last.remove(); } catch (e) {} toast._last = null; }
    var p = popup({ kind: 'tip', icon: icon || '🍚', title: msg, body: msg, timeout: 3000 });
    if (p && p.el) p.el.dataset = p.el.dataset || {};
    if (p && p.el) p.el.dataset.toast = msg;   // 便于自动化测试 / 排查
    toast._last = p && p.el;
    return p;
  }
  /* 到点提醒：文案从库里随机抽一份（每次都不一样） */
  function alarmPopup(mealKey, late, customCopy) {
    var m = MEALS[mealKey] || MEALS.lunch;
    var cp = customCopy || (late ? pickAny(COPY.late) : pickCopy(mealKey));
    var now = new Date();
    var hm = pad(now.getHours()) + ':' + pad(now.getMinutes());
    var icon = '🍚';
    if (mealKey === 'breakfast') icon = '🌅';
    if (mealKey === 'lunch') icon = '☀️';
    if (mealKey === 'dinner') icon = '🌙';
    if (late) icon = '⏰';
    var dayName = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()];
    return popup({
      kind: 'alarm',
      icon: icon,
      title: cp.title,
      sub: dayName + ' ' + hm + ' · ' + (late ? '补发提醒' : '到点啦'),
      body: cp.body,
      maxSeconds: 180,
      onClose: function () { markSeen(mealKey); },
      actions: [
        { label: '我要去吃', primary: true, fn: function () { markDone(mealKey); toast('好，去吧 🍲', '🍲'); } },
        { label: '10 分钟后再叫我', fn: function () { snoozePopup(mealKey); } },
        { label: '别提醒了', fn: function () { markDone(mealKey); toast('这次跳过', '🔕'); } }
      ]
    });
  }
  function infoPopup(cp, icon) {
    var now = new Date();
    return popup({
      kind: 'alarm',
      icon: icon || '✨',
      title: cp.title,
      sub: pad(now.getHours()) + ':' + pad(now.getMinutes()) + ' · 小提示',
      body: cp.body,
      maxSeconds: 120,
      actions: [{ label: '知道了', primary: true }]
    });
  }
  function previewPopup() {
    var now = new Date();
    var mins = now.getHours() * 60 + now.getMinutes();
    var key = mins < 10 * 60 + 30 ? 'breakfast' : (mins < 15 * 60 ? 'lunch' : 'dinner');
    alarmPopup(key, false);
  }

  /* ---------------- 手机端到点提醒（页面开着时也能响） ---------------- */
  var KEY_LOG = 'fd_alert_log';   // 本地记录：哪天哪顿弹过、点过通知、点过要吃饭
  function todayKey2(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function readLog() {
    try { return JSON.parse(localStorage.getItem(KEY_LOG) || '{}'); } catch (e) { return {}; }
  }
  function writeLog(o) {
    // 只保留最近两天，避免越存越大
    var keys = Object.keys(o);
    if (keys.length > 6) { keys.sort(); keys.slice(0, keys.length - 6).forEach(function (k) { delete o[k]; }); }
    try { localStorage.setItem(KEY_LOG, JSON.stringify(o)); } catch (e) {}
  }
  function markSeen(meal) {
    var log = readLog(), d = todayKey2();
    log[d + '|' + meal] = Object.assign(log[d + '|' + meal] || {}, { seen: Date.now() });
    writeLog(log);
  }
  function markDone(meal) {
    var log = readLog(), d = todayKey2();
    log[d + '|' + meal] = Object.assign(log[d + '|' + meal] || {}, { done: Date.now() });
    writeLog(log);
  }
  function snoozePopup(meal) {
    var log = readLog(), d = todayKey2();
    log[d + '|' + meal] = Object.assign(log[d + '|' + meal] || {}, { snooze: Date.now() + 10 * 60000 });
    writeLog(log);
    toast('10 分钟后我再来叫你', '⏰');
  }
  function mealKey(i) { return ['breakfast', 'lunch', 'dinner'][i] || 'lunch'; }
  function hmToMin(hm) { var p = String(hm || '0:0').split(':'); return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0); }

  // 到点检查：页面开着就会在顶部弹窗 + 系统通知 + 声音震动
  function checkMealAlert() {
    var p = data().prefs || {};
    if (p.enabled === false) return { popups: 0, notes: 0, reminders: 0, buzzed: false };
    var now = new Date();
    var d = todayKey2(now);
    var minutes = now.getHours() * 60 + now.getMinutes();
    var log = readLog();
    var res = { popups: 0, notes: 0, reminders: 0, buzzed: false };
    var times = p.times || ['07:30', '11:45', '17:45'];
    var days = p.days || [0, 1, 2, 3, 4, 5, 6];

    for (var i = 0; i < 3; i++) {
      var key = d + '|' + mealKey(i);
      var rec = log[key] || {};
      var t = hmToMin(times[i]);
      var diff = minutes - t;

      // A. 准点：到点 60 分钟内、还没弹过
      if (diff >= 0 && diff <= 60 && !rec.pop && days.indexOf(now.getDay()) >= 0) {
        rec.pop = Date.now();
        alarmPopup(mealKey(i), diff >= 10);
        res.popups++;
        // 顺手发一条系统通知，锁屏/切出去也能看到
        if (navigator.serviceWorker && navigator.serviceWorker.ready) {
          navigator.serviceWorker.ready.then(function (reg) {
            try {
              reg.showNotification('🍚 到饭点啦', {
                body: '打开铁线饭点看看今天的提醒。',
                tag: 'fd-meal-' + key, icon: 'icon-192.png', badge: 'badge-72.png', vibrate: [150, 70, 150]
              });
            } catch (e) {}
          })['catch'](function () {});
        }
        res.notes++;
        beepAndVibrate();
        res.buzzed = true;
        log[key] = rec;
        writeLog(log);
        continue;
      }

      // B. 没确认：过了 30 分钟再催一次（最多催 1 次）
      if (rec.pop && !rec.done && !rec.remind && (Date.now() - (rec.snooze || rec.pop)) > 30 * 60000 && diff > 0) {
        rec.remind = Date.now();
        popup({
          kind: 'alarm', icon: '⏰', title: pickAny(COPY.remind).title, sub: '还没确认吃饭吗', body: pickAny(COPY.remind).body,
          maxSeconds: 90,
          actions: [{ label: '我吃了', primary: true, fn: function () { markDone(mealKey(i)); } }, { label: '待会吃', fn: function () { snoozePopup(mealKey(i)); } }]
        });
        log[key] = rec;
        writeLog(log);
        res.reminders++;
        beepAndVibrate();
        res.buzzed = true;
      }
    }
    return res;
  }

  // 页面重新回到前台时：如果错过了饭点（90 分钟内）补发一次
  function catchUpAlert() {
    var p = data().prefs || {};
    if (p.enabled === false) return 0;
    var now = new Date(), d = todayKey2(now), minutes = now.getHours() * 60 + now.getMinutes();
    var log = readLog(), times = p.times || [], n = 0;
    for (var i = 0; i < 3; i++) {
      var diff = minutes - hmToMin(times[i]);
      var key = d + '|' + mealKey(i);
      if (diff >= 0 && diff <= 90 && !(log[key] && log[key].pop)) {
        log[key] = Object.assign(log[key] || {}, { pop: Date.now(), late: true });
        writeLog(log);
        alarmPopup(mealKey(i), true);
        n++;
        break;
      }
    }
    return n;
  }

  // 傍晚总结 / 第二天早上预提醒
  function checkDailyNotes() {
    var log = readLog(), d = todayKey2();
    if (log['summary|' + d]) return;
    var minutes = new Date().getHours() * 60 + new Date().getMinutes();
    if (minutes >= 20 * 60 + 30) {
      log['summary|' + d] = 1; writeLog(log);
      infoPopup(pickAny(COPY.summary), '🌙');
    }
  }

  // 提示音 + 震动（网页静音也可能没声音，震动一般可以用）
  function beepAndVibrate() {
    try { if (navigator.vibrate) navigator.vibrate([200, 90, 200, 90, 360]); } catch (e) {}
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      var ctx = new AC();
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(880, ctx.currentTime);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.55);
      setTimeout(function () { try { ctx.close(); } catch (e) {} }, 1200);
    } catch (e) {}
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
        // 先把闹钟式小弹窗弹出来，确认页面提醒长这样
        alarmPopup('lunch', false);
        if (!localStorage.getItem('fd_token')) {
          showUnlock('还差一步：粘贴一次 GitHub 令牌，把手机登记到云端。');
          return;
        }
        return writeRemote('登记推送订阅').then(function () { toast('云端也登记好了，点「测试真推送」', '🎉'); });
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
    writeRemote('测试推送')
      .then(function () { toast('测试已排队，5 分钟内会在手机顶层弹出', '🧪'); })
      ['catch'](function () {});
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
    on('previewBtn', 'click', previewPopup);

    // 收到服务器推送时，页面若在前台，也在最上层弹同款小弹窗
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', function (ev) {
        var d = (ev && ev.data) || {};
        if (d.type === 'meal-alert') {
          alarmPopup(d.meal || 'lunch', !!d.late, d.title ? { title: d.title, body: d.body || '' } : null);
          beepAndVibrate();
        }
        if (d.type === 'meal-done') {
          markDone(d.meal || 'lunch');
          toast('记下了，好好吃 🍚', '🍚');
        }
      });
    }

    /* ---- 页面开着时的到点提醒：弹窗 + 系统通知 + 声音震动 ---- */
    setTimeout(function () { try { checkMealAlert(); } catch (e) {} }, 1500);
    setInterval(function () {
      try { checkMealAlert(); } catch (e) {}
      try { checkDailyNotes(); } catch (e) {}
    }, 30000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      try { checkMealAlert(); } catch (e) {}
      try { if (!catchUpAlert()) checkDailyNotes(); } catch (e) {}
      try { readRemote().then(render); } catch (e) {}
    });
    window.addEventListener('focus', function () { try { checkMealAlert(); } catch (e) {} });
    // 联网恢复时立即补查一次（断网回来也能补到）
    window.addEventListener('online', function () { try { checkMealAlert(); catchUpAlert(); } catch (e) {} });
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

  /* 自动化测试入口（页面里正常使用不受影响） */
  window.__fdTest = {
    tickForTest: function () { var r = checkMealAlert(); try { checkDailyNotes(); } catch (e) {} return r; },
    catchUpForTest: catchUpAlert,
    resetFired: function () { try { localStorage.removeItem(KEY_LOG); } catch (e) {} },
    setPrefs: function (p) { state.data = data(); state.data.prefs = Object.assign(state.data.prefs || {}, p); },
    setAckSkipForTest: function () {
      var log = readLog(), d = todayKey2();
      log[d + '|lunch'] = { pop: Date.now() - 40 * 60000, snooze: Date.now() - 31 * 60000 };
      writeLog(log);
    },
    setNowTest: function () {},
    pickCopyForTest: function (meal) { var c = pickCopy(meal); return c.title + ' | ' + c.body.split('\n')[1]; },
    previewForTest: previewPopup
  };
})();
