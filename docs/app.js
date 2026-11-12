import { createWire } from './wire.js';

const repoPath = (window.__FD_REPO__ || '').replace(/^\/+|\/+$/g, '');
const DATA_PATH = 'data.json';
const API = repoPath ? `https://api.github.com/repos/${repoPath}/contents/${DATA_PATH}` : '';

const DEFAULTS = {
  subs: [],
  prefs: { enabled: true, window: 60, times: ['07:30', '11:45', '17:45'], days: [0, 1, 2, 3, 4, 5, 6], theme: 'terracotta', nameBad: true },
  fired: {}
};

const state = {
  data: structuredClone(DEFAULTS),
  sha: null,
  token: '',
  unlocked: false,
  busy: false
};

/* ---------------- 工具 ---------------- */
const $ = id => document.getElementById(id);
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
  $('toastIcon').textContent = icon;
  $('toastText').textContent = text;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2400);
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
async function readRemote() {
  if (!API) { renderAll(); return; }
  const r = await fetch(`${API}?t=${Date.now()}`, { headers: ghHeaders() });
  if (r.status === 404) { state.data = structuredClone(DEFAULTS); state.sha = null; renderAll(); return; }
  if (!r.ok) throw new Error(`读取 data.json 失败（${r.status}）`);
  const j = await r.json();
  let data;
  try { data = JSON.parse(decodeURIComponent(escape(atob(j.content.replace(/\s/g, ''))))); } catch { data = structuredClone(DEFAULTS); }
  data.subs = data.subs || [];
  data.prefs = Object.assign(structuredClone(DEFAULTS.prefs), data.prefs || {});
  data.fired = data.fired || {};
  state.data = data;
  state.sha = j.sha;
  renderAll();
}
async function writeRemote(message = '更新订阅/设置') {
  if (!API) throw new Error('还没配置仓库路径');
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
      throw new Error(`写入失败（${r.status}${j.message ? ' ' + j.message : ''}）`);
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
async function enablePush() {
  if (!isSecure()) { toast('请用 https 地址打开，file:// 无法收推送', '⚠️'); return; }
  const cfg = await fetch('config.json', { cache: 'no-store' }).then(r => r.json()).catch(() => ({}));
  if (!cfg.githubRepo || !cfg.vapidPublicKey) {
    toast('还没配置仓库和推送密钥，先看 部署步骤.md 第 2 步', '⚠️');
    $('notDeployedCard').classList.remove('hide');
    return;
  }
  if (isIOS() && !isStandalone()) {
    showIOS();
    return;
  }
  if (!('Notification' in window)) { toast('这个浏览器不支持通知', '⚠️'); return; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('通知被拒绝了，请到浏览器设置里允许本站通知', '⚠️'); return; }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const cleaned = cfg.vapidPublicKey.replace(/=+$/, '');
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64uToBytes(cleaned)
      });
    } catch (e) {
      // 换了公钥：旧订阅失效，退订后重来
      const old = await reg.pushManager.getSubscription();
      if (old) { await old.unsubscribe(); }
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(cleaned) });
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
  try {
    await writeRemote('登记推送订阅');
  } catch (e) {
    showUnlock(String(e.message || e));
    renderAll();
    return;
  }
  renderAll();
  toast('已开启！到饭点手机会自己响', '🔔');
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
  // GitHub Actions 5 分钟内会看到 test 标记并立即推送
  sub.test = Date.now();
  writeRemote('测试推送').then(() => toast('测试已排队，5 分钟内到达', '🧪')).catch(e => showUnlock(String(e.message || e)));
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
  $('bell').classList.toggle('on', !!mine);
  $('bellState').textContent = mine ? '已开启 · 手机系统会自动提醒' : '未开启 · 点下面开启';
  $('enableBtn').hidden = !!mine;
  $('disableBtn').hidden = !mine;
  $('testBtn').hidden = !mine;
  $('permPill').textContent = ('Notification' in window) ? ({ granted: '已允许', denied: '已拒绝', default: '待允许' }[Notification.permission] || '') : '不支持';
  $('permPill').className = 'pill ' + (('Notification' in window) && Notification.permission === 'granted' ? 'ok' : '');
  // 手机已装成 App 且通知已允许 → iPhone 提示卡片就不用再显示了
  const ready = isStandalone() && ('Notification' in window) && Notification.permission === 'granted';
  $('iosCard').classList.toggle('hide', ready);
  if (!isSecure()) $('insecureCard').classList.remove('hide');
  if (!API) $('notDeployedCard').classList.remove('hide');
}

function renderSync() {
  if (state.token) {
    $('syncState').textContent = `已连接 ${repoPath || '（未配置仓库）'}`;
    $('syncState').className = 'pill ok';
    $('syncBtn').textContent = '重新同步';
  } else {
    $('syncState').textContent = '未连接（本机预览）';
    $('syncState').className = 'pill';
    $('syncBtn').textContent = '连接仓库';
  }
}

function renderSchedule() {
  const p = state.data.prefs;
  $('onSwitch').checked = p.enabled !== false;
  $('nameSwitch').checked = p.nameBad !== false;
  const meals = ['🌅 早饭', '☀️ 午饭', '🌙 晚饭'];
  $('times').innerHTML = meals.map((m, i) => `
    <div class="time-row">
      <span class="meal">${m}</span>
      <input type="time" data-t="${i}" value="${p.times[i]}">
      <span class="hint" id="days-${i}"></span>
    </div>`).join('');
  $('times').querySelectorAll('input[type=time]').forEach(inp => {
    inp.addEventListener('change', () => {
      const i = Number(inp.dataset.t);
      if (!inp.value) return;
      state.data.prefs.times[i] = inp.value;
      savePrefs('改饭点时间');
    });
  });
  ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].forEach((d, i) => {
    const el = $('day-' + d);
    el.classList.toggle('on', (p.days || [0, 1, 2, 3, 4, 5, 6]).includes(i));
  });
  const win = $('windowSeg').querySelectorAll('button');
  win.forEach(b => b.classList.toggle('on', Number(b.dataset.win) === p.window));
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
  $('unlockCard').classList.remove('hide');
  $('unlockMsg').textContent = msg || '云同步需要一次 GitHub Token（只保存在本机），之后不再打扰。';
  renderSync();
}
function showIOS() {
  $('unlockSheet').classList.add('show');
  $('iosTitle').textContent = 'iPhone 需要先「添加到主屏幕」';
  $('iosSteps').innerHTML = `
    <li>用 Safari 打开本页 → 点底部「分享」→ 选「添加到主屏幕」。</li>
    <li>从桌面图标打开本页（不是 Safari 里）。</li>
    <li>再点「开启推送」并允许通知。</li>
    <li>之后就算 App 完全关掉、锁屏，到饭点也会弹通知（需 iOS 16.4 及以上）。</li>`;
  $('unlockSheet').classList.remove('hide');
  $('iosCard').classList.remove('hide');
}

/* ---------------- 启动 ---------------- */
async function init() {
  state.token = localStorage.getItem('fd_push_token') || '';
  renderTheme();

  if ('serviceWorker' in navigator && isSecure()) {
    try { await navigator.serviceWorker.register('sw.js'); } catch (e) { console.warn(e); }
  }

  try { await readRemote(); } catch (e) { showUnlock('读取云端设置失败：' + e.message); renderAll(); }
  renderAll();

  // 订阅按钮
  $('enableBtn').addEventListener('click', () => withSpinner($('enableBtn'), '正在开启…', enablePush));
  $('disableBtn').addEventListener('click', () => withSpinner($('disableBtn'), '正在关闭…', disablePush));
  $('testBtn').addEventListener('click', sendLocalTest);
  $('webPushTestBtn').addEventListener('click', () => withSpinner($('webPushTestBtn'), '排队中…', async () => { testWebPush(); }));

  // 同步
  $('syncBtn').addEventListener('click', () => showUnlock());
  $('saveToken').addEventListener('click', async () => {
    const t = $('tokenInput').value.trim();
    if (!t) return;
    state.token = t;
    localStorage.setItem('fd_push_token', t);
    try {
      await writeRemote('连接仓库');
      $('unlockCard').classList.add('hide');
      toast('连接成功，以后自动同步 ✓', '☁️');
      renderAll();
    } catch (e) { $('unlockMsg').textContent = '连接失败：' + String(e.message || e); }
  });

  // 开关
  $('onSwitch').addEventListener('change', e => { state.data.prefs.enabled = e.target.checked; savePrefs(e.target.checked ? '开启提醒' : '暂停提醒'); });
  $('windowSeg').addEventListener('click', e => {
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
  $('themes').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    state.data.prefs.theme = b.dataset.theme;
    renderTheme();
    savePrefs('更换主题');
  });
  $('nameSwitch').addEventListener('change', e => { state.data.prefs.nameBad = e.target.checked; savePrefs('改文案'); });

  // iOS 提示
  $('iosClose').addEventListener('click', () => $('unlockSheet').classList.remove('show'));
  $('iosGotIt').addEventListener('click', () => $('unlockSheet').classList.remove('show'));
  $('iosCardBtn').addEventListener('click', showIOS);
  $('iosCard').classList.add('hide');

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
