// 说明：wire.js 已通过 <script> 先加载，它也把同名函数挂到了 window 上。
// 两个文件都是全局脚本，所以这里不能再声明 createWire，否则会冲突。
(function () {
  if (typeof window.createWire !== 'function') {
    window.createWire = function (host) { host.innerHTML = ''; };
  }
})();
// 仓库名以 config.json 为准（window.__FD_REPO__ 只是兜底）
let repoPath = (window.__FD_REPO__ || '').replace(/^\/+|\/+$/g, '');
const DATA_PATH = 'data.json';
let API = repoPath ? `https://api.github.com/repos/${repoPath}/contents/${DATA_PATH}` : '';

const DEFAULTS = {
  subs: [],
  prefs: { enabled: true, window: 60, times: ['07:30', '11:45', '17:45'], days: [0, 1, 2, 3, 4, 5, 6], theme: 'terracotta', nameBad: true },
  fired: {}
};

// 兼容老版本浏览器（structuredClone 在旧版里没有）
const clone = (obj) => JSON.parse(JSON.stringify(obj));

const state = {
  data: clone(DEFAULTS),
  sha: null,
  token: '',
  unlocked: false,
  busy: false
};

/* ---------------- 工具 ---------------- */
const $ = id => document.getElementById(id);
function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('等待超时')), ms))]);
}
function b64uToBytes(b64u) {
  return Uint8Array.from(atob(b64u.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}
function bytesToB64u(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randomId() { return bytesToB64u(crypto.getRandomValues(new Uint8Array(9))); }
function pad(n) { return String(n).padStart(2, '0'); }
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fmt(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toast(text, icon = '🍚') {
  const t = $('toast');
  if (!t) { console.log('[toast]', text); return; }
  if ($('toastIcon')) $('toastIcon').textContent = icon;
  if ($('toastText')) $('toastText').textContent = text;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2400);
}
function safeOn(id, type, fn) {
  const el = $(id);
  if (el) el.addEventListener(type, fn);
}
// 安全地显示/隐藏某个元素（元素不存在时不报错）
function showEl(id, on) {
  const el = $(id);
  if (!el) return;
  if (on) el.classList.remove('hide'); else el.classList.add('hide');
}
function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}
function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}
function isSecure() {
  return location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/* ---------------- 云同步（GitHub） ---------------- */
function ghHeaders() {
  const h = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' };
  if (state.token) h.Authorization = `Bearer ${state.token}`;
  return h;
}
// 已知仓库名兜底：即使 config.json 被离线缓存挡住也能工作
const FALLBACK_REPO = 'ALEPH-ad/fan_dian';
function setRepo(name) {
  repoPath = String(name || '').replace(/^\/+|\/+$/g, '');
  API = repoPath ? `https://api.github.com/repos/${repoPath}/contents/${DATA_PATH}` : '';
}
async function loadConfig(force) {
  if (!force && repoPath) return { githubRepo: repoPath };
  let cfg = null;
  try {
    const res = await fetch('config.json?t=' + Date.now(), { cache: 'no-store' });
    if (res.ok) cfg = await res.json();
  } catch (e) { cfg = null; }
  if (cfg && cfg.githubRepo) setRepo(cfg.githubRepo);
  else if (!repoPath) setRepo(FALLBACK_REPO); // 兜底
  return cfg || { githubRepo: repoPath };
}
async function readRemote() {
  await loadConfig();
  if (!API) { renderAll(); return; }
  const r = await fetch(`${API}?t=${Date.now()}`, { headers: ghHeaders(), cache: 'no-store' });
  if (r.status === 404) { state.data = clone(DEFAULTS); state.sha = null; renderAll(); return; }
  if (!r.ok) throw new Error(`读取 data.json 失败（${r.status}）`);
  const j = await r.json();
  let data;
  try { data = JSON.parse(decodeURIComponent(escape(atob(j.content.replace(/\s/g, ''))))); } catch { data = clone(DEFAULTS); }
  data.subs = data.subs || [];
  data.prefs = Object.assign(clone(DEFAULTS.prefs), data.prefs || {});
  data.fired = data.fired || {};
  state.data = data;
  state.sha = j.sha;
  renderAll();
}
async function writeRemote(message = '更新订阅/设置') {
  await loadConfig();
  if (!API) throw new Error('还没配置仓库路径（config.json 里的 githubRepo）');
  if (!state.token) throw new Error('需要 GitHub Token 才能写入（点「连接仓库」）');
  if (state.busy) throw new Error('正在同步，请稍等');
  state.busy = true;
  try {
    // 重新取一次 sha，减少冲突
    try { await readRemote(); } catch {}
    const body = {
      message: `fan-dian: ${message}`,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(state.data, null, 2)))),
      branch: 'main'
    };
    if (state.sha) body.sha = state.sha;
    const r = await fetch(API, { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      const hint = r.status === 401 ? '令牌无效或已过期' : r.status === 403 ? '令牌没有 repo 权限，或权限不足' : r.status === 409 ? '文件刚被别人改过，请再点一次' : '';
      throw new Error(`写入失败（${r.status}${hint ? '：' + hint : ''}${j.message ? ' · ' + j.message : ''}）`);
    }
    const j = await r.json();
    state.sha = j.content && j.content.sha;
    state.unlocked = true;
    localStorage.setItem('fd_push_token', state.token);
    renderSync();
  } finally {
    state.busy = false;
  }
}

/* ---------------- 订阅 ---------------- */
async function currentSubscription() {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}
function mySub() {
  const mine = localStorage.getItem('fd_push_sub');
  if (!mine) return null;
  return state.data.subs.find(s => s.id === mine) || null;
}
/* 最近一次订阅错误，界面上可以原样显示出来，方便排查 */
let lastSubError = '';

async function enablePush() {
  if (!isSecure()) { toast('请用 https 地址打开，file:// 无法收推送', '⚠️'); return; }
  const cfg = (await loadConfig()) || { githubRepo: repoPath };
  let vapid = cfg.vapidPublicKey;
  if (!vapid) {
    const again = await fetch('config.json', { cache: 'no-store' }).then(r => r.json()).catch(() => ({}));
    vapid = again.vapidPublicKey;
  }
  if (!repoPath || !vapid) {
    toast('还没配置仓库和推送密钥', '⚠️');
    showEl('notDeployedCard', true);
    return;
  }
  if (isIOS() && !isStandalone()) {
    showIOS();
    return;
  }
  if (!('Notification' in window)) { toast('这个浏览器不支持通知', '⚠️'); return; }
  // 先确保 Service Worker 就绪（手机首次打开时它可能还在安装）
  let reg = null;
  try {
    reg = await withTimeout(navigator.serviceWorker.ready, 8000);
  } catch (e) {
    try { await navigator.serviceWorker.register('sw.js'); reg = await withTimeout(navigator.serviceWorker.ready, 8000); }
    catch (e2) { lastSubError = 'Service Worker 未就绪：' + (e2.message || e2); }
  }
  if (!reg || !reg.pushManager) {
    lastSubError = lastSubError || 'Service Worker 未就绪，请刷新页面重试';
    showSubError();
    return;
  }
  // 再申请通知权限（必须在点了按钮之后、用户手势里调用）
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('通知被拒绝了，请到浏览器设置里允许本站通知', '⚠️'); return; }
  const reg2 = reg;
  if (!reg2 || !reg2.pushManager) {
    lastSubError = '浏览器不支持推送（缺少 pushManager）';
    showSubError();
    return;
  }

  let sub = await reg2.pushManager.getSubscription();
  if (!sub) {
    const cleaned = String(vapid).replace(/=+$/, '');
    try {
      sub = await reg2.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64uToBytes(cleaned)
      });
    } catch (e) {
      lastSubError = '订阅失败：' + (e.message || e);
      try {
        const old = await reg2.pushManager.getSubscription();
        if (old) await old.unsubscribe();
        sub = await reg2.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(cleaned) });
        lastSubError = '';
      } catch (e2) {
        lastSubError += ' / 重试：' + (e2.message || e2);
        showSubError();
        return;
      }
    }
  }
  const j = sub.toJSON();
  const old = mySub();
  const rec = {
    id: old ? old.id : randomId(),
    endpoint: j.endpoint,
    keys: j.keys,
    ua: (navigator.userAgent || '').slice(0, 120),
    days: old ? old.days : [0, 1, 2, 3, 4, 5, 6],
    created: old ? old.created : Date.now()
  };
  state.data.subs = state.data.subs.filter(s => s.id !== rec.id && s.endpoint !== rec.endpoint);
  state.data.subs.push(rec);
  localStorage.setItem('fd_push_sub', rec.id);
  lastSubError = '';

  // 先叫用户在本机点一下确认通知可用（跟云端无关）
  try {
    await (reg2.showNotification ? reg2.showNotification('🔔 已开启推送', {
      body: '这是本机测试。到饭点会像这样提醒你：午饭别吃膨化、别吃涨肚。',
      tag: 'fan-dian-enabled',
      icon: 'icon-192.png',
      badge: 'badge-72.png',
      vibrate: [150, 60, 150]
    }) : Promise.resolve());
  } catch (e) {}
  renderAll();
  toast('本机通知已开启，正在上传到云端…', '🔔');

  try {
    await writeRemote('登记推送订阅');
    renderAll();
    toast('云端也登记好了！点「测试真推送」验证', '🎉');
  } catch (e) {
    showUnlock(String(e.message || e));
    renderAll();
  }
}

function showSubError() {
  lastSubError = lastSubError || '';
  $('subError').textContent = lastSubError;
  showEl('subError', !!lastSubError);
  if (lastSubError) toast('开启推送失败：' + lastSubError.slice(0, 80), '⚠️');
}

async function disablePush() {
  try {
    const sub = await currentSubscription();
    if (sub) await sub.unsubscribe();
  } catch {}
  const id = localStorage.getItem('fd_push_sub');
  if (id) {
    state.data.subs = state.data.subs.filter(s => s.id !== id);
    localStorage.removeItem('fd_push_sub');
    try { await writeRemote('取消推送订阅'); } catch (e) { showUnlock(String(e.message || e)); }
  }
  renderAll();
  toast('已关闭推送', '🔕');
}

function testWebPush() {
  const id = localStorage.getItem('fd_push_sub');
  const sub = id && state.data.subs.find(s => s.id === id);
  if (!sub) { toast('请先开启推送', '⚠️'); return; }
  sub.test = Date.now();
  // 保存到云端的“测试标记”，GitHub Actions 5 分钟内会看到它并立刻推一条测试
  writeRemote('测试推送')
    .then(() => {
      toast('测试已排队，5 分钟内到达（可直接锁屏看）', '🧪');
      $('subError').textContent = '';
      showEl('subError', false);
    })
    .catch(e => {
      $('subError').textContent = '测试推送登记失败：' + (e.message || e);
      showEl('subError', true);
      showUnlock(String(e.message || e));
    });
}

async function sendLocalTest() {
  const reg = await navigator.serviceWorker.ready;
  const now = new Date();
  await reg.showNotification('🧪 测试提醒', {
    body: '现在 ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + '，到饭点我会这样叫你：\n午饭吃七八分就好，肉和菜多一点。\n雷区：薯片、虾条、锅巴 —— 会涨肚，别买。',
    tag: 'fan-dian-test',
    icon: 'icon-192.png',
    badge: 'badge-72.png',
    vibrate: [160, 70, 160, 70, 320],
    data: { url: './', ts: Date.now() }
  });
  toast('如果看到通知，说明通知权限正常', '🧪');
}

/* ---------------- 界面渲染 ---------------- */
function renderBell() {
  const id = localStorage.getItem('fd_push_sub');
  const mine = id && state.data.subs.find(s => s.id === id);
  var bellEl = $('bell'); if (bellEl) bellEl.classList.toggle('on', !!mine);
  $('bellState').textContent = mine ? '已开启 · 手机系统会自动提醒' : '未开启 · 点下面开启';
  $('enableBtn').hidden = !!mine;
  $('disableBtn').hidden = !mine;
  $('testBtn').hidden = !mine;
  $('permPill').textContent = ('Notification' in window) ? ({ granted: '已允许', denied: '已拒绝', default: '待允许' }[Notification.permission] || '') : '不支持';
  $('permPill').className = 'pill ' + (('Notification' in window) && Notification.permission === 'granted' ? 'ok' : '');
  // 手机已装成 App 且通知已允许 → iPhone 提示卡片就不用再显示了
  const ready = isStandalone() && ('Notification' in window) && Notification.permission === 'granted';
  showEl('iosCard', !ready);
  if (!isSecure()) showEl('insecureCard', true);
  if (!API) showEl('notDeployedCard', true);
}

function renderSync() {
  const s = $('syncState');
  if (state.token) {
    setText('syncState', `已连接 ${repoPath || '（未配置仓库）'}`);
    if (s) s.className = 'pill ok';
    setText('syncBtn', '重新同步');
  } else {
    setText('syncState', repoPath ? '未连接（需要一次令牌才能保存设置）' : '未配置仓库');
    if (s) s.className = 'pill';
    setText('syncBtn', '连接仓库');
  }
}

function renderSchedule() {
  const p = state.data.prefs || {};
  if ($('onSwitch')) $('onSwitch').checked = p.enabled !== false;
  if ($('nameSwitch')) $('nameSwitch').checked = p.nameBad !== false;
  const times = p.times || ['07:30', '11:45', '17:45'];
  const meals = ['🌅 早饭', '☀️ 午饭', '🌙 晚饭'];
  const box = $('times');
  if (box) {
    box.innerHTML = meals.map((m, i) => `
      <div class="time-row">
        <span class="meal">${m}</span>
        <input type="time" data-t="${i}" value="${times[i] || '07:30'}">
      </div>`).join('');
    box.querySelectorAll('input[type=time]').forEach(inp => {
      inp.addEventListener('change', () => {
        const i = Number(inp.dataset.t);
        if (!inp.value) return;
        state.data.prefs.times[i] = inp.value;
        savePrefs('改饭点时间');
      });
    });
  }
  ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].forEach((d, i) => {
    const el = $('day-' + d);
    if (!el) return;
    el.classList.toggle('on', (p.days || [0, 1, 2, 3, 4, 5, 6]).includes(i));
  });
  const winBox = $('windowSeg');
  if (winBox) winBox.querySelectorAll('button').forEach(b => b.classList.toggle('on', Number(b.dataset.win) === p.window));
}

function renderWire() {
  const today = todayKey();
  const fired = state.data.fired || {};
  const sent = [0, 1, 2].some(i => fired[`${today}|${i}`]);
  createWire($('wire'), { sent: sent });
}

function renderTheme() {
  const t = state.data.prefs.theme || 'terracotta';
  document.documentElement.setAttribute('data-theme', t);
  document.querySelectorAll('#themes button').forEach(b => b.classList.toggle('on', b.dataset.theme === t));
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
}

function renderSubs() {
  const id = localStorage.getItem('fd_push_sub');
  $('subsCount').textContent = `${state.data.subs.length} 台设备已登记`;
  $('subsList').innerHTML = state.data.subs.length ? state.data.subs.map((s, i) => {
    const isMine = s.id === id;
    return `<div class="sub ${isMine ? 'mine' : ''}">
      <div><b>${isMine ? '📱 这台手机' : '🖥 其他设备'}</b><div class="hint">${new Date(s.created || Date.now()).toLocaleDateString()} 登记${s.test ? ' · 有测试待发' : ''}</div></div>
      <button class="x" data-del="${i}" aria-label="移除">×</button>
    </div>`;
  }).join('') : '<div class="empty">还没有设备</div>';
  $('subsList').querySelectorAll('button[data-del]').forEach(b => b.addEventListener('click', () => {
    state.data.subs.splice(Number(b.dataset.del), 1);
    savePrefs('移除设备');
  }));
}

function renderAll() {
  renderBell();
  renderSync();
  renderSchedule();
  renderTheme();
  renderSubs();
  renderWire();
}
async function savePrefs(what) {
  try {
    await writeRemote(what || '改设置');
    toast('已同步 ✓', '☁️');
  } catch (e) {
    showUnlock(String(e.message || e));
  }
  renderAll();
}

/* ---------------- 解锁 / iOS 提示 ---------------- */
function showUnlock(msg) {
  showEl('unlockCard', true);
  setText('unlockMsg', msg || '云同步需要一次 GitHub Token（只保存在本机），之后不再打扰。');
  renderSync();
}
function showIOS() {
  const _s1 = $('unlockSheet'); if (_s1) _s1.classList.add('show');
  setText('iosTitle', 'iPhone 需要先「添加到主屏幕」');
  if ($('iosSteps')) $('iosSteps').innerHTML = `
    <li>用 Safari 打开本页 → 点底部「分享」→ 选「添加到主屏幕」。</li>
    <li>从桌面图标打开本页（不是 Safari 里）。</li>
    <li>再点「开启推送」并允许通知。</li>
    <li>之后就算 App 完全关掉、锁屏，到饭点也会弹通知（需 iOS 16.4 及以上）。</li>`;
  const _s2 = $('unlockSheet'); if (_s2) _s2.classList.remove('hide');
  showEl('iosCard', true);
}

/* ---------------- 启动 ---------------- */
async function init() {
  state.token = localStorage.getItem('fd_push_token') || '';
  renderTheme();
  if (state.token) state.unlocked = true;
  // 先把当前仓库名读出来（config.json），后面所有按钮才能工作
  try { await loadConfig(); } catch (e) {}

  if ('serviceWorker' in navigator && isSecure()) {
    try { await navigator.serviceWorker.register('sw.js'); } catch (e) { console.warn(e); }
  }

  // 读取云端设置失败不应阻塞界面
  try { await withTimeout(readRemote(), 10000); } catch (e) {
    $('subError').textContent = '读取云端设置失败：' + (e.message || e) + '（不影响手机通知）';
    showEl('subError', true);
  }
  renderAll();

  // 订阅按钮
  safeOn('enableBtn', 'click', () => withSpinner($('enableBtn'), '正在开启…', enablePush));
  safeOn('disableBtn', 'click', () => withSpinner($('disableBtn'), '正在关闭…', disablePush));
  safeOn('testBtn', 'click', sendLocalTest);
  safeOn('webPushTestBtn', 'click', () => withSpinner($('webPushTestBtn'), '排队中…', async () => { testWebPush(); }));

  // 同步
  safeOn('syncBtn', 'click', () => showUnlock());
  async function checkToken(t) {
    // 只验证令牌身份，不写任何文件
    const r = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${t}`, Accept: 'application/vnd.github+json' }
    });
    if (r.status === 401) throw new Error('令牌无效或已过期（401），请重新生成');
    if (!r.ok) throw new Error('检查令牌失败（' + r.status + '）');
    const j = await r.json().catch(() => ({}));
    return j.login || '';
  }
  safeOn('testTokenBtn', 'click', async () => {
    const t = $('tokenInput').value.trim();
    if (!t) { $('unlockMsg').textContent = '请先在上面的框里粘贴令牌'; return; }
    if (!/^gh[ps]_/.test(t)) { $('unlockMsg').textContent = '这串看着不像 GitHub 令牌（应该以 ghp_ 或 ghs_ 开头）'; return; }
    try {
      const who = await checkToken(t);
      $('unlockMsg').textContent = '✅ 令牌有效' + (who ? '，属于账号 ' + who : '') + '。现在点「保存并同步」即可。';
    } catch (e) { $('unlockMsg').textContent = '❌ ' + (e.message || e); }
  });
  safeOn('saveToken', 'click', async () => {
    const t = $('tokenInput').value.trim();
    if (!t) { $('unlockMsg').textContent = '请先在上面的框里粘贴令牌'; return; }
    if (!/^gh[ps]_/.test(t)) { $('unlockMsg').textContent = '这串看着不像 GitHub 令牌（应该以 ghp_ 或 ghs_ 开头）'; return; }
    const btn = $('saveToken');
    btn.disabled = true; const oldLabel = btn.textContent; btn.textContent = '正在同步…';
    state.token = t;
    try {
      await checkToken(t);
      await writeRemote('连接仓库');
      localStorage.setItem('fd_push_token', t);
      showEl('unlockCard', false);
      showEl('subError', false);
      toast('连接成功，以后自动同步 ✓', '☁️');
    } catch (e) {
      $('unlockMsg').textContent = '❌ 同步失败：' + String(e.message || e) + '（令牌先不保存，修好后重试）';
    } finally {
      btn.disabled = false; btn.textContent = oldLabel;
      renderAll();
    }
  });

  // 开关
  safeOn('onSwitch', 'change', e => { state.data.prefs.enabled = e.target.checked; savePrefs(e.target.checked ? '开启提醒' : '暂停提醒'); });
  safeOn('windowSeg', 'click', e => {
    const b = e.target.closest('button'); if (!b) return;
    state.data.prefs.window = Number(b.dataset.win); savePrefs('改提醒持续时长');
  });
  document.querySelectorAll('.days').forEach(row => row.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const d = Number(b.dataset.day);
    const p = state.data.prefs;
    p.days = p.days || [0, 1, 2, 3, 4, 5, 6];
    p.days = p.days.includes(d) ? p.days.filter(x => x !== d) : [...p.days, d].sort();
    b.classList.toggle('on');
    savePrefs('改提醒日');
  }));
  safeOn('themes', 'click', e => {
    const b = e.target.closest('button'); if (!b) return;
    state.data.prefs.theme = b.dataset.theme;
    renderTheme();
    savePrefs('更换主题');
  });
  safeOn('nameSwitch', 'change', e => { state.data.prefs.nameBad = e.target.checked; savePrefs('改文案'); });

  // iOS 提示
  safeOn('iosClose', 'click', () => showEl('unlockSheet', false));
  safeOn('iosGotIt', 'click', () => showEl('unlockSheet', false));
  safeOn('iosCardBtn', 'click', showIOS);
  showEl('iosCard', false);

  setInterval(() => { $('clock').textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false }); }, 1000);
  $('clock').textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false });

  // 回到前台时同步一次（可能别的设备改过）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && API) readRemote().catch(() => {});
  });
}

function withSpinner(btn, label, fn) {
  const old = btn.textContent;
  btn.disabled = true; btn.textContent = label;
  Promise.resolve().then(fn).catch(e => { toast(String(e.message || e), '⚠️'); }).finally(() => { btn.disabled = false; btn.textContent = old; });
}

init();
